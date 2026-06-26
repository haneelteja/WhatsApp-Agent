import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import type { BotConfig, Contact, Conversation, LayeredGuardrailsConfig, PlatformGuardrails, Product, ProductType, WhatsAppProvider } from '@alphabot/shared';
import { WhatsAppGateway } from '../../services/whatsapp/gateway.js';
import { getAIResponse } from '../../services/ai/claude.js';
import { lookupKB } from '../../services/kb/lookup.js';
import { escalateConversation } from '../../services/escalation/index.js';
import { detectAndStoreSentiment } from '../../services/sentiment/detector.js';
import { checkTokenQuota } from '../../services/ai/token-quota.js';
import { assembleHistory } from '../../services/ai/history-assembler.js';

// Default system prompts used only when no bot_config row exists yet
const SALES_LEAD_INSTRUCTION = `

SALES LEAD DETECTION: If the customer shows clear buying intent — such as requesting a quote, specifying a product + quantity + location, asking about bulk pricing, or expressing readiness to place an order — append the exact text [SALES_LEAD] on a new line at the very end of your response. IMPORTANT: Always write a full, helpful reply first, then append [SALES_LEAD] on the last line. Never respond with ONLY the tag. Do not explain the tag. Only use it when buying intent is clear and specific — never for greetings, general questions, or vague enquiries.`;

const DEFAULT_SYSTEM_PROMPTS: Record<ProductType, string> = {
  support_bot: `You are a helpful customer support assistant. Answer questions accurately using the knowledge base. If you cannot confidently answer, say so and offer to escalate to a human agent. Be concise, friendly, and professional.`,
  sales_bot: `You are a sales assistant. Understand customer needs, share relevant product information, and guide warm leads toward a purchase decision. Detect buying intent and hand off to a human when the customer is ready to buy.`,
  lifecycle_bot: `You are an onboarding and account management assistant. Help customers track their orders, answer invoicing questions, and collect payments. Be proactive and professional.`,
};

// Default keywords that trigger escalation (overridden by bot_config.escalation_triggers)
const DEFAULT_ESCALATION_TRIGGERS = [
  'speak to human', 'talk to agent', 'human please', 'escalate',
  'complaint', 'refund', 'dispute', 'urgent', 'angry',
];

// Default confidence threshold (overridden by bot_config.confidence_threshold)
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

/** Returns a human-readable language name if the text contains non-Latin scripts. */
function detectLanguageHint(text: string): string | null {
  if (/[ऀ-ॿ]/.test(text)) return 'Hindi (Devanagari script)';
  if (/[ఀ-౿]/.test(text)) return 'Telugu';
  if (/[஀-௿]/.test(text)) return 'Tamil';
  if (/[ಀ-೿]/.test(text)) return 'Kannada';
  if (/[઀-૿]/.test(text)) return 'Gujarati';
  if (/[਀-੿]/.test(text)) return 'Punjabi (Gurmukhi script)';
  if (/[଀-୿]/.test(text)) return 'Odia';
  if (/[؀-ۿ]/.test(text)) return 'Arabic';
  if (/[一-鿿]/.test(text)) return 'Chinese';
  return null;
}

// ─── Status ladder for delivery receipts ─────────────────────────────────────
// Only accept updates that move the status forward (sent→delivered→read).
// `failed` is always accepted regardless of current status.
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

async function applyDeliveryStatusUpdates(
  db: ReturnType<typeof import('@alphabot/database').getServerClient>,
  updates: import('@alphabot/shared').DeliveryStatusUpdate[],
): Promise<void> {
  for (const update of updates) {
    if (!update.messageId) continue;

    const { data: msg } = await db
      .from('messages')
      .select('id, delivery_status')
      .eq('whatsapp_msg_id', update.messageId)
      .maybeSingle();

    if (!msg) continue; // Not a message we sent

    const currentRank = STATUS_RANK[(msg as { delivery_status: string | null }).delivery_status ?? ''] ?? 0;
    const newRank     = update.status === 'failed' ? 999 : (STATUS_RANK[update.status] ?? 0);

    if (newRank > currentRank) {
      await db.from('messages')
        .update({ delivery_status: update.status })
        .eq('id', (msg as { id: string }).id);
    }
  }
}

