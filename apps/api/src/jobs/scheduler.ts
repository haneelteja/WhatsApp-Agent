import cron from 'node-cron';
import { getServerClient } from '@alphabot/database';
import { runDailyReports } from '../lib/email/daily-report.js';
import { WhatsAppGateway } from '../services/whatsapp/gateway.js';
import { dispatchPendingVoiceCalls, processCampaignContacts } from '../services/campaign/index.js';
import { processScheduledBroadcasts } from '../services/broadcast/index.js';
import { isWithinBusinessHours } from '../lib/business-hours.js';
import { runInsightsForAllTenants } from '../services/insights/generator.js';
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
      const cutoff = new Date(
        Date.now() - config.idle_days * 24 * 60 * 60 * 1000
      ).toISOString();

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

      // Collect inserts/updates — send messages sequentially to respect WA rate limits
      const newMessages:     object[] = [];
      const newSends:        object[] = [];
      const updatedConvIds:  string[] = [];

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

    // Deduplicate: skip any conversation that already had a call attempt in the last 24h
    // (regardless of status — failed calls should not re-trigger immediately)
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

    const cutoff = new Date(Date.now() - delayHours * 3_600_000).toISOString();

    // Pre-fetch escalation conversation IDs into a plain array.
    // Passing a query builder object to .in() was the bug — PostgREST
    // coerced it to "[object Object]" so no rows ever matched.
    const { data: escalationRows } = await db
      .from('escalations')
      .select('conversation_id')
      .eq('tenant_id', row.tenant_id)
      .ilike('trigger_reason', '%sales lead%');

    const escalatedConvIds = (escalationRows ?? []).map(
      e => (e as { conversation_id: string }).conversation_id,
    );
    if (!escalatedConvIds.length) continue;

    // Sales lead conversations that are stale and haven't hit the follow-up cap.
    // Include 'escalated' (human notified but not yet claimed) and 'open'.
    // Exclude 'bot_paused' (agent actively working it) and 'resolved'.
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

    const newMessages:    object[] = [];
    const convUpdates:    { id: string; count: number }[] = [];

    for (const conv of convs) {
      try {
        const contact = contactMap.get(conv.contact_id);
        if (!contact?.phone) continue;

        const followUpIdx = (conv.lead_follow_up_count as number) ?? 0;
        const template    = messages[followUpIdx] ?? messages[messages.length - 1]!;
        const name        = contact.name?.split(' ')[0] ?? 'there';
        const message     = template.replace(/\{name\}/gi, name);

        await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
          type: 'text',
          to:   contact.phone,
          text: message,
        });

        newMessages.push({ conversation_id: conv.id, role: 'assistant', content: message });
        convUpdates.push({ id: conv.id, count: followUpIdx + 1 });

        console.log(`[LeadFollowUp] Sent follow-up #${followUpIdx + 1} to conversation ${conv.id}`);
      } catch (err) {
        console.error(`[LeadFollowUp] Failed for conversation ${conv.id}:`, err instanceof Error ? err.message : String(err));
      }
    }

    // Batch inserts — replaces N×2 sequential round-trips with 1+N updates
    if (newMessages.length) await db.from('messages').insert(newMessages);
    const now = new Date().toISOString();
    for (const u of convUpdates) {
      await db.from('conversations')
        .update({ lead_follow_up_count: u.count, updated_at: now })
        .eq('id', u.id);
    }
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

      // Find contacts created after this sequence was configured,
      // old enough to have crossed the delay threshold,
      // and not yet sent this sequence.
      let contactsQuery = db
        .from('contacts')
        .select('id, phone, name')
        .eq('tenant_id', seq.tenant_id)
        .not('phone', 'is', null)
        .gte('created_at', seq.created_at)   // only post-config contacts
        .lt('created_at', cutoff);           // old enough

      if (seq.trigger_event === 'lead_created') {
        // Only contacts who have at least one conversation flagged as a lead
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
        // Only contacts who have a resolved conversation for this product
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
      }

      const { data: candidates } = await contactsQuery;
      if (!candidates?.length) continue;

      // Filter out already-sent contacts
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

      // Fallback to any active number if product-specific not found
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

      const newSends: object[] = [];

      for (const contact of eligible) {
        try {
          const name    = contact.name?.split(' ')[0] ?? 'there';
          const message = seq.message_template.replace(/\{name\}/gi, name);

          await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
            type: 'text',
            to:   contact.phone,
            text: message,
          });

          newSends.push({ tenant_id: seq.tenant_id, sequence_id: seq.id, contact_id: contact.id });
          console.log(`[Lifecycle] Sent "${seq.name}" to contact ${contact.id}`);
        } catch (err) {
          console.error(`[Lifecycle] Failed for contact ${contact.id}:`, err instanceof Error ? err.message : String(err));
        }
      }

      if (newSends.length) {
        await db.from('lifecycle_sends').insert(newSends);
      }
    } catch (seqErr) {
      console.error(`[Lifecycle] Failed processing sequence ${seq.id}:`, seqErr);
    }
  }
}

