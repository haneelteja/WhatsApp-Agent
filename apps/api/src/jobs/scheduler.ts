import cron from 'node-cron';
import { getServerClient } from '@alphabot/database';
import { runDailyReports } from '../lib/email/daily-report.js';
import { WhatsAppGateway } from '../services/whatsapp/gateway.js';
import { dispatchPendingVoiceCalls, processCampaignContacts } from '../services/campaign/index.js';
import type { BotVoiceConfig, WhatsAppProvider } from '@alphabot/shared';

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

function isWithinBusinessHours(cfg: BotVoiceConfig): boolean {
  if (!cfg.business_hours_only) return true;
  const tz = cfg.business_hours_timezone || 'Asia/Kolkata';
  const tzDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const day = tzDate.getDay();
  const minutes = tzDate.getHours() * 60 + tzDate.getMinutes();
  const [sh = 9, sm = 0] = (cfg.business_hours_start ?? '09:00').split(':').map(Number);
  const [eh = 18, em = 0] = (cfg.business_hours_end ?? '18:00').split(':').map(Number);
  const days = (cfg.business_hours_days?.length ?? 0) > 0 ? cfg.business_hours_days : [1, 2, 3, 4, 5];
  return days.includes(day) && minutes >= sh * 60 + sm && minutes < eh * 60 + em;
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

    for (const cand of candidates) {
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

  // Campaign recovery — reset and resume campaigns stuck in 'running' after a server restart.
  // A campaign is considered stale if it has been 'running' for more than 10 minutes
  // with no contact status change (updated_at on the campaign row hasn't advanced).
  cron.schedule('*/10 * * * *', () => {
    void recoverStaleCampaigns().catch(err =>
      console.error('[Scheduler] Campaign recovery failed:', (err as Error).message)
    );
  });
}

async function recoverStaleCampaigns(): Promise<void> {
  const db = getServerClient();
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: stale } = await db
    .from('campaigns')
    .select('id, tenant_id, product_slug')
    .eq('status', 'running')
    .lt('updated_at', staleThreshold);

  if (!stale?.length) return;

  for (const campaign of stale) {
    console.warn(`[CampaignRecovery] Resuming stale campaign ${campaign.id}`);
    // Re-set status to running (resets updated_at) then resume processing
    await db.from('campaigns').update({ status: 'running' }).eq('id', campaign.id);
    void processCampaignContacts(campaign.id, campaign.tenant_id, campaign.product_slug)
      .catch(err => console.error(`[CampaignRecovery] Resume failed for ${campaign.id}:`, (err as Error).message));
  }
}
