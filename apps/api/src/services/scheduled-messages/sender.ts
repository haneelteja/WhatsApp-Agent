import { getServerClient } from '@alphabot/database';
import { WhatsAppGateway } from '../whatsapp/gateway.js';
import type { WhatsAppProvider, OutgoingMessage } from '@alphabot/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduledMessage {
  id: string;
  tenant_id: string;
  name: string;
  message_body: string | null;
  template_name: string | null;
  template_language: string;
  template_components: unknown[];
  scheduled_at: string;
  recurrence: RecurrenceConfig;
  bot_handles_replies: boolean;
  status: string;
}

export interface RecurrenceConfig {
  type: 'once' | 'daily' | 'weekly' | 'monthly';
  days_of_week?: number[];  // 0=Sun … 6=Sat, for weekly
  day_of_month?: number;    // 1–31, for monthly
}

// ─── Next scheduled_at calculation ───────────────────────────────────────────

export function nextScheduledAt(rec: RecurrenceConfig, from: Date): Date | null {
  if (rec.type === 'once') return null;

  const base = new Date(from);
  if (rec.type === 'daily') {
    base.setUTCDate(base.getUTCDate() + 1);
    return base;
  }
  if (rec.type === 'weekly' && rec.days_of_week && rec.days_of_week.length > 0) {
    const sortedDays = [...rec.days_of_week].sort((a, b) => a - b);
    const currentDay = base.getUTCDay();
    const nextDay = sortedDays.find(d => d > currentDay) ?? sortedDays[0];
    const daysAhead = nextDay !== undefined && nextDay > currentDay
      ? nextDay - currentDay
      : 7 - currentDay + (sortedDays[0] ?? 0);
    base.setUTCDate(base.getUTCDate() + daysAhead);
    return base;
  }
  if (rec.type === 'monthly' && rec.day_of_month) {
    base.setUTCMonth(base.getUTCMonth() + 1);
    base.setUTCDate(Math.min(rec.day_of_month, new Date(base.getUTCFullYear(), base.getUTCMonth() + 1, 0).getUTCDate()));
    return base;
  }
  return null;
}

// ─── Core executor ───────────────────────────────────────────────────────────