/** Build a context suffix appended to escalation reason notes (stage + captured entities). */
function buildEscalationContext(stage: string, aiVars: Record<string, string>): string {
  const parts: string[] = [];
  if (stage && stage !== 'greeting') parts.push(`stage: ${stage}`);
  const pairs = Object.entries(aiVars);
  if (pairs.length > 0) parts.push(pairs.map(([k, v]) => `${k}=${v}`).join(', '));
  return parts.length > 0 ? ` [${parts.join(' | ')}]` : '';
}

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET: Meta webhook verification ─────────────────────────────────────
  fastify.get<{ Querystring: Record<string, string> }>('/:tenantId/:productType', async (request, reply) => {
    const { tenantId, productType } = request.params as {
      tenantId: string;
      productType: ProductType;
    };

    // Fetch the tenant's WhatsApp config to get the verify token
    // Only Meta Cloud uses hub.challenge GET verification; filter by provider to avoid
    // returning a Twilio number's config when multiple numbers share the same product_slug.
    const db = getServerClient();
    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', tenantId)
      .eq('product_slug', productType)
      .eq('provider', 'meta_cloud')
      .eq('active', true)
      .limit(1)
      .single();

    if (!wn) {
      return reply.status(404).send('Tenant not found');
    }

    const config = wn.config_json as { verify_token: string };
    const gateway = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    const challenge = gateway.verifyWebhook(request.query, config.verify_token);

    if (challenge === false) {
      return reply.status(403).send('Verification failed');
    }
    return reply.status(200).send(challenge);
  });

  // ─── POST: Receive incoming WhatsApp messages ────────────────────────────
  fastify.post<{ Body: unknown }>('/:tenantId/:productType', async (request, reply) => {
    // Always respond 200 immediately — Meta/Twilio retries on non-2xx.
    // Must be empty or TwiML (Twilio error 12300 fires on JSON responses).
    reply.status(200).type('text/plain').send('');

    const { tenantId, productType } = request.params as {
      tenantId: string;
      productType: ProductType;
    };

    try {

    const db = getServerClient();
    fastify.log.info({ tenantId, productType }, '[Webhook] processing message');

    // Infer provider from payload shape so we look up the right whatsapp_numbers row
    // (a tenant may have both a Twilio and a Meta Cloud number under the same product_slug)
    const body = request.body as Record<string, unknown>;
    const inferredProvider =
      body?.object === 'whatsapp_business_account' ? 'meta_cloud' : 'twilio';

    // Load all 4 guardrail layers + 4 LLM config levels in parallel with WhatsApp config + bot config
    const [wnRes, tenantRes, botConfigRes, platformSettingsRes, botTypeGuardrailsRes, tenantGuardrailsRes, llmConfigsRes] = await Promise.all([
      db.from('whatsapp_numbers')
        .select('config_json, provider')
        .eq('tenant_id', tenantId)
        .eq('product_slug', productType)
        .eq('provider', inferredProvider)
        .eq('active', true)
        .limit(1)
        .single(),
      db.from('tenants')
        .select('plan, status')
        .eq('id', tenantId)
        .single(),
      db.from('bot_configs')
        .select('*, product:products(default_prompt, default_model)')
        .eq('tenant_id', tenantId)
        .eq('product_slug', productType)
        .maybeSingle(),
      db.from('platform_settings')
        .select('value')
        .eq('key', 'guardrails')
        .maybeSingle(),
      // Guardrail Layer 2: platform-set defaults per bot type
      db.from('bot_type_guardrails')
        .select('guardrails_json')
        .eq('product_slug', productType)
        .maybeSingle(),
      // Guardrail Layer 3: per-client rules across all their bots
      db.from('tenant_guardrails')
        .select('guardrails_json')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      // LLM config: all 4 levels — platform-generic, platform-bot, client-generic, client-bot
      db.from('llm_configs')
        .select('tenant_id, product_slug, api_key, model, base_url, validation_status')
        .or(`and(tenant_id.is.null,product_slug.is.null),and(tenant_id.is.null,product_slug.eq.${productType}),and(tenant_id.eq.${tenantId},product_slug.is.null),and(tenant_id.eq.${tenantId},product_slug.eq.${productType})`),
    ]);

    const { data: wn, error: wnError } = wnRes;

    if (!wn) {
      fastify.log.warn({ tenantId, wnError }, '[Webhook] whatsapp_numbers not found');
      return;
    }

    // ── Tenant status + plan limit enforcement ────────────────────────────
    const tenant = tenantRes.data;
    if (tenant?.status === 'suspended') {
      fastify.log.info({ tenantId }, '[Webhook] tenant suspended — dropping reply');
      return;
    }

    const PLAN_LIMITS: Record<string, number> = { starter: 500, growth: 2000, scale: Infinity };
    const planLimit = PLAN_LIMITS[tenant?.plan ?? 'starter'] ?? 500;
    if (isFinite(planLimit)) {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { count: convCount } = await db
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', monthStart);
      if ((convCount ?? 0) >= planLimit) {
        fastify.log.warn({ tenantId, convCount, planLimit }, '[Webhook] plan limit reached — silently dropping reply');
        return;
      }
    }

    const gateway = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    const config = wn.config_json as {
      phone_number_id: string;
      access_token: string;
    };

    // ── Feature: Status Ladder — process delivery receipts ────────────────
    // Meta delivers receipts (sent/delivered/read) through the same POST endpoint
    // as inbound messages. Process them with the one-way ladder before doing
    // anything else. If the payload was receipts-only, parseIncoming returns null.
    const deliveryUpdates = gateway.parseDeliveryStatus(request.body);
    if (deliveryUpdates.length > 0) {
      await applyDeliveryStatusUpdates(db, deliveryUpdates);
    }

    const incoming = gateway.parseIncoming(request.body);
    fastify.log.info({ incoming: incoming ? { type: incoming.type, from: incoming.from } : null }, '[Webhook] parsed incoming');
    if (!incoming || incoming.type === 'unsupported') return;

    // Mark message as read (non-blocking)
    void gateway.markAsRead(config.phone_number_id, config.access_token, incoming.messageId);

    // ── Upsert contact ──────────────────────────────────────────────────────
    const { data: contact, error: contactError } = await db
      .from('contacts')
      .upsert(
        {
          tenant_id: tenantId,
          phone: incoming.from,
          name: incoming.contactName ?? null,
        },
        { onConflict: 'tenant_id,phone', ignoreDuplicates: false }
      )
      .select()
      .single();

    fastify.log.info({ contact: contact ? (contact as Contact).id : null, contactError }, '[Webhook] contact upsert');
    if (!contact) return;

    // ── CSAT response detection ───────────────────────────────────────────────
    // If we're awaiting a CSAT rating and the customer replies with 1-5, record it and exit.
    const memJson = ((contact as Contact).memory_json ?? {}) as unknown as Record<string, unknown>;
    if (memJson.awaiting_csat === true && incoming.text) {
      const csatValue = incoming.text.trim();
      if (['1', '2', '3', '4', '5'].includes(csatValue)) {
        const updatedMem = {
          ...memJson,
          awaiting_csat:  false,
          csat_score:     Number(csatValue),
          csat_scored_at: new Date().toISOString(),
        };
        await db.from('contacts').update({ memory_json: updatedMem }).eq('id', (contact as Contact).id);
        const stars = '⭐'.repeat(Number(csatValue));
        await gateway.sendMessage(config.phone_number_id, config.access_token, {
          type: 'text',
          to:   incoming.from,
          text: `Thank you for your rating! ${stars} We appreciate your feedback.`,
        });
        return;
      }
    }

    // ── Upsert conversation (one open conversation per contact per product) ─
    const { data: existingConvo, error: convoLookupError } = await db
      .from('conversations')
      .select()
      .eq('tenant_id', tenantId)
      .eq('contact_id', (contact as Contact).id)
      .eq('product_type', productType)
      .in('status', ['open', 'escalated', 'bot_paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    fastify.log.info({ existingConvo: existingConvo ? (existingConvo as Conversation).id : null, convoLookupError }, '[Webhook] conversation lookup');

    let conversation = existingConvo as Conversation | null;

    if (!conversation) {
      const { data: newConvo, error: newConvoError } = await db
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          contact_id: (contact as Contact).id,
          product_type: productType,
          status: 'open',
        })
        .select()
        .single();

      fastify.log.info({ newConvo: newConvo ? (newConvo as Conversation).id : null, newConvoError }, '[Webhook] conversation insert');
      conversation = newConvo as Conversation;

      // Track usage event
      void db.from('usage_events').insert({
        tenant_id: tenantId,
        product_type: productType,
        event_type: 'conversation_started',
      });
    }

    if (!conversation) return;

    // ── If bot is paused (human takeover), do not auto-reply ───────────────
    if (conversation.status === 'bot_paused') {
      // Still store the incoming message
      await db.from('messages').insert({
        conversation_id: conversation.id,
        role: 'user',
        content: incoming.text ?? `[${incoming.type} received]`,
        media_url: incoming.mediaUrl ?? null,
        media_type: (incoming.type !== 'text')
          ? incoming.type
          : null,
        whatsapp_msg_id: incoming.messageId,
      });
      return;
    }

    // ── Store incoming message (dedup via whatsapp_msg_id unique constraint) ─
    const { error: msgError } = await db.from('messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      content: incoming.text ?? `[${incoming.type} received]`,
      media_url: incoming.mediaUrl ?? null,
      media_type: (incoming.type !== 'text')
        ? (incoming.type as 'image' | 'audio' | 'video' | 'document')
        : null,
      whatsapp_msg_id: incoming.messageId,
    });

    // 23505 = unique_violation — Meta retry; skip AI call
    if (msgError?.code === '23505') return;
    if (msgError) {
      fastify.log.error({ msgError }, 'Failed to store incoming message');
      return;
    }

    // Non-blocking: classify customer sentiment and persist to contact memory
    if (incoming.text) {
      void detectAndStoreSentiment((contact as Contact).id, incoming.text);
    }

    void db.from('usage_events').insert({
      tenant_id: tenantId,
      product_type: productType,
      event_type: 'message_sent',
    });

    // ── Feature: Optimistic Lock — prevent concurrent AI calls ────────────
    // Meta retries webhooks on non-2xx or timeout. With LLM calls taking 1–5s,
    // two identical webhooks can race and produce duplicate responses.
    // Lock the conversation row for up to 30s; the loser exits cleanly.
    const lockUntil = new Date(Date.now() + 30_000).toISOString();
    const now       = new Date().toISOString();
    const { data: lockData } = await db
      .from('conversations')
      .update({ processing_lock_expires_at: lockUntil })
      .eq('id', conversation.id)
      .or(`processing_lock_expires_at.is.null,processing_lock_expires_at.lt.${now}`)
      .select('id');

    if (!lockData?.length) {
      fastify.log.warn({ conversationId: conversation.id }, '[Webhook] AI lock not acquired — concurrent processing in progress, skipping duplicate');
      return;
    }

    // Resolve bot config values (DB row takes precedence over defaults)
    const botConfig = botConfigRes.data as (BotConfig & { product: Product | null }) | null;

    // ── 4-layer guardrails ────────────────────────────────────────────────────
    // Layer 1: global (platform_settings)
    const globalG   = (platformSettingsRes.data?.value ?? null) as PlatformGuardrails | null;
    // Layer 2: per-bot-type (bot_type_guardrails)
    const botTypeG  = (botTypeGuardrailsRes.data?.guardrails_json ?? null) as LayeredGuardrailsConfig | null;
    // Layer 3: per-client across all bots (tenant_guardrails)
    const tenantG   = (tenantGuardrailsRes.data?.guardrails_json   ?? null) as LayeredGuardrailsConfig | null;
    // Layer 4: per-client per-bot (bot_configs.guardrails_json)
    const clientBotG = botConfig?.guardrails_json ?? null;

    const baseSystemPrompt =
      botConfig?.system_prompt ??
      (botConfig?.product as Product | null)?.default_prompt ??
      DEFAULT_SYSTEM_PROMPTS[productType];
    const escalationTriggers: string[] =
      botConfig?.escalation_triggers?.length
        ? botConfig.escalation_triggers
        : DEFAULT_ESCALATION_TRIGGERS;
    const confidenceThreshold =
      botConfig?.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

    // Arrays: UNION across all layers (every layer contributes its list)
    const allBlockedKeywords = [
      ...(globalG?.global_blocked_keywords?.map((k: string) => k.toLowerCase()) ?? []),
      ...(botTypeG?.blocked_keywords?.map((k: string) => k.toLowerCase()) ?? []),
      ...(tenantG?.blocked_keywords?.map((k: string) => k.toLowerCase()) ?? []),
      ...(clientBotG?.blocked_keywords?.map((k: string) => k.toLowerCase()) ?? []),
    ];
    const allBlockedTopics = [
      ...(globalG?.global_blocked_topics ?? []),
      ...(botTypeG?.blocked_topics ?? []),
      ...(tenantG?.blocked_topics ?? []),
      ...(clientBotG?.blocked_topics ?? []),
    ];

    // Numbers: MIN across all layers (most restrictive wins)
    const effectiveMaxLength = Math.min(
      globalG?.max_response_length   ?? 2000,
      botTypeG?.max_response_length  ?? 2000,
      tenantG?.max_response_length   ?? 2000,
      clientBotG?.max_response_length ?? 1000,
    );

    // Booleans: OR across all layers (any layer can switch it on)
    const kbOnly =
      !!(clientBotG as { kb_only_mode?: boolean } | null)?.kb_only_mode ||
      !!tenantG?.kb_only_mode   ||
      !!botTypeG?.kb_only_mode  ||
      !!globalG?.enforce_kb_only_globally;

    const noExternalLinks =
      !!clientBotG?.content_filters?.no_external_links ||
      !!tenantG?.no_external_links  ||
      !!botTypeG?.no_external_links ||
      !!globalG?.content_filters?.no_external_links;

    const noPersonalData =
      !!clientBotG?.content_filters?.no_personal_data ||
      !!tenantG?.no_personal_data  ||
      !!botTypeG?.no_personal_data ||
      !!globalG?.content_filters?.no_personal_data;

    // Most-specific layer wins for action/message strings
    const onBlockedTopic   = clientBotG?.on_blocked_topic ?? tenantG?.on_blocked_topic ?? botTypeG?.on_blocked_topic ?? 'escalate';
    const customBlockedMsg = clientBotG?.custom_blocked_message ?? tenantG?.custom_blocked_message ?? botTypeG?.custom_blocked_message;

    // ── Check for manual escalation request ────────────────────────────────
    const messageText = incoming.text?.toLowerCase() ?? '';
    const wantsHuman = escalationTriggers.some((t) => messageText.includes(t));

    if (wantsHuman && conversation.status === 'open') {
      await escalateConversation(conversation, 'Customer requested human agent');
      await gateway.sendMessage(config.phone_number_id, config.access_token, {
        type: 'text',
        to: incoming.from,
        text: "I'm connecting you with a human agent right away. Please hold on for a moment.",
      });
      return;
    }

    // ── Check blocked keywords (4-layer guardrails) ───────────────────────
    if (allBlockedKeywords.length > 0 && allBlockedKeywords.some((kw) => messageText.includes(kw))) {
      const blockedMsg = customBlockedMsg ?? "I'm sorry, I'm not able to help with that topic.";
      if (onBlockedTopic === 'escalate' && conversation.status === 'open') {
        await escalateConversation(conversation, 'Blocked keyword detected in message');
        await gateway.sendMessage(config.phone_number_id, config.access_token, {
          type: 'text',
          to: incoming.from,
          text: "I'm connecting you with a human agent who can better assist you.",
        });
      } else {
        await gateway.sendMessage(config.phone_number_id, config.access_token, {
          type: 'text',
          to: incoming.from,
          text: blockedMsg,
        });
      }
      return;
    }

    // ── Fetch conversation history + KB context ────────────────────────────
    // Load up to 40 messages; the assembler splits them into recent verbatim
    // + archived summary so the LLM always gets fresh context efficiently.
    const { data: historyDesc } = await db
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('timestamp', { ascending: false })
      .limit(40);
    const allHistory = ((historyDesc ?? []) as import('@alphabot/shared').Message[]).reverse();

    const { archiveBlock, recentMessages, stats: historyStats } = assembleHistory(allHistory);
    fastify.log.info(historyStats, '[Webhook] history assembled');

    const contactData = contact as Contact;
    const kbResults = incoming.text
      ? await lookupKB(tenantId, productType, incoming.text)
      : [];

    const contactMemory = JSON.stringify(contactData.memory_json);

    // ── Build effective system prompt with guardrails injected ───────────
    // Always append SALES_LEAD_INSTRUCTION so it applies even when the DB
    // has a custom system_prompt that doesn't include it.
    let systemPrompt = baseSystemPrompt + (productType !== 'lifecycle_bot' ? SALES_LEAD_INSTRUCTION : '');

    // Inject archive summary (Tier 3) — older turns compressed into the system prompt
    if (archiveBlock) {
      systemPrompt += `\n\n---\n${archiveBlock}`;
    }

    if (kbOnly) {
      systemPrompt += kbResults.length > 0
        ? '\n\nIMPORTANT: Only answer using the knowledge base entries provided. If the answer is not there, say "I don\'t have information on that" and offer to connect with a human agent.'
        : '\n\nIMPORTANT: Only answer from your knowledge base. If you cannot find an answer, tell the customer you don\'t have that information and offer to escalate.';
    }

    if (allBlockedTopics.length > 0) {
      systemPrompt += `\n\nDo NOT discuss: ${allBlockedTopics.join(', ')}. If asked, politely decline.`;
    }

    const toneMap: Record<string, string> = {
      professional: 'Maintain a professional and courteous tone.',
      casual:       'Use a friendly, casual and conversational tone.',
      empathetic:   'Be empathetic, warm and understanding in every response.',
      formal:       'Use formal, business-appropriate language at all times.',
    };
    systemPrompt += `\n\nTone: ${toneMap[clientBotG?.tone ?? 'professional']}`;

    if (noExternalLinks) {
      systemPrompt += '\nNever include external URLs or links in your responses.';
    }
    if (clientBotG?.content_filters?.no_phone_numbers_in_response) {
      systemPrompt += '\nDo not include phone numbers in your responses.';
    }
    if (noPersonalData) {
      systemPrompt += '\nNever share or reference personally identifiable information.';
    }

    // ── Language-aware reply directive ────────────────────────────────────────
    const langHint = incoming.text ? detectLanguageHint(incoming.text) : null;
    if (langHint) {
      systemPrompt += `\nThe customer is writing in ${langHint}. Respond in the same language and script.`;
    }

    // ── Feature: AI Conversation State Machine ────────────────────────────
    // Inject the current conversation stage and AI-extracted entities into the
    // system prompt. The AI can advance the stage or capture new info by appending
    // structured markers to the END of its response (stripped before sending).
    const convStage  = (conversation as Conversation & { stage?: string }).stage ?? 'greeting';
    const convAiVars = (conversation as Conversation & { ai_vars?: Record<string, string> }).ai_vars ?? {};
    const aiVarPairs = Object.entries(convAiVars);

    systemPrompt += `\n\n---\nCONVERSATION STATE:
Stage: ${convStage} (greeting → qualifying → resolving → following_up → closing)
${aiVarPairs.length > 0 ? `Captured info: ${aiVarPairs.map(([k, v]) => `${k}=${v}`).join(', ')}` : 'No customer info captured yet.'}

To update state, append these markers at the VERY END of your response (they are stripped before reaching the customer):
[STAGE:<new_stage>] — advance when the conversation naturally moves to a new phase
[ENTITY:<key>=<value>] — capture extracted customer info (e.g. [ENTITY:email=alice@example.com] [ENTITY:order_id=ORD-123])`;

    // ── Resolve LLM config — 6-level hierarchy (most specific wins) ─────
    // 1. llm_configs Client Bot      (validated API key + model)
    // 2. llm_configs Client Generic  (validated API key + model)
    // 3. llm_configs Platform Bot    (validated API key + model)
    // 4. llm_configs Platform Generic(validated API key + model)
    // 5. bot_configs.ai_model        (model only, uses env API key)
    // 6. products.default_model      (model only, uses env API key)
    // 7. OPENROUTER_REPLY_MODEL env  (ultimate fallback in claude.ts)
    type LlmRow = { tenant_id: string | null; product_slug: string | null; api_key: string; model: string; base_url: string | null; validation_status: string };
    const llmRows = (llmConfigsRes.data ?? []) as LlmRow[];

    const resolvedLlm = (
      llmRows.find(r => r.tenant_id === tenantId  && r.product_slug === productType) ??
      llmRows.find(r => r.tenant_id === tenantId  && r.product_slug === null) ??
      llmRows.find(r => r.tenant_id === null       && r.product_slug === productType) ??
      llmRows.find(r => r.tenant_id === null       && r.product_slug === null)
    );

    // DB-configured model — only use if it's an Anthropic model name (starts with 'claude-').
    // Ignore legacy OpenRouter slugs (e.g. 'meta-llama/...') that would fail against Anthropic API.
    const rawDbModel =
      botConfig?.ai_model ??
      (botConfig?.product as Product | null)?.default_model ??
      null;
    const dbModel = rawDbModel?.startsWith('claude-') ? rawDbModel : null;

    const llmOverride = (resolvedLlm?.validation_status === 'valid')
      ? { apiKey: resolvedLlm.api_key, model: resolvedLlm.model }
      : dbModel
        ? { model: dbModel }   // use DB Anthropic model with platform env API key
        : undefined;           // fall through to REPLY_MODEL default in anthropic.ts

    // ── Token quota check — enforce per-plan monthly limit ────────────────
    const quota = await checkTokenQuota(tenantId, tenant?.plan ?? 'starter');
    if (!quota.allowed) {
      fastify.log.warn({ tenantId, used: quota.used, limit: quota.limit }, '[Webhook] token quota exceeded — dropping AI call');
      await gateway.sendMessage(config.phone_number_id, config.access_token, {
        type: 'text',
        to:   incoming.from,
        text: "Our AI assistant has reached its monthly limit. Please contact support to upgrade your plan.",
      });
      return;
    }

    // ── Generate AI response ──────────────────────────────────────────────
    let aiResult: Awaited<ReturnType<typeof getAIResponse>>;
    try {
      aiResult = await getAIResponse(
        systemPrompt,
        recentMessages,
        kbResults,
        contactMemory,
        llmOverride,
      );
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);

      // If a tenant's custom API key caused an auth failure, retry with the platform key.
      const isAuthError = /\b(401|403)\b|invalid.api.key|authentication_error|unauthorized/i.test(errMsg);
      if (isAuthError && llmOverride?.apiKey) {
        fastify.log.warn({ tenantId, errMsg }, '[Webhook] Custom API key auth failure — retrying with platform key');
        try {
          aiResult = await getAIResponse(
            systemPrompt,
            recentMessages,
            kbResults,
            contactMemory,
            llmOverride.model ? { model: llmOverride.model } : undefined,
          );
        } catch (fallbackErr) {
          fastify.log.error({ fallbackErr: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr), tenantId }, '[Webhook] Platform key fallback also failed');
          await gateway.sendMessage(config.phone_number_id, config.access_token, {
            type: 'text',
            to: incoming.from,
            text: "I'm having trouble responding right now. Please try again in a moment, or type 'agent' to speak with a human.",
          });
          void db.from('conversations').update({ processing_lock_expires_at: null }).eq('id', conversation.id);
          return;
        }
      } else {
        fastify.log.error({ aiErr: errMsg, tenantId, productType, resolvedLlm: resolvedLlm ? `${resolvedLlm.tenant_id ?? 'platform'}/${resolvedLlm.product_slug ?? 'generic'}` : 'env-vars' }, '[Webhook] AI generation failed');
        await gateway.sendMessage(config.phone_number_id, config.access_token, {
          type: 'text',
          to: incoming.from,
          text: "I'm having trouble responding right now. Please try again in a moment, or type 'agent' to speak with a human.",
        });
        void db.from('conversations').update({ processing_lock_expires_at: null }).eq('id', conversation.id);
        return;
      }
    }

    // ── Parse AI response markers ─────────────────────────────────────────
    const rawContent  = aiResult.content;
    const isSalesLead = rawContent.includes('[SALES_LEAD]');

    // Feature: State Machine — extract [STAGE:x] and [ENTITY:key=value] markers
    const stageMatch    = rawContent.match(/\[STAGE:(\w+)\]/);
    const entityMatches = [...rawContent.matchAll(/\[ENTITY:(\w+)=([^\]]+)\]/g)];

    // Strip all control markers before sending to customer
    const cleanContent = rawContent
      .replace(/\[SALES_LEAD\]/g, '')
      .replace(/\[STAGE:\w+\]/g, '')
      .replace(/\[ENTITY:[^\]]+\]/g, '')
      .trimEnd();

    // Persist stage/entity updates non-blocking (after lock, before reply send)
    if (stageMatch || entityMatches.length > 0) {
      const stateUpdate: Record<string, unknown> = {};
      if (stageMatch) stateUpdate['stage'] = stageMatch[1];
      if (entityMatches.length > 0) {
        const updatedVars = { ...convAiVars };
        for (const match of entityMatches) {
          updatedVars[match[1]!] = match[2]!;
        }
        stateUpdate['ai_vars'] = updatedVars;
      }
      void db.from('conversations').update(stateUpdate).eq('id', conversation.id);
    }

    // Guard: if AI only emitted markers with no actual reply content, skip reply entirely
    if (!cleanContent.trim()) {
      fastify.log.warn({ tenantId, conversationId: conversation.id }, '[Webhook] AI returned empty content after stripping tags — skipping reply');
      if (isSalesLead && conversation.status === 'open') {
        await escalateConversation(conversation, `Sales lead detected — customer expressed buying intent${buildEscalationContext(convStage, convAiVars)}`);
      }
      void db.from('conversations').update({ processing_lock_expires_at: null }).eq('id', conversation.id);
      return;
    }

    // Truncate to max_response_length guardrail
    const replyText = cleanContent.length > effectiveMaxLength
      ? cleanContent.substring(0, effectiveMaxLength).trimEnd() + '…'
      : cleanContent;

    // ── Store AI reply (capture ID for delivery status update) ────────────
    const { data: storedMsg } = await db.from('messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      content: replyText,
      confidence_score: aiResult.confidenceScore,
    }).select('id').single();

    // Track token usage
    void db.from('usage_events').insert({
      tenant_id: tenantId,
      product_type: productType,
      event_type: 'ai_token_used',
      token_count: aiResult.inputTokens + aiResult.outputTokens,
    });

    // ── Auto-escalate on sales lead detection ────────────────────────────
    if (isSalesLead && conversation.status === 'open') {
      fastify.log.info({ tenantId, conversationId: conversation.id }, '[Webhook] Sales lead detected — escalating');
      await escalateConversation(conversation, `Sales lead detected — customer expressed buying intent${buildEscalationContext(convStage, convAiVars)}`);
    }
    // ── Feature: Escalation Policy — confidence-based reprompt ladder ──────
    // Replaces the old single-threshold hardcut with configurable per-bot policy:
    // low confidence increments a counter; on exhaust the policy triggers escalation.
    // A confident reply resets the counter so transient uncertainty doesn't escalate.
    else if (conversation.status === 'open') {
      const policy      = botConfig?.escalation_policy ?? null;
      const threshold   = policy?.confidence_threshold    ?? confidenceThreshold;
      const maxReprompts = policy?.max_low_confidence_reprompts ?? 2;
      const onExhaust   = policy?.on_exhaust ?? 'escalate';

      if (aiResult.confidenceScore < threshold) {
        const currentCount = (conversation as Conversation & { low_confidence_count?: number }).low_confidence_count ?? 0;
        const newCount     = currentCount + 1;
        await db.from('conversations').update({ low_confidence_count: newCount }).eq('id', conversation.id);

        fastify.log.info({ tenantId, conversationId: conversation.id, newCount, maxReprompts, threshold }, '[Webhook] Low-confidence turn');

        if (newCount >= maxReprompts && onExhaust === 'escalate') {
          const ctx = buildEscalationContext(convStage, convAiVars);
          await escalateConversation(conversation, `AI confidence below ${threshold} for ${newCount} consecutive turns${ctx}`);
        } else if (policy?.reprompt_message && newCount < maxReprompts) {
          // Send configured reprompt message before escalating on next low-confidence turn
          await gateway.sendMessage(config.phone_number_id, config.access_token, {
            type: 'text',
            to:   incoming.from,
            text: policy.reprompt_message,
          });
        }
      } else if ((conversation as Conversation & { low_confidence_count?: number }).low_confidence_count ?? 0 > 0) {
        // Confident reply — reset counter non-blocking
        void db.from('conversations').update({ low_confidence_count: 0 }).eq('id', conversation.id);
      }
    }

    // ── Send reply to WhatsApp ────────────────────────────────────────────
    const sendResult = await gateway.sendMessage(config.phone_number_id, config.access_token, {
      type: 'text',
      to: incoming.from,
      text: replyText,
    });
    fastify.log.info({ sendResult }, '[Webhook] sendMessage result');

    // Feature: Status Ladder — mark outbound message as 'sent' and store Meta msg ID
    if (storedMsg && sendResult.messageId) {
      void db.from('messages')
        .update({ delivery_status: 'sent', whatsapp_msg_id: sendResult.messageId })
        .eq('id', (storedMsg as { id: string }).id);
    }

    // ── Release optimistic lock ───────────────────────────────────────────
    void db.from('conversations')
      .update({ processing_lock_expires_at: null })
      .eq('id', conversation.id);

    // ── Update conversation timestamp ─────────────────────────────────────
    await db.from('conversations').update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id);

    } catch (err) {
      fastify.log.error({ err, tenantId, productType }, '[Webhook] async processing failed');
    }
  });
}
