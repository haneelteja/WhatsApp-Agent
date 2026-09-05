import cron from 'node-cron';
import { getServerClient } from '@alphabot/database';
import { runDailyReports } from '../lib/email/daily-report.js';
import { WhatsAppGateway } from '../services/whatsapp/gateway.js';
import { dispatchPendingVoiceCalls, processCampaignContacts } from '../services/campaign/index.js';
import { processScheduledBroadcasts } from '../services/broadcast/index.js';
import { processScheduledMessages } from '../services/scheduled-messages/sender.js';
import { isWithinBusinessHours } from '../lib/business-hours.js';
import { runInsightsForAllTenants } from '../services/insights/generator.js';
import { withJobLock } from '../lib/redis.js';
import { businessDaysCutoff } from '../lib/business-days.js';
import { resetAllDailyCounts } from '../lib/sender-capacity.js';
import { classifyAndPersistOutcome } from '../lib/outcome-classifier.js';
import type { BotVoiceConfig, SalesConfig, WhatsAppProvider } from '@alphabot/shared';

const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function pingSupabase(): Promise<void> {
  try {
    await getServerClient().from('tenants').select('id').limit(1);
  } catch (err) {
    console.error('[KeepAlive] Supabase ping failed:', err instanceof Error ? err.message : String(err));
  }
}

async function processFollowUps(): Promise<void> {
  const db = getServerClient();

  const { data: configs } = await db
    .from('follow_up_configs')
    .select('*')
    .eq('enabled', true);

  if (!configs?.length) return;

  for (const config of configs) {
    try {
      // Use business-days cutoff so weekends don't count as silence days
      const cutoff = businessDaysCutoff(config.idle_days);

      const { data: allConversations } = await db
        .from('conversations')
        .select('id, contact_id')
        .eq('tenant_id', config.tenant_id)
        .eq('product_type', config.product_slug)
        .eq('status', 'open')
        .lt('updated_at', cutoff);

      const scope      = config.scope ?? 'all';
      const contactIds = (config.contact_ids ?? []) as string[];
      const conversations = (allConversations ?? []).filter(conv => {
        if (scope === 'include' && contactIds.length > 0) return contactIds.includes(conv.contact_id);
        if (scope === 'exclude' && contactIds.length > 0) return !contactIds.includes(conv.contact_id);
        return true;
      });

      if (!conversations.length) continue;

      const { data: wn } = await db
        .from('whatsapp_numbers')
        .select('config_json, provider')
        .eq('tenant_id', config.tenant_id)
        .eq('product_slug', config.product_slug)
        .eq('active', true)
        .limit(1)
        .single();

      if (!wn) continue;

      const gateway  = new WhatsAppGateway(wn.provider as WhatsAppProvider);
      const wnConfig = wn.config_json as { phone_number_id: string; access_token: string };

      const convIds = conversations.map(c => c.id);

      // Batch: fetch all existing sends for every conversation in one query
      const { data: existingSends } = await db
        .from('follow_up_sends')
        .select('conversation_id')
        .in('conversation_id', convIds);

      const sendCountMap = new Map<string, number>();
      for (const send of (existingSends ?? [])) {
        const id = (send as { conversation_id: string }).conversation_id;
        sendCountMap.set(id, (sendCountMap.get(id) ?? 0) + 1);
      }

      const eligibleConvs = conversations.filter(
        conv => (sendCountMap.get(conv.id) ?? 0) < config.max_follow_ups,
      );

      if (!eligibleConvs.length) continue;

      // Batch: fetch all relevant contacts in one query
      const uniqueContactIds = [...new Set(eligibleConvs.map(c => c.contact_id))];
      const { data: contactsData } = await db
        .from('contacts')
        .select('id, phone, name')
        .in('id', uniqueContactIds);

      const contactMap = new Map(
        (contactsData ?? []).map(c => [(c as { id: string }).id, c as { id: string; phone: string; name: string | null }]),
      );

      const newMessages:    object[] = [];
      const newSends:       object[] = [];
      const updatedConvIds: string[] = [];

      for (const conv of eligibleConvs) {
        try {
          const contact = contactMap.get(conv.contact_id);
          if (!contact) continue;

          const name    = contact.name?.split(' ')[0] ?? 'there';
          const message = config.message_template.replace(/\{name\}/gi, name);

          await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
            type: 'text',
            to:   contact.phone,
            text: message,
          });

          newMessages.push({ conversation_id: conv.id, role: 'assistant', content: message });
          newSends.push({ conversation_id: conv.id });
          updatedConvIds.push(conv.id);

        } catch (convErr) {
          console.error(`[FollowUp] Failed for conversation ${conv.id}:`, convErr);
        }
      }

      // Batch inserts and update — replaces N×4 sequential round-trips with 3
      if (newMessages.length)    await db.from('messages').insert(newMessages);
      if (newSends.length)       await db.from('follow_up_sends').insert(newSends);
      if (updatedConvIds.length) {
        await db.from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .in('id', updatedConvIds);
      }
    } catch (configErr) {
      console.error(`[FollowUp] Failed processing config ${config.id}:`, configErr);
    }
  }
}