export async function executeScheduledMessage(msg: ScheduledMessage): Promise<void> {
  const db = getServerClient();

  // Fetch tenant's active WhatsApp number
  const { data: wn } = await db
    .from('whatsapp_numbers')
    .select('provider, config_json')
    .eq('tenant_id', msg.tenant_id)
    .eq('active', true)
    .limit(1)
    .single();

  if (!wn) {
    await db
      .from('scheduled_messages')
      .update({ status: 'failed', failure_reason: 'No active WhatsApp number found for tenant' })
      .eq('id', msg.id);
    return;
  }

  const wnConfig = wn.config_json as { phone_number_id: string; access_token: string };
  const gateway  = new WhatsAppGateway(wn.provider as WhatsAppProvider);
  const isWaba   = wn.provider === 'meta_cloud';

  // Fetch pending recipients
  const { data: recipients } = await db
    .from('scheduled_message_recipients')
    .select('id, phone, contact_name, contact_id, session_status')
    .eq('scheduled_message_id', msg.id)
    .eq('status', 'pending');

  if (!recipients || recipients.length === 0) {
    await db
      .from('scheduled_messages')
      .update({ status: 'completed' })
      .eq('id', msg.id);
    return;
  }

  let anyFailed = false;

  for (const recipient of recipients) {
    try {
      // ── Session detection ─────────────────────────────────────────────────
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: inboundCount } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', msg.tenant_id)
        .eq('direction', 'inbound')
        .ilike('from_number', recipient.phone)
        .gte('created_at', since24h);

      const sessionActive = (inboundCount ?? 0) > 0;
      const sessionStatus = sessionActive ? 'active' : 'expired';

      // ── Choose send strategy ──────────────────────────────────────────────
      let outgoing: OutgoingMessage | null = null;
      let messageType: 'freeform' | 'template' = 'freeform';
      let skipReason: string | null = null;

      if (sessionActive && msg.message_body) {
        outgoing    = { type: 'text', to: recipient.phone, text: msg.message_body };
        messageType = 'freeform';
      } else if (msg.template_name) {
        outgoing    = {
          type:             'template',
          to:               recipient.phone,
          templateName:     msg.template_name,
          languageCode:     msg.template_language,
          components:       (msg.template_components as import('@alphabot/shared').TemplateComponent[]) ?? [],
        };
        messageType = 'template';
      } else if (sessionActive && !msg.message_body) {
        skipReason = 'No message body configured';
      } else {
        skipReason = 'Session expired and no template configured';
      }

      if (skipReason || !outgoing) {
        await db.from('scheduled_message_recipients').update({
          status:         'skipped',
          session_status: sessionStatus,
          error_message:  skipReason ?? 'No outgoing message could be composed',
        }).eq('id', recipient.id);
        anyFailed = true;
        continue;
      }

      // ── Send ──────────────────────────────────────────────────────────────
      const result = await gateway.sendMessage(
        wnConfig.phone_number_id,
        wnConfig.access_token,
        outgoing,
      );

      if (result.status === 'failed') {
        await db.from('scheduled_message_recipients').update({
          status:              'failed',
          session_status:      sessionStatus,
          message_type:        messageType,
          error_message:       result.error ?? 'Send failed',
        }).eq('id', recipient.id);
        anyFailed = true;
        continue;
      }

      // ── Bot continuation: create conversation if requested and WABA ───────
      let conversationId: string | null = null;
      if (msg.bot_handles_replies && isWaba && recipient.contact_id) {
        const { data: conv } = await db
          .from('conversations')
          .insert({
            tenant_id:    msg.tenant_id,
            contact_id:   recipient.contact_id,
            product_type: 'support_bot',
            status:       'open',
            ai_vars:      { source: 'scheduled_message', scheduled_message_id: msg.id },
          })
          .select('id')
          .single();
        conversationId = conv?.id ?? null;
      }

      await db.from('scheduled_message_recipients').update({
        status:               'sent',
        session_status:       sessionStatus,
        message_type:         messageType,
        whatsapp_message_id:  result.messageId,
        conversation_id:      conversationId,
        sent_at:              new Date().toISOString(),
      }).eq('id', recipient.id);

    } catch (err) {
      anyFailed = true;
      await db.from('scheduled_message_recipients').update({
        status:        'failed',
        error_message: err instanceof Error ? err.message : String(err),
      }).eq('id', recipient.id);
    }
  }

  // ── Advance recurrence or complete ────────────────────────────────────────
  const rec  = msg.recurrence as RecurrenceConfig;
  const next = nextScheduledAt(rec, new Date());

  if (next) {
    // Re-clone recipients for next fire
    const { data: existingRecipients } = await db
      .from('scheduled_message_recipients')
      .select('phone, contact_name, contact_id, tenant_id')
      .eq('scheduled_message_id', msg.id);

    if (existingRecipients && existingRecipients.length > 0) {
      const newRecipients = existingRecipients.map(r => ({
        scheduled_message_id: msg.id,
        tenant_id:            r.tenant_id,
        phone:                r.phone,
        contact_name:         r.contact_name,
        contact_id:           r.contact_id,
        status:               'pending',
      }));
      await db.from('scheduled_message_recipients').insert(newRecipients);
    }

    await db
      .from('scheduled_messages')
      .update({ status: 'scheduled', scheduled_at: next.toISOString() })
      .eq('id', msg.id);
  } else {
    await db
      .from('scheduled_messages')
      .update({ status: anyFailed ? 'failed' : 'completed' })
      .eq('id', msg.id);
  }
}

// ─── Batch processor (called by scheduler) ───────────────────────────────────

export async function processScheduledMessages(): Promise<void> {
  const db = getServerClient();

  // Optimistic lock: claim 'running' atomically
  const { data: due } = await db
    .from('scheduled_messages')
    .update({ status: 'running' })
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .select('id, tenant_id, name, message_body, template_name, template_language, template_components, scheduled_at, recurrence, bot_handles_replies, status');

  if (!due || due.length === 0) return;

  console.log(`[ScheduledMessages] ${due.length} message(s) due — processing`);

  await Promise.allSettled(
    due.map(msg =>
      executeScheduledMessage(msg as ScheduledMessage).catch(err =>
        console.error(`[ScheduledMessages] Failed for ${msg.id}:`, (err as Error).message)
      )
    )
  );
}
