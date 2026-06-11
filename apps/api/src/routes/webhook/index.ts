import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import type { BotConfig, Contact, Conversation, PlatformGuardrails, Product, ProductType, WhatsAppProvider } from '@alphabot/shared';
import { WhatsAppGateway } from '../../services/whatsapp/gateway.js';
import { getAIResponse } from '../../services/ai/claude.js';
import { lookupKB } from '../../services/kb/lookup.js';
import { escalateConversation } from '../../services/escalation/index.js';

// Default system prompts used only when no bot_config row exists yet
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

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET: Meta webhook verification ─────────────────────────────────────
  fastify.get<{ Querystring: Record<string, string> }>('/:tenantId/:productType', async (request, reply) => {
    const { tenantId, productType } = request.params as {
      tenantId: string;
      productType: ProductType;
    };

    // Fetch the tenant's WhatsApp config to get the verify token
    const db = getServerClient();
    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', tenantId)
      .eq('product_slug', productType)
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

    // Load WhatsApp config + bot config + platform guardrails in parallel
    const [wnRes, botConfigRes, platformSettingsRes] = await Promise.all([
      db.from('whatsapp_numbers')
        .select('config_json, provider')
        .eq('tenant_id', tenantId)
        .eq('product_slug', productType)
        .eq('active', true)
        .limit(1)
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
    ]);

    const { data: wn, error: wnError } = wnRes;

    if (!wn) {
      fastify.log.warn({ tenantId, wnError }, '[Webhook] whatsapp_numbers not found');
      return;
    }

    const gateway = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    const incoming = gateway.parseIncoming(request.body);
    fastify.log.info({ incoming: incoming ? { type: incoming.type, from: incoming.from } : null }, '[Webhook] parsed incoming');
    if (!incoming || incoming.type === 'unsupported') return;

    const config = wn.config_json as {
      phone_number_id: string;
      access_token: string;
    };

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

    void db.from('usage_events').insert({
      tenant_id: tenantId,
      product_type: productType,
      event_type: 'message_sent',
    });

    // Resolve bot config values (DB row takes precedence over defaults)
    const botConfig = botConfigRes.data as (BotConfig & { product: Product | null }) | null;
    const platformGuardrails = (platformSettingsRes.data?.value ?? null) as PlatformGuardrails | null;

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

    // ── Effective guardrails (platform + client merged) ───────────────────────
    const clientGuardrails = botConfig?.guardrails_json;
    const kbOnly = botConfig?.kb_only_mode ?? platformGuardrails?.enforce_kb_only_globally ?? false;
    const effectiveMaxLength = Math.min(
      clientGuardrails?.max_response_length ?? 1000,
      platformGuardrails?.max_response_length ?? 2000,
    );
    const allBlockedKeywords = [
      ...(platformGuardrails?.global_blocked_keywords?.map((k: string) => k.toLowerCase()) ?? []),
      ...(clientGuardrails?.blocked_keywords?.map((k: string) => k.toLowerCase()) ?? []),
    ];
    const allBlockedTopics = [
      ...(platformGuardrails?.global_blocked_topics ?? []),
      ...(clientGuardrails?.blocked_topics ?? []),
    ];

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

    // ── Check blocked keywords (guardrails) ───────────────────────────────
    if (allBlockedKeywords.length > 0 && allBlockedKeywords.some((kw) => messageText.includes(kw))) {
      const blockedMsg = clientGuardrails?.custom_blocked_message
        ?? "I'm sorry, I'm not able to help with that topic.";
      if ((clientGuardrails?.on_blocked_topic ?? 'escalate') === 'escalate' && conversation.status === 'open') {
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
    const { data: history } = await db
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('timestamp', { ascending: true })
      .limit(50);

    const contactData = contact as Contact;
    const kbResults = incoming.text
      ? await lookupKB(tenantId, productType, incoming.text)
      : [];

    const contactMemory = JSON.stringify(contactData.memory_json);

    // ── Build effective system prompt with guardrails injected ───────────
    let systemPrompt = baseSystemPrompt;

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
    systemPrompt += `\n\nTone: ${toneMap[clientGuardrails?.tone ?? 'professional']}`;

    if (clientGuardrails?.content_filters?.no_external_links || platformGuardrails?.content_filters?.no_external_links) {
      systemPrompt += '\nNever include external URLs or links in your responses.';
    }
    if (clientGuardrails?.content_filters?.no_phone_numbers_in_response) {
      systemPrompt += '\nDo not include phone numbers in your responses.';
    }
    if (clientGuardrails?.content_filters?.no_personal_data || platformGuardrails?.content_filters?.no_personal_data) {
      systemPrompt += '\nNever share or reference personally identifiable information.';
    }

    // ── Generate AI response ──────────────────────────────────────────────
    const aiResult = await getAIResponse(
      systemPrompt,
      (history ?? []) as import('@alphabot/shared').Message[],
      kbResults,
      contactMemory
    );

    // Truncate to max_response_length guardrail
    const replyText = aiResult.content.length > effectiveMaxLength
      ? aiResult.content.substring(0, effectiveMaxLength).trimEnd() + '…'
      : aiResult.content;

    // ── Store AI reply ────────────────────────────────────────────────────
    await db.from('messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      content: replyText,
      confidence_score: aiResult.confidenceScore,
    });

    // Track token usage
    void db.from('usage_events').insert({
      tenant_id: tenantId,
      product_type: productType,
      event_type: 'ai_token_used',
      token_count: aiResult.inputTokens + aiResult.outputTokens,
    });

    // ── Auto-escalate on low confidence ──────────────────────────────────
    if (aiResult.confidenceScore < confidenceThreshold && conversation.status === 'open') {
      await escalateConversation(conversation, 'Low AI confidence — query unresolved');
    }

    // ── Send reply to WhatsApp ────────────────────────────────────────────
    const sendResult = await gateway.sendMessage(config.phone_number_id, config.access_token, {
      type: 'text',
      to: incoming.from,
      text: replyText,
    });
    fastify.log.info({ sendResult }, '[Webhook] sendMessage result');

    // ── Update conversation timestamp ─────────────────────────────────────
    await db.from('conversations').update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id);

    } catch (err) {
      fastify.log.error({ err, tenantId, productType }, '[Webhook] async processing failed');
    }
  });
}