export function startScheduler(): void {
  // Keep Supabase alive (free tier pauses after 7 days inactivity)
  void pingSupabase();
  setInterval(() => void pingSupabase(), KEEP_ALIVE_INTERVAL_MS);

  // Daily report — 08:00 UTC every day
  cron.schedule('0 8 * * *', () => {
    void runDailyReports().catch(err =>
      console.error('[Scheduler] Daily report failed:', (err as Error).message)
    );
  }, { timezone: 'UTC' });

  // Follow-up messages — every hour
  cron.schedule('0 * * * *', () => {
    void processFollowUps().catch(err =>
      console.error('[Scheduler] Follow-up failed:', (err as Error).message)
    );
  });

  // 'Both' campaigns — dispatch voice calls for contacts that had WA sent N hours ago with no reply
  cron.schedule('*/15 * * * *', () => {
    void dispatchPendingVoiceCalls().catch(err =>
      console.error('[Scheduler] Campaign voice dispatch failed:', (err as Error).message)
    );
  });

  // No-reply call triggers — check every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    void processNoReplyTriggers().catch(err =>
      console.error('[Scheduler] No-reply trigger failed:', (err as Error).message)
    );
  });

  // Sales lead follow-up sequences — every 2 hours
  cron.schedule('0 */2 * * *', () => {
    void processLeadFollowUps().catch(err =>
      console.error('[Scheduler] Lead follow-up failed:', (err as Error).message)
    );
  });

  // Scheduled broadcast execution — check every minute
  cron.schedule('* * * * *', () => {
    void processScheduledBroadcasts().catch(err =>
      console.error('[Scheduler] Broadcast processing failed:', (err as Error).message)
    );
  });

  // Campaign recovery — reset and resume campaigns stuck in 'running' after a server restart.
  // A campaign is considered stale if it has been 'running' for more than 10 minutes
  // with no contact status change (updated_at on the campaign row hasn't advanced).
  cron.schedule('*/10 * * * *', () => {
    void recoverStaleCampaigns().catch(err =>
      console.error('[Scheduler] Campaign recovery failed:', (err as Error).message)
    );
  });

  // Lifecycle sequences — daily at 10:00 UTC
  cron.schedule('0 10 * * *', () => {
    void processLifecycleSequences().catch(err =>
      console.error('[Scheduler] Lifecycle sequences failed:', (err as Error).message)
    );
  }, { timezone: 'UTC' });

  // AI Insights — run once a day at the platform-configured hour (default 9 AM UTC)
  cron.schedule('0 * * * *', async () => {
    try {
      const db = getServerClient();
      const { data: setting } = await db
        .from('platform_settings')
        .select('value')
        .eq('key', 'insights')
        .maybeSingle();
      const scheduleHour = ((setting?.value as Record<string, unknown> | null)?.['schedule_hour'] as number | null) ?? 9;
      if (new Date().getUTCHours() === scheduleHour) {
        await runInsightsForAllTenants();
      }
    } catch (err) {
      console.error('[Scheduler] AI Insights failed:', (err as Error).message);
    }
  });
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
