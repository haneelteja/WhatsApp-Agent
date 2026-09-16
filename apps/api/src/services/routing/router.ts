import type { FastifyBaseLogger } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { WhatsAppGateway } from '../whatsapp/gateway.js';
import { chatCompletion } from '../../lib/anthropic.js';
import { cacheGet, cacheSet, cacheDel } from '../../lib/redis.js';

const ROUTING_TTL = 86_400; // 24 h in seconds
const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

export interface RoutingConfig {
  greeting?:             string;
  general_question?:     string;
  menu_intro?:           string;
  confidence_threshold?: number;
  menu_labels?:          Partial<Record<string, string>>;
}

// Cumulative plan hierarchy — higher tier unlocks all below it
const PLAN_BOTS: Record<string, string[]> = {
  starter:  ['support_bot'],
  growth:   ['support_bot', 'sales_bot'],
  scale:    ['support_bot', 'appointment_bot', 'sales_bot', 'lifecycle_bot'],
};

const DEFAULT_MENU_LABELS: Record<string, string> = {
  support_bot:     'Customer Support',
  sales_bot:       'Products & Sales',
  appointment_bot: 'Book an Appointment',
  lifecycle_bot:   'My Orders & Account',
};

const SWITCH_KEYWORDS = ['menu', 'switch', '0'];

type RoutingState = 'awaiting_name' | 'awaiting_intent' | 'awaiting_menu' | 'routed';

export type RoutingResult =
  | { handled: true }                         // routing consumed the message — don't call handleWebhookPost
  | { handled: false; productType: string };  // route to this bot via handleWebhookPost

function stateKey(tenantId: string, phone: string): string {
  return `routing:${tenantId}:${phone}:state`;
}

function botKey(tenantId: string, phone: string): string {
  return `routing:${tenantId}:${phone}:bot`;
}

async function classifyIntent(
  message: string,
  availableBots: string[],
): Promise<{ bot: string; confidence: number } | null> {
  const descriptions: Record<string, string> = {
    support_bot:     'Support Bot — customer support, FAQs, troubleshooting, general help',
    sales_bot:       'Sales Bot — products, pricing, quotes, bulk orders, buying intent',
    appointment_bot: 'Appointment Bot — booking, scheduling, reminders, availability',
    lifecycle_bot:   'Lifecycle Bot — orders, invoices, payments, delivery, account management',
  };

  const botList = availableBots
    .map(b => `- ${b}: ${descriptions[b] ?? b}`)
    .join('\n');

  const system = `You are an intent classifier for a WhatsApp business assistant. Given a customer message, decide which bot should handle it. Return ONLY valid JSON with no markdown: {"bot": "<bot_slug>", "confidence": <0.0-1.0>}

Available bots:
${botList}

Confidence guide: 1.0 = perfectly clear intent, 0.75 = reasonably clear, 0.5 = ambiguous, 0.25 = very unclear.`;

  try {
    const { content } = await chatCompletion({
      model:      CLASSIFIER_MODEL,
      messages:   [{ role: 'user', content: message }],
      system,
      max_tokens: 80,
    });

    const trimmed = content.trim().replace(/^```json\s*|```\s*$/g, '');
    const parsed = JSON.parse(trimmed) as { bot: string; confidence: number };

    if (!availableBots.includes(parsed.bot)) return null;
    return { bot: parsed.bot, confidence: Number(parsed.confidence) };
  } catch {
    return null;
  }
}

function buildMenuText(
  availableBots: string[],
  menuLabels: Record<string, string>,
  intro: string,
): string {
  const items = availableBots.map((b, i) =>
    `${i + 1}. ${menuLabels[b] ?? DEFAULT_MENU_LABELS[b] ?? b}`,
  );
  return `${intro}\n\n${items.join('\n')}`;
}

