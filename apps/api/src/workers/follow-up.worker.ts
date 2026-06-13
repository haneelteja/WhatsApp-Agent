import { Worker } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { getServerClient } from '@alphabot/database';
import { WhatsAppGateway } from '../services/whatsapp/gateway.js';
import type { WhatsAppProvider } from '@alphabot/shared';

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

      // Find open conversations idle longer than the configured threshold
      const { data: allConversations } = await db
        .from('conversations')
        .select('id, contact_id')
        .eq('tenant_id', config.tenant_id)
        .eq('product_type', config.product_slug)
        .eq('status', 'open')
        .lt('updated_at', cutoff);

      // Apply scope filter in JS (avoids PostgREST uuid[] syntax complexity)
      const scope       = config.scope ?? 'all';
      const contactIds  = (config.contact_ids ?? []) as string[];
      const conversations = (allConversations ?? []).filter(conv => {
        if (scope === 'include' && contactIds.length > 0) return contactIds.includes(conv.contact_id);
        if (scope === 'exclude' && contactIds.length > 0) return !contactIds.includes(conv.contact_id);
        return true; // 'all'
      });

      if (!conversations.length) continue;

      // Get WhatsApp gateway config for this tenant + product
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

      for (const conv of conversations) {
        try {
          // Check how many follow-ups already sent for this conversation
          const { count } = await db
            .from('follow_up_sends')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id);

          if ((count ?? 0) >= config.max_follow_ups) continue;

          // Get contact info for message personalisation
          const { data: contact } = await db
            .from('contacts')
            .select('phone, name')
            .eq('id', conv.contact_id)
            .single();

          if (!contact) continue;

          const name    = contact.name?.split(' ')[0] ?? 'there';
          const message = config.message_template.replace(/\{name\}/gi, name);

          await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
            type: 'text',
            to:   contact.phone,
            text: message,
          });

          // Store the message in conversation history
          await db.from('messages').insert({
            conversation_id: conv.id,
            role:            'assistant',
            content:         message,
          });

          // Record the send for max_follow_ups tracking
          await db.from('follow_up_sends').insert({ conversation_id: conv.id });

          // Bump updated_at so the idle clock resets
          await db.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conv.id);

          console.log(`[FollowUp] Sent to conversation ${conv.id} (${contact.phone})`);
        } catch (convErr) {
          console.error(`[FollowUp] Failed for conversation ${conv.id}:`, convErr);
        }
      }
    } catch (configErr) {
      console.error(`[FollowUp] Failed processing config ${config.id}:`, configErr);
    }
  }
}

export function startFollowUpWorker(): Worker {
  const worker = new Worker(
    'follow-ups',
    async (job) => {
      console.log(`[FollowUp] Running job ${job.id}`);
      await processFollowUps();
      console.log(`[FollowUp] Job ${job.id} complete`);
    },
    {
      connection: getRedis(),
      concurrency: 1,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[FollowUp] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