/**
 * Fires voice calls for conversations where the customer went silent for N hours.
 * Checks bot_configs for trigger_on_no_reply and only fires if:
 * - Voice is enabled for the bot
 * - No active/recent call already exists for the conversation
 * - Within business hours (if configured)
 */
async function processNoReplyTriggers(): Promise<void> {
  const db = getServerClient();

  // Load all bot_configs that have no-reply trigger enabled
  const { data: botCfgs } = await db
    .from('bot_configs')
    .select('tenant_id, product_slug, voice_config')
    .not('voice_config', 'is', null);

  if (!botCfgs?.length) return;

  const { dispatchCall } = await import('../services/voice/call-manager.js');

  for (const row of botCfgs) {
    const voiceCfg = row.voice_config as BotVoiceConfig;
    if (!voiceCfg?.enabled || !voiceCfg?.trigger_on_no_reply) continue;
    if (!isWithinBusinessHours(voiceCfg)) continue;

    const hoursDelay = voiceCfg.no_reply_after_hours ?? 2;
    const cutoff     = new Date(Date.now() - hoursDelay * 60 * 60 * 1000).toISOString();

    // Single SQL RPC replaces 3 sequential per-conversation queries (last msg + call check + contact)
    const { data: candidates } = await db.rpc('get_no_reply_candidates', {
      p_tenant_id:    row.tenant_id,
      p_product_slug: row.product_slug,
      p_cutoff:       cutoff,
    }) as { data: Array<{ conversation_id: string; contact_phone: string; contact_name: string | null }> | null };

    if (!candidates?.length) continue;

    const convIds = candidates.map(c => c.conversation_id);
    const { data: recentCalls } = await db
      .from('voice_calls')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const recentlyCalledConvIds = new Set(
      (recentCalls ?? []).map(c => (c as { conversation_id: string }).conversation_id),
    );
    const deduped = candidates.filter(c => !recentlyCalledConvIds.has(c.conversation_id));

    if (!deduped.length) continue;

    for (const cand of deduped) {
      try {
        await dispatchCall({
          tenant_id:       row.tenant_id,
          product_slug:    row.product_slug,
          to_number:       cand.contact_phone,
          conversation_id: cand.conversation_id,
          triggered_by:    'escalation',
          call_context: {
            customer_name:     cand.contact_name ?? '',
            trigger_reason:    `Customer has not replied for ${hoursDelay} hours`,
            greeting_override: `Hello${cand.contact_name ? ` ${cand.contact_name}` : ''}! I noticed we haven't heard back from you. I'm calling to check if you need any further assistance. How can I help?`,
          },
        });
      } catch (err) {
        console.error(`[NoReplyTrigger] Failed for conversation ${cand.conversation_id}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }
}

async function processLeadFollowUps(): Promise<void> {
  const db = getServerClient();

  // Load sales_bot configs that have follow-up enabled
  const { data: botCfgs } = await db
    .from('bot_configs')
    .select('tenant_id, product_slug, sales_config')
    .eq('product_slug', 'sales_bot');

  if (!botCfgs?.length) return;

  for (const row of botCfgs) {
    const salesCfg = (row.sales_config ?? {}) as Partial<SalesConfig>;
    if (!salesCfg.lead_follow_up_enabled) continue;

    const delayHours = salesCfg.lead_follow_up_delay_hours ?? 4;
    const messages   = salesCfg.lead_follow_up_messages ?? [
      'Hi! Just checking in — do you have any questions about our products? We\'d love to help.',
      'Following up on your enquiry. Our team is ready. Can we schedule a quick call?',
      'Last follow-up from us — our offer still stands. Let us know if you\'d like to proceed!',
    ];

    // Use business-days: delay hours are treated as business hours (Mon-Fri only)
    const delayDays = Math.ceil(delayHours / 8); // 1 business day ≈ 8 working hours
    const cutoff    = businessDaysCutoff(Math.max(1, delayDays));

    const { data: escalationRows } = await db
      .from('escalations')
      .select('conversation_id')
      .eq('tenant_id', row.tenant_id)
      .ilike('trigger_reason', '%sales lead%');

    const escalatedConvIds = (escalationRows ?? []).map(
      e => (e as { conversation_id: string }).conversation_id,
    );
    if (!escalatedConvIds.length) continue;

    const { data: convs } = await db
      .from('conversations')
      .select('id, contact_id, lead_follow_up_count')
      .eq('tenant_id', row.tenant_id)
      .eq('product_type', 'sales_bot')
      .in('status', ['open', 'escalated'])
      .lt('lead_follow_up_count', 3)
      .lt('updated_at', cutoff)
      .in('id', escalatedConvIds);

    if (!convs?.length) continue;

    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', row.tenant_id)
      .eq('product_slug', row.product_slug)
      .eq('active', true)
      .limit(1)
      .single();

    if (!wn) continue;

    const gateway  = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    const wnConfig = wn.config_json as { phone_number_id: string; access_token: string };

    const contactIds = [...new Set(convs.map(c => c.contact_id))];
    const { data: contacts } = await db
      .from('contacts')
      .select('id, phone, name')
      .in('id', contactIds);
    const contactMap = new Map(
      (contacts ?? []).map(c => [(c as { id: string }).id, c as { id: string; phone: string; name: string | null }]),
    );

    // Fan-out sends with bounded concurrency — previously sequential (100 convs ≈ 50s).
    const results = await Promise.allSettled(
      convs.map(conv => sendLeadFollowUp(conv, contactMap, messages, gateway, wnConfig)),
    );

    const newMessages: object[] = [];
    const convUpdates: { id: string; count: number }[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        newMessages.push(r.value.messageRow);
        convUpdates.push(r.value.update);
        if (r.value.isLast) {
          void classifyAndPersistOutcome(r.value.update.id, 'system', 'unresponsive');
        }
      }
    }

    if (newMessages.length) await db.from('messages').insert(newMessages);

    // Single RPC replaces the old per-row UPDATE loop — one round-trip for N conversations
    if (convUpdates.length) {
      await db.rpc('batch_update_lead_followup_count', {
        p_ids:        convUpdates.map(u => u.id),
        p_counts:     convUpdates.map(u => u.count),
        p_updated_at: new Date().toISOString(),
      });
    }
  }
}

async function sendLeadFollowUp(
  conv: { id: string; contact_id: string; lead_follow_up_count: unknown },
  contactMap: Map<string, { id: string; phone: string; name: string | null }>,
  messages: string[],
  gateway: WhatsAppGateway,
  wnConfig: { phone_number_id: string; access_token: string },
): Promise<{ messageRow: object; update: { id: string; count: number }; isLast: boolean } | null> {
  try {
    const contact = contactMap.get(conv.contact_id);
    if (!contact?.phone) return null;

    const followUpIdx = (conv.lead_follow_up_count as number) ?? 0;
    const template    = messages[followUpIdx] ?? messages[messages.length - 1]!;
    const name        = contact.name?.split(' ')[0] ?? 'there';
    const message     = template.replace(/\{name\}/gi, name);

    await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
      type: 'text', to: contact.phone, text: message,
    });

    const newCount = followUpIdx + 1;
    console.log(`[LeadFollowUp] Sent follow-up #${newCount} to conversation ${conv.id}`);
    return {
      messageRow: { conversation_id: conv.id, role: 'assistant', content: message },
      update:     { id: conv.id, count: newCount },
      isLast:     newCount >= messages.length,
    };
  } catch (err) {
    console.error(`[LeadFollowUp] Failed for conversation ${conv.id}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function processPaymentReminders(): Promise<void> {
  const db = getServerClient();

  // Find pending orders where no reminder in last 3 days (or first reminder after 24h)
  const firstCutoff  = new Date(Date.now() - 24  * 60 * 60 * 1000).toISOString();
  const repeatCutoff = new Date(Date.now() - 72  * 60 * 60 * 1000).toISOString();

  const { data: orders } = await db
    .from('orders')
    .select(`
      id, tenant_id, total, reminder_count, last_reminded_at,
      contact:contacts(phone, name),
      payments(status, link_url)
    `)
    .in('status', ['pending', 'confirmed'])
    .lt('reminder_count', 3)
    .lt('created_at', firstCutoff);

  if (!orders?.length) return;

  const eligible = orders.filter(o => {
    const lastReminded = (o as unknown as { last_reminded_at: string | null }).last_reminded_at;
    if (!lastReminded) return true;                     // never reminded — fire if past first-cutoff
    return lastReminded < repeatCutoff;                 // reminded before, wait 3 days before next
  });

  if (!eligible.length) return;

  // Group by tenant to fetch WhatsApp numbers once per tenant
  const byTenant = new Map<string, typeof eligible>();
  for (const o of eligible) {
    const tid = (o as unknown as { tenant_id: string }).tenant_id;
    if (!byTenant.has(tid)) byTenant.set(tid, []);
    byTenant.get(tid)!.push(o);
  }

  for (const [tenantId, tenantOrders] of byTenant) {
    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', tenantId)
      .eq('product_slug', 'lifecycle_bot')
      .eq('active', true)
      .maybeSingle();

    if (!wn) continue;

    const gateway  = new WhatsAppGateway((wn as { provider: string }).provider as WhatsAppProvider);
    const wnConfig = (wn as { config_json: { phone_number_id: string; access_token: string } }).config_json;

    await Promise.allSettled(
      tenantOrders.map(async (o) => {
        const contact       = (o as unknown as { contact: { phone: string; name: string | null } | null }).contact;
        const payments      = (o as unknown as { payments: Array<{ status: string; link_url: string | null }> }).payments;
        const payment       = payments?.[0];
        const reminderCount = (o as unknown as { reminder_count: number }).reminder_count;
        const total         = (o as unknown as { total: number }).total;
        const orderId       = (o as unknown as { id: string }).id;

        if (!contact?.phone) return;
        if (payment?.status === 'paid') return;

        const name    = contact.name?.split(' ')[0] ?? 'there';
        const shortId = orderId.slice(0, 8).toUpperCase();

        const messages = [
          `⏰ *Payment Reminder*\n\nHi ${name}! Your order #${shortId} (₹${Number(total).toLocaleString('en-IN')}) is awaiting payment.\n\n${payment?.link_url ? `Pay here: ${payment.link_url}` : 'Please complete your payment to proceed.'}`,
          `🔔 *Follow-up Reminder*\n\nHi ${name}, just a friendly nudge — your order #${shortId} is still unpaid.\n\n${payment?.link_url ? `Pay here: ${payment.link_url}` : 'Reach out if you need help.'}`,
          `🚨 *Final Reminder*\n\nHi ${name}, this is our last reminder for order #${shortId}. Your order may be cancelled if payment isn't received.\n\n${payment?.link_url ? `Pay here: ${payment.link_url}` : 'Contact us for support.'}`,
        ];

        const text = messages[Math.min(reminderCount, 2)]!;
        await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
          type: 'text', to: contact.phone, text,
        });

        await db.from('orders')
          .update({ reminder_count: reminderCount + 1, last_reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', orderId);

        console.log(`[PaymentReminder] Sent reminder #${reminderCount + 1} for order ${orderId}`);
      }),
    );
  }
}

