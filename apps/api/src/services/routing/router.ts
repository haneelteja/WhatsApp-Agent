import type { FastifyBaseLogger } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { WhatsAppGateway } from '../whatsapp/gateway.js';
import type { OutgoingMessage } from '@alphabot/shared';
import { chatCompletion } from '../../lib/anthropic.js';
import { cacheGet, cacheSet, cacheDel } from '../../lib/redis.js';

const ROUTING_TTL = 86_400; // 24 h in seconds
const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

export interface BranchLocation {
  name:           string;
  address?:       string;
  latitude:       number;
  longitude:      number;
  phone?:         string;
  hours?:         string;
  access?:        string;  // floor, parking, lift info — e.g. "2nd floor, lift access, mall parking"
  manager_name?:  string;
  manager_phone?: string;  // E.164 — WhatsApp number for lead/booking notifications
}

export interface RoutingConfig {
  greeting?:                   string;
  general_question?:           string;
  menu_intro?:                 string;
  confidence_threshold?:       number;
  menu_labels?:                Partial<Record<string, string>>;
  branches?:                   BranchLocation[];
  /** Hours after first enquiry before a nudge is sent (default: 2) */
  enquiry_followup_hours?:     number;
  /** Message sent by the follow-up nudge; {name} is replaced with contact name */
  enquiry_followup_message?:   string;
}

// Slab hierarchy: activating a higher-tier bot implicitly includes all lower tiers.
// lifecycle_bot → [support_bot, sales_bot, lifecycle_bot]
// sales_bot     → [support_bot, sales_bot]
// support_bot   → [support_bot]
const BOT_TIER_ORDER = ['support_bot', 'sales_bot', 'lifecycle_bot'];
// appointment_bot is a lateral add-on — included if activated, independent of tier level.
const BOT_ADDONS = ['appointment_bot'];

function resolveSlabBots(activated: Set<string>): string[] {
  let highestIdx = -1;
  BOT_TIER_ORDER.forEach((b, i) => { if (activated.has(b)) highestIdx = i; });
  const bots: string[] = highestIdx >= 0
    ? BOT_TIER_ORDER.slice(0, highestIdx + 1)
    : ['support_bot']; // safety fallback — nothing activated yet
  for (const addon of BOT_ADDONS) {
    if (activated.has(addon)) bots.push(addon);
  }
  return bots;
}

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

const BUTTON_TITLE_MAX  = 20;
const LIST_TITLE_MAX    = 24;
const INTERACTIVE_MAX   = 3; // WhatsApp reply-button limit

function buildMenuMessage(
  to: string,
  availableBots: string[],
  menuLabels: Record<string, string>,
  intro: string,
): OutgoingMessage {
  if (availableBots.length <= INTERACTIVE_MAX) {
    return {
      type: 'interactive',
      interactiveType: 'button',
      to,
      body: intro,
      buttons: availableBots.map(b => ({
        type: 'reply' as const,
        reply: {
          id: b,
          title: (menuLabels[b] ?? DEFAULT_MENU_LABELS[b] ?? b).slice(0, BUTTON_TITLE_MAX),
        },
      })),
    };
  }
  return {
    type: 'interactive',
    interactiveType: 'list',
    to,
    body: intro,
    listButtonLabel: 'Choose an option',
    listSections: [{
      title: 'How can we help?',
      rows: availableBots.map(b => ({
        id: b,
        title: (menuLabels[b] ?? DEFAULT_MENU_LABELS[b] ?? b).slice(0, LIST_TITLE_MAX),
      })),
    }],
  };
}

export async function resolveMultiBotRouting(params: {
  tenantId:          string;
  phone:             string;           // E.164 format, e.g. "+919..."
  incomingText:      string | null;
  interactiveReplyId?: string | null;  // bot slug when user tapped a button
  gateway:           WhatsAppGateway;
  config:            { phone_number_id: string; access_token: string };
  routingConfig:     RoutingConfig;
  log:               FastifyBaseLogger;
}): Promise<RoutingResult> {
  const { tenantId, phone, incomingText, interactiveReplyId, gateway, config, routingConfig, log } = params;

  const text               = incomingText?.trim() ?? '';
  const threshold          = routingConfig.confidence_threshold ?? 0.75;
  const greeting           = routingConfig.greeting        ?? "Hello! Welcome. I'm your virtual assistant.";
  const generalQ           = routingConfig.general_question ?? 'How can I help you today?';
  const menuIntroTemplate  = routingConfig.menu_intro      ?? 'Hi {name}! Please choose how I can help you:';
  const menuLabels: Record<string, string> = {
    ...DEFAULT_MENU_LABELS,
    ...(Object.fromEntries(
      Object.entries(routingConfig.menu_labels ?? {}).filter(([, v]) => v !== undefined),
    ) as Record<string, string>),
  };

  // Slab hierarchy: available bots are determined purely by which bots the platform has
  // activated for this tenant — no dependency on billing plan.
  const db = getServerClient();
  const phoneNorm = phone.startsWith('+') ? phone : `+${phone}`;

  const [productsResult, contactResult] = await Promise.all([
    db.from('tenant_products').select('product_type').eq('tenant_id', tenantId).eq('active', true),
    db.from('contacts').select('name').eq('tenant_id', tenantId).eq('phone', phoneNorm).maybeSingle(),
  ]);

  const activated     = new Set((productsResult.data ?? []).map(p => p.product_type as string));
  const availableBots = resolveSlabBots(activated);
  const contactName   = (contactResult.data?.name ?? '').trim();

  const menuIntro = menuIntroTemplate.replace('{name}', contactName || 'there');

  // Switch keyword: show menu and put session into awaiting_menu so the
  // customer's next reply ("1", "2") is handled by the menu picker, not intent classifier.
  if (text && SWITCH_KEYWORDS.some(kw => text.toLowerCase() === kw)) {
    await Promise.all([
      gateway.sendMessage(config.phone_number_id, config.access_token,
        buildMenuMessage(phone, availableBots, menuLabels, menuIntro)),
      cacheSet(stateKey(tenantId, phone), 'awaiting_menu', ROUTING_TTL),
      cacheDel(botKey(tenantId, phone)),
    ]);
    log.info({ tenantId, phone }, '[Routing] switch keyword — showing menu → awaiting_menu');
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
    let matchedBot: string | null = null;

    // Interactive button/list tap gives us the bot slug directly
    if (interactiveReplyId && availableBots.includes(interactiveReplyId)) {
      matchedBot = interactiveReplyId;
    }

    if (!matchedBot) {
      const numPick = parseInt(text, 10);
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
    }

    if (!matchedBot) {
      await gateway.sendMessage(config.phone_number_id, config.access_token,
        buildMenuMessage(phone, availableBots, menuLabels, menuIntro));
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
  await Promise.all([
    gateway.sendMessage(config.phone_number_id, config.access_token,
      buildMenuMessage(phone, availableBots, menuLabels, menuIntro)),
    cacheSet(stateKey(tenantId, phone), 'awaiting_menu', ROUTING_TTL),
  ]);
  log.info({ tenantId, phone }, '[Routing] low confidence → awaiting_menu');
  return { handled: true };
}