export async function resolveMultiBotRouting(params: {
  tenantId:      string;
  phone:         string;           // E.164 format, e.g. "+919..."
  incomingText:  string | null;
  gateway:       WhatsAppGateway;
  config:        { phone_number_id: string; access_token: string };
  routingConfig: RoutingConfig;
  log:           FastifyBaseLogger;
}): Promise<RoutingResult> {
  const { tenantId, phone, incomingText, gateway, config, routingConfig, log } = params;

  const text               = incomingText?.trim() ?? '';
  const threshold          = routingConfig.confidence_threshold ?? 0.75;
  const greeting           = routingConfig.greeting       ?? "Hello! Welcome. I'm your virtual assistant.";
  const generalQ           = routingConfig.general_question ?? 'How can I help you today?';
  const menuIntro          = routingConfig.menu_intro     ?? 'Please choose how I can help you:';
  const menuLabels: Record<string, string> = {
    ...DEFAULT_MENU_LABELS,
    ...(Object.fromEntries(
      Object.entries(routingConfig.menu_labels ?? {}).filter(([, v]) => v !== undefined),
    ) as Record<string, string>),
  };

  // Determine available bots from tenant plan
  const db = getServerClient();
  const { data: tenant } = await db
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single();

  const plan         = (tenant?.plan ?? 'starter') as string;
  const availableBots = PLAN_BOTS[plan] ?? PLAN_BOTS['starter']!;

  // Switch keyword: reset session, show menu
  if (text && SWITCH_KEYWORDS.some(kw => text.toLowerCase() === kw)) {
    await Promise.all([
      cacheDel(stateKey(tenantId, phone)),
      cacheDel(botKey(tenantId, phone)),
    ]);
    const menuText = buildMenuText(availableBots, menuLabels, menuIntro);
    await gateway.sendMessage(config.phone_number_id, config.access_token, {
      type: 'text', to: phone, text: menuText,
    });
    log.info({ tenantId, phone }, '[Routing] switch keyword — showing menu');
    return { handled: true };
  }

  // Load current routing state
  const [state, storedBot] = await Promise.all([
    cacheGet<RoutingState>(stateKey(tenantId, phone)),
    cacheGet<string>(botKey(tenantId, phone)),
  ]);

  // Already routed — pass through to assigned bot
  if (state === 'routed' && storedBot) {
    log.info({ tenantId, phone, bot: storedBot }, '[Routing] already routed');
    return { handled: false, productType: storedBot };
  }

  // Look up contact name
  const phoneNorm = phone.startsWith('+') ? phone : `+${phone}`;
  const { data: contact } = await db
    .from('contacts')
    .select('name')
    .eq('tenant_id', tenantId)
    .eq('phone', phoneNorm)
    .maybeSingle();
  const contactName = (contact?.name ?? '').trim();

  // ── awaiting_name: customer sent their name ──────────────────────────────
  if (state === 'awaiting_name') {
    if (!text) {
      await gateway.sendMessage(config.phone_number_id, config.access_token, {
        type: 'text', to: phone, text: 'Could you please share your name?',
      });
      return { handled: true };
    }

    const name = text.slice(0, 60);
    await db.from('contacts').upsert(
      { tenant_id: tenantId, phone: phoneNorm, name },
      { onConflict: 'tenant_id,phone', ignoreDuplicates: false },
    );

    await gateway.sendMessage(config.phone_number_id, config.access_token, {
      type: 'text', to: phone,
      text: `Thanks ${name}! ${generalQ}`,
    });
    await cacheSet(stateKey(tenantId, phone), 'awaiting_intent', ROUTING_TTL);
    log.info({ tenantId, phone, name }, '[Routing] name saved → awaiting_intent');
    return { handled: true };
  }

  // ── awaiting_menu: customer picks from menu ──────────────────────────────
  if (state === 'awaiting_menu') {
    const numPick = parseInt(text, 10);
    let matchedBot: string | null = null;

    if (!isNaN(numPick) && numPick >= 1 && numPick <= availableBots.length) {
      matchedBot = availableBots[numPick - 1] ?? null;
    } else {
      for (const b of availableBots) {
        const lbl = (menuLabels[b] ?? DEFAULT_MENU_LABELS[b] ?? b).toLowerCase();
        if (text.toLowerCase().includes(lbl.split(' ')[0]!)) {
          matchedBot = b;
          break;
        }
      }
    }

    if (!matchedBot) {
      const menuText = buildMenuText(availableBots, menuLabels, 'Please reply with a number:');
      await gateway.sendMessage(config.phone_number_id, config.access_token, {
        type: 'text', to: phone, text: menuText,
      });
      return { handled: true };
    }

    await Promise.all([
      cacheSet(stateKey(tenantId, phone), 'routed', ROUTING_TTL),
      cacheSet(botKey(tenantId, phone), matchedBot, ROUTING_TTL),
    ]);
    log.info({ tenantId, phone, bot: matchedBot }, '[Routing] menu selection → routed, next message forwarded to bot');
    // Return handled:true — don't forward the menu selection digit ("1"/"2") to the bot.
    // The customer's NEXT natural message will hit the 'routed' branch and go straight to the bot.
    return { handled: true };
  }

  // ── null / awaiting_intent state ─────────────────────────────────────────
  // Handles: fresh new contact, returning contact (expired session), post-name classification

  // New contact — ask for name first
  if (!contactName && state !== 'awaiting_intent') {
    const fullGreeting = `${greeting}\n\nMay I know your name?`;
    await gateway.sendMessage(config.phone_number_id, config.access_token, {
      type: 'text', to: phone, text: fullGreeting,
    });
    await cacheSet(stateKey(tenantId, phone), 'awaiting_name', ROUTING_TTL);
    log.info({ tenantId, phone }, '[Routing] new contact → awaiting_name');
    return { handled: true };
  }

  // Only one bot available — skip classification
  if (availableBots.length === 1) {
    const bot = availableBots[0]!;
    await Promise.all([
      cacheSet(stateKey(tenantId, phone), 'routed', ROUTING_TTL),
      cacheSet(botKey(tenantId, phone), bot, ROUTING_TTL),
    ]);
    return { handled: false, productType: bot };
  }

  // No text (media message) — default to support_bot
  if (!text) {
    const bot = availableBots[0]!;
    await Promise.all([
      cacheSet(stateKey(tenantId, phone), 'routed', ROUTING_TTL),
      cacheSet(botKey(tenantId, phone), bot, ROUTING_TTL),
    ]);
    return { handled: false, productType: bot };
  }

  // Classify intent
  const classification = await classifyIntent(text, availableBots);
  log.info({ tenantId, phone, classification }, '[Routing] intent classification result');

  if (classification && classification.confidence >= threshold) {
    await Promise.all([
      cacheSet(stateKey(tenantId, phone), 'routed', ROUTING_TTL),
      cacheSet(botKey(tenantId, phone), classification.bot, ROUTING_TTL),
    ]);
    log.info({ tenantId, phone, bot: classification.bot }, '[Routing] high confidence → routed');
    return { handled: false, productType: classification.bot };
  }

  // Low confidence — show menu
  const name     = contactName || 'there';
  const menuText = buildMenuText(availableBots, menuLabels, menuIntro);
  await gateway.sendMessage(config.phone_number_id, config.access_token, {
    type: 'text', to: phone,
    text: `Hi ${name}! ${menuText}`,
  });
  await cacheSet(stateKey(tenantId, phone), 'awaiting_menu', ROUTING_TTL);
  log.info({ tenantId, phone }, '[Routing] low confidence → awaiting_menu');
  return { handled: true };
}