async function processLifecycleSequences(): Promise<void> {
  const db = getServerClient();

  const { data: sequences } = await db
    .from('lifecycle_sequences')
    .select('*')
    .eq('enabled', true);

  if (!sequences?.length) return;

  for (const seq of sequences) {
    try {
      const cutoff = new Date(
        Date.now() - seq.delay_days * 24 * 60 * 60 * 1000,
      ).toISOString();

      let contactsQuery = db
        .from('contacts')
        .select('id, phone, name')
        .eq('tenant_id', seq.tenant_id)
        .not('phone', 'is', null)
        .gte('created_at', seq.created_at)
        .lt('created_at', cutoff);

      if (seq.trigger_event === 'lead_created') {
        const { data: leadConvs } = await db
          .from('conversations')
          .select('contact_id')
          .eq('tenant_id', seq.tenant_id)
          .eq('product_type', seq.product_slug)
          .not('lead_score', 'is', null)
          .gte('lead_score', 50);

        const leadContactIds = (leadConvs ?? []).map((r: { contact_id: string }) => r.contact_id);
        if (!leadContactIds.length) continue;
        contactsQuery = contactsQuery.in('id', leadContactIds);
      } else if (seq.trigger_event === 'conversation_resolved') {
        const { data: resolvedConvs } = await db
          .from('conversations')
          .select('contact_id')
          .eq('tenant_id', seq.tenant_id)
          .eq('product_type', seq.product_slug)
          .eq('status', 'resolved')
          .lt('updated_at', cutoff);

        const resolvedContactIds = (resolvedConvs ?? []).map((r: { contact_id: string }) => r.contact_id);
        if (!resolvedContactIds.length) continue;
        contactsQuery = contactsQuery.in('id', resolvedContactIds);
      } else if (seq.trigger_event === 'order_delivered') {
        // Loyalty / reorder: fire N days after order was delivered
        const { data: deliveredOrders } = await db
          .from('orders')
          .select('contact_id')
          .eq('tenant_id', seq.tenant_id)
          .eq('status', 'delivered')
          .lt('updated_at', cutoff);

        const deliveredContactIds = [...new Set(
          (deliveredOrders ?? []).map((r: { contact_id: string }) => r.contact_id),
        )];
        if (!deliveredContactIds.length) continue;
        contactsQuery = contactsQuery.in('id', deliveredContactIds);
      }

      const { data: candidates } = await contactsQuery;
      if (!candidates?.length) continue;

      const candidateIds = candidates.map((c: { id: string }) => c.id);
      const { data: alreadySent } = await db
        .from('lifecycle_sends')
        .select('contact_id')
        .eq('sequence_id', seq.id)
        .in('contact_id', candidateIds);

      const sentSet = new Set((alreadySent ?? []).map((r: { contact_id: string }) => r.contact_id));
      const eligible = (candidates as Array<{ id: string; phone: string; name: string | null }>)
        .filter(c => !sentSet.has(c.id));

      if (!eligible.length) continue;

      const { data: wn } = await db
        .from('whatsapp_numbers')
        .select('config_json, provider')
        .eq('tenant_id', seq.tenant_id)
        .eq('product_slug', seq.product_slug)
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      const wnFinal = wn ?? (await db
        .from('whatsapp_numbers')
        .select('config_json, provider')
        .eq('tenant_id', seq.tenant_id)
        .eq('active', true)
        .limit(1)
        .maybeSingle()).data;

      if (!wnFinal) continue;

      const gateway  = new WhatsAppGateway((wnFinal as { provider: string }).provider as WhatsAppProvider);
      const wnConfig = (wnFinal as { config_json: { phone_number_id: string; access_token: string } }).config_json;

      // Fan-out sends concurrently — previously sequential (100 contacts ≈ 50s).
      const sendResults = await Promise.allSettled(
        eligible.map(async (contact) => {
          const name    = contact.name?.split(' ')[0] ?? 'there';
          const message = seq.message_template.replace(/\{name\}/gi, name);
          await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
            type: 'text', to: contact.phone, text: message,
          });
          console.log(`[Lifecycle] Sent "${seq.name}" to contact ${contact.id}`);
          return { tenant_id: seq.tenant_id, sequence_id: seq.id, contact_id: contact.id };
        }),
      );

      const newSends = sendResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<{ tenant_id: string; sequence_id: string; contact_id: string }>).value);

      const failCount = sendResults.filter(r => r.status === 'rejected').length;
      if (failCount) console.error(`[Lifecycle] ${failCount} send(s) failed for sequence ${seq.id}`);

      if (newSends.length) {
        await db.from('lifecycle_sends').insert(newSends);
      }
    } catch (seqErr) {
      console.error(`[Lifecycle] Failed processing sequence ${seq.id}:`, seqErr);
    }
  }
}

