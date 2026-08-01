import cron from 'node-cron';
import { getServerClient } from '@alphabot/database';
import { runDailyReports } from '../lib/email/daily-report.js';
import { WhatsAppGateway } from '../services/whatsapp/gateway.js';
import { dispatchPendingVoiceCalls } from '../services/campaign/index.js';
import type { WhatsAppProvider } from '@alphabot/shared';

const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function pingSupabase(): Promise<void> {
  try {
    await getServerClient().from('tenants').select('id').limit(1);
    console.log('[KeepAlive] Supabase OK');
  } catch {
    console.warn('[KeepAlive] Supabase ping failed');
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

          console.log(`[FollowUp] Sent to conversation ${conv.id} (${contact.phone})`);
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

export function startScheduler(): void {
  // Keep Supabase alive (free tier pauses after 7 days inactivity)
  void pingSupabase();
  setInterval(() => void pingSupabase(), KEEP_ALIVE_INTERVAL_MS);

  // Daily report — 08:00 UTC every day
  cron.schedule('0 8 * * *', () => {
    console.log('[Scheduler] Running daily report');
    void runDailyReports().catch(err =>
      console.error('[Scheduler] Daily report failed:', (err as Error).message)
    );
  }, { timezone: 'UTC' });

  // Follow-up messages — every hour
  cron.schedule('0 * * * *', () => {
    console.log('[Scheduler] Running follow-up check');
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

  console.log('[Scheduler] Daily report (08:00 UTC), follow-up (hourly), and campaign voice dispatch (every 15 min) scheduled');
}