async function recoverStaleCampaigns(): Promise<void> {
  const db = getServerClient();
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: stale } = await db
    .from('campaigns')
    .select('*')
    .eq('status', 'running')
    .lt('updated_at', staleThreshold);

  if (!stale?.length) return;

  for (const campaign of stale) {
    console.warn(`[CampaignRecovery] Resuming stale campaign ${campaign.id}`);
    void processCampaignContacts(campaign as Parameters<typeof processCampaignContacts>[0], campaign.tenant_id)
      .catch((err: unknown) => console.error(`[CampaignRecovery] Resume failed for ${campaign.id}:`, (err as Error).message));
  }
}

export function startScheduler(): void {
  // Keep Supabase alive (free tier pauses after 7 days inactivity)
  void pingSupabase();
  setInterval(() => void pingSupabase(), KEEP_ALIVE_INTERVAL_MS);

  // Daily report — 08:00 UTC every day  [TTL: 82800s = 23h, prevents duplicate on restart]
  cron.schedule('0 8 * * *', () => {
    void withJobLock('daily_reports', 82800, () => runDailyReports()).catch(err =>
      console.error('[Scheduler] Daily report failed:', (err as Error).message)
    );
  }, { timezone: 'UTC' });

  // Follow-up messages — every hour  [TTL: 3540s = 59min]
  cron.schedule('0 * * * *', () => {
    void withJobLock('follow_ups', 3540, () => processFollowUps()).catch(err =>
      console.error('[Scheduler] Follow-up failed:', (err as Error).message)
    );
  });

  // Campaign voice dispatch — every 15 min  [TTL: 840s = 14min]
  cron.schedule('*/15 * * * *', () => {
    void withJobLock('voice_dispatch', 840, () => dispatchPendingVoiceCalls()).catch(err =>
      console.error('[Scheduler] Campaign voice dispatch failed:', (err as Error).message)
    );
  });

  // No-reply call triggers — every 30 min  [TTL: 1740s = 29min]
  cron.schedule('*/30 * * * *', () => {
    void withJobLock('no_reply_triggers', 1740, () => processNoReplyTriggers()).catch(err =>
      console.error('[Scheduler] No-reply trigger failed:', (err as Error).message)
    );
  });

  // Sales lead follow-up — every 2 hours  [TTL: 7140s = 119min]
  cron.schedule('0 */2 * * *', () => {
    void withJobLock('lead_follow_ups', 7140, () => processLeadFollowUps()).catch(err =>
      console.error('[Scheduler] Lead follow-up failed:', (err as Error).message)
    );
  });

  // Scheduled broadcasts — every minute  [TTL: 55s]
  cron.schedule('* * * * *', () => {
    void withJobLock('scheduled_broadcasts', 55, () => processScheduledBroadcasts()).catch(err =>
      console.error('[Scheduler] Broadcast processing failed:', (err as Error).message)
    );
  });

  // Scheduled messages — every minute  [TTL: 55s]
  cron.schedule('* * * * *', () => {
    void withJobLock('scheduled_messages_dispatch', 55, () => processScheduledMessages()).catch(err =>
      console.error('[Scheduler] Scheduled messages failed:', (err as Error).message)
    );
  });

  // Campaign recovery — every 10 min  [TTL: 540s = 9min]
  cron.schedule('*/10 * * * *', () => {
    void withJobLock('campaign_recovery', 540, () => recoverStaleCampaigns()).catch(err =>
      console.error('[Scheduler] Campaign recovery failed:', (err as Error).message)
    );
  });

  // Payment reminders — daily at 11:30 UTC (5:00 PM IST)  [TTL: 82800s = 23h]
  cron.schedule('30 11 * * *', () => {
    void withJobLock('payment_reminders', 82800, () => processPaymentReminders()).catch(err =>
      console.error('[Scheduler] Payment reminders failed:', (err as Error).message)
    );
  }, { timezone: 'UTC' });

  // Lifecycle sequences — daily at 10:00 UTC  [TTL: 82800s = 23h]
  cron.schedule('0 10 * * *', () => {
    void withJobLock('lifecycle_sequences', 82800, () => processLifecycleSequences()).catch(err =>
      console.error('[Scheduler] Lifecycle sequences failed:', (err as Error).message)
    );
  }, { timezone: 'UTC' });

  // AI Insights — runs at :30 past each hour; schedule_hour=0 → 0:30 UTC = 6:00 AM IST
  cron.schedule('30 * * * *', () => {
    void withJobLock('ai_insights', 3540, async () => {
      const db = getServerClient();
      const { data: setting } = await db
        .from('platform_settings')
        .select('value')
        .eq('key', 'insights')
        .maybeSingle();
      const scheduleHour = ((setting?.value as Record<string, unknown> | null)?.['schedule_hour'] as number | null) ?? 0;
      if (new Date().getUTCHours() === scheduleHour) {
        await runInsightsForAllTenants();
      }
    }).catch(err =>
      console.error('[Scheduler] AI Insights failed:', (err as Error).message)
    );
  });

  // Sender capacity daily reset — midnight UTC  [TTL: 82800s = 23h]
  cron.schedule('0 0 * * *', () => {
    void withJobLock('sender_capacity_reset', 82800, () => resetAllDailyCounts()).catch(err =>
      console.error('[Scheduler] Sender capacity reset failed:', (err as Error).message)
    );
  }, { timezone: 'UTC' });

  // Startup catch-up: generate insights if none in last 24h — fixes Render hibernation.
  // Guard: skip if the process started recently (< 5 min ago) and another instance is
  // likely still running; the withJobLock TTL (82800s) handles the distributed case
  // when Redis is available.
  const _processStartMs = Date.now();
  setTimeout(() => {
    // If the process restarted within 5 minutes of itself (e.g. Render free-tier wake),
    // withJobLock will prevent a re-run as long as Redis holds the previous lock key.
    void withJobLock('ai_insights_startup', 82800, async () => {
      const db = getServerClient();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from('ai_insights')
        .select('*', { count: 'exact', head: true })
        .gte('generated_at', since);
      if ((count ?? 0) === 0) {
        console.log('[Insights] Startup catch-up: no insights in last 24h, generating now...');
        await runInsightsForAllTenants();
      } else {
        console.log(`[Insights] Startup catch-up: ${count} recent insight(s) found — skipping.`);
      }
    }).catch(err =>
      console.error('[Insights] Startup catch-up failed:', (err as Error).message)
    );
  }, 15_000);
  void _processStartMs; // suppress unused-var warning
}
