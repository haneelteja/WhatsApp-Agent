// Campaign execution engine.
// Handles WhatsApp / Voice / Both channel campaigns with retry logic.
//
// 'whatsapp' : sends a WhatsApp message via the existing gateway
// 'voice'    : dispatches an Omnidim-free voice call via call-manager
// 'both'     : sends WhatsApp first; after N hours with no reply, dispatches a voice call

import { getServerClient } from '@alphabot/database';
import { getBotContext } from '../bot-context.js';
import { dispatchCall } from '../voice/call-manager.js';
import { WhatsAppGateway } from '../whatsapp/gateway.js';
import type {
  CampaignV2, CampaignContact, CampaignRetryConfig, CreateCampaignRequest,
  ProductSlug, WhatsAppProvider,
} from '@alphabot/shared';

// ─── Create campaign ──────────────────────────────────────────────────────────

export async function createCampaign(
  tenantId: string,
  req:      CreateCampaignRequest,
): Promise<string> {
  const db = getServerClient();

  if ((req.channel === 'whatsapp' || req.channel === 'both') && !req.message_template) {
    throw new Error('message_template is required for WhatsApp or Both channel campaigns');
  }
  if ((req.channel === 'voice' || req.channel === 'both') && !req.voice_script) {
    throw new Error('voice_script is required for Voice or Both channel campaigns');
  }

  const retryConfig: CampaignRetryConfig = {
    auto_retry:           true,
    retry_limit:          2,
    retry_after_hours:    4,
    voice_after_wa_hours: 2,
    ...req.retry_config,
  };

  const { data: campaign, error } = await db
    .from('campaigns')
    .insert({
      tenant_id:        tenantId,
      name:             req.name,
      trigger_type:     'manual',
      template_id:      req.name,   // legacy NOT NULL column — use name as placeholder
      channel:          req.channel,
      product_slug:     req.product_slug,
      status:           req.schedule_at ? 'scheduled' : 'draft',
      contact_count:    req.contacts.length,
      message_template: req.message_template ?? null,
      voice_script:     req.voice_script ?? null,
      schedule_at:      req.schedule_at ?? null,
      retry_config:     retryConfig,
    })
    .select('id')
    .single();

  if (error || !campaign) throw new Error(`Failed to create campaign: ${error?.message}`);
  const campaignId = (campaign as { id: string }).id;

  // Insert contacts — pre-mark irrelevant channel as 'skipped' so the
  // contact processor query (which filters by the active channel's status)
  // actually finds them.
  const contactRows = req.contacts.map(c => ({
    campaign_id:     campaignId,
    tenant_id:       tenantId,
    phone_number:    c.phone_number,
    customer_name:   c.customer_name ?? null,
    extra_data:      c,
    whatsapp_status: req.channel === 'voice'     ? 'skipped' : 'pending',
    voice_status:    req.channel === 'whatsapp'  ? 'skipped' : 'pending',
  }));

  const { error: contactsErr } = await db.from('campaign_contacts').insert(contactRows);
  if (contactsErr) throw new Error(`Failed to insert contacts: ${contactsErr.message}`);

  return campaignId;
}

// ─── Launch a campaign ────────────────────────────────────────────────────────

export async function launchCampaign(campaignId: string, tenantId: string): Promise<void> {
  const db = getServerClient();

  const { data: campaign } = await db
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('tenant_id', tenantId)
    .single();

  if (!campaign) throw new Error('Campaign not found');
  const camp = campaign as CampaignV2;

  if (camp.status === 'running') return;

  await db.from('campaigns').update({ status: 'running' }).eq('id', campaignId);

  // Fire and forget — process contacts in background
  void processCampaignContacts(camp, tenantId);
}

export async function pauseCampaign(campaignId: string, tenantId: string): Promise<void> {
  const db = getServerClient();
  await db.from('campaigns')
    .update({ status: 'paused' })
    .eq('id', campaignId)
    .eq('tenant_id', tenantId);
}

export async function cancelCampaign(campaignId: string, tenantId: string): Promise<void> {
  const db = getServerClient();
  await db.from('campaigns')
    .update({ status: 'cancelled' })
    .eq('id', campaignId)
    .eq('tenant_id', tenantId);
}

// ─── Contact processor ────────────────────────────────────────────────────────

const CONCURRENT_LIMIT = 3;  // max concurrent sends to avoid rate limits

async function processCampaignContacts(campaign: CampaignV2, tenantId: string): Promise<void> {
  const db = getServerClient();
  const debugLog: string[] = [];
  const log = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    debugLog.push(entry);
    console.log(`[Campaign:${campaign.id}] ${msg}`);
  };

  log(`started — channel=${campaign.channel}, retry_config=${JSON.stringify(campaign.retry_config)}`);

  const retryConfig = (campaign.retry_config as CampaignRetryConfig | null) ?? {
    auto_retry: true, retry_limit: 2, retry_after_hours: 4, voice_after_wa_hours: 2,
  };

  try {
    // Own the status transition — launchCampaign also sets this, but there can be
    // a read-after-write lag between that update and the first check below.
    await db.from('campaigns').update({ status: 'running' }).eq('id', campaign.id);
    log('set status=running');

    let offset = 0;
    const PAGE  = 50;

    while (true) {
      const { data: statusCheck } = await db
        .from('campaigns').select('status').eq('id', campaign.id).single();
      const currentStatus = (statusCheck as { status: string } | null)?.status;
      log(`status check: ${currentStatus}`);
      if (currentStatus !== 'running') break;

      const waFilter    = campaign.channel === 'voice'    ? 'skipped' : 'pending';
      const voiceFilter = campaign.channel === 'whatsapp' ? 'skipped' : 'pending';
      log(`querying contacts — whatsapp_status=${waFilter}, voice_status=${voiceFilter}, attempts<${retryConfig.retry_limit + 1}`);

      const { data: contacts, error: qErr } = await db
        .from('campaign_contacts')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('whatsapp_status', waFilter)
        .eq('voice_status', voiceFilter)
        .lt('attempts', retryConfig.retry_limit + 1)
        .range(offset, offset + PAGE - 1);

      if (qErr) log(`query error: ${qErr.message}`);
      log(`contacts found: ${contacts?.length ?? 0}`);

      if (!contacts || contacts.length === 0) {
        // Fetch actual contact statuses to diagnose mismatch
        const { data: allC } = await db
          .from('campaign_contacts')
          .select('phone_number, whatsapp_status, voice_status, attempts')
          .eq('campaign_id', campaign.id);
        log(`all contacts dump: ${JSON.stringify(allC)}`);
        break;
      }

      for (let i = 0; i < contacts.length; i += CONCURRENT_LIMIT) {
        const batch = (contacts as CampaignContact[]).slice(i, i + CONCURRENT_LIMIT);
        await Promise.allSettled(batch.map(c => processOneContact(campaign, c, tenantId)));
        await new Promise(r => setTimeout(r, 500));
      }

      offset += PAGE;
    }

    log('loop finished — marking completed');
    await db.from('campaigns')
      .update({ status: 'completed', stats: { debug_log: debugLog } })
      .eq('id', campaign.id);

  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    log(`FATAL: ${msg}`);
    await db.from('campaigns')
      .update({ stats: { debug_log: debugLog } })
      .eq('id', campaign.id);
  }
}

async function processOneContact(
  campaign: CampaignV2,
  contact:  CampaignContact,
  tenantId: string,
): Promise<void> {
  const db = getServerClient();

  // Increment attempt counter
  await db.from('campaign_contacts')
    .update({ attempts: contact.attempts + 1, last_attempt_at: new Date().toISOString() })
    .eq('id', contact.id);

  try {
    if (campaign.channel === 'whatsapp') {
      await sendWhatsApp(campaign, contact, tenantId);
    } else if (campaign.channel === 'voice') {
      await sendVoiceCall(campaign, contact, tenantId);
    } else if (campaign.channel === 'both') {
      // Send WhatsApp first
      await sendWhatsApp(campaign, contact, tenantId);
      // Voice dispatch is handled by a scheduled job (checks wa_sent + time elapsed)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Campaign] Contact ${contact.phone_number} failed:`, msg);
    await db.from('campaign_contacts')
      .update({
        whatsapp_status: 'failed',
        voice_status:    'failed',
        outcome_json:    { error: msg },
      })
      .eq('id', contact.id);
  }

  // Update campaign stats
  await updateCampaignStats(campaign.id);
}

async function sendWhatsApp(campaign: CampaignV2, contact: CampaignContact, tenantId: string): Promise<void> {
  const db = getServerClient();

  const botCtx = await getBotContext(tenantId, campaign.product_slug as ProductSlug, 'meta_cloud');
  const wn = botCtx.whatsapp_number;
  if (!wn) throw new Error('No WhatsApp number configured for this bot');

  const gateway = new WhatsAppGateway(wn.provider as WhatsAppProvider);
  const config  = wn.config_json as { phone_number_id: string; access_token: string };

  // Personalise message template
  const messageText = personaliseTemplate(
    campaign.message_template ?? '',
    contact.customer_name ?? '',
    contact.extra_data,
  );

  await gateway.sendMessage(config.phone_number_id, config.access_token, {
    type: 'text',
    to:   contact.phone_number,
    text: messageText,
  });

  await db.from('campaign_contacts')
    .update({ whatsapp_status: 'sent' })
    .eq('id', contact.id);
}

async function sendVoiceCall(campaign: CampaignV2, contact: CampaignContact, tenantId: string): Promise<void> {
  const db = getServerClient();

  await db.from('campaign_contacts')
    .update({ voice_status: 'initiated' })
    .eq('id', contact.id);

  const result = await dispatchCall({
    tenant_id:    tenantId,
    product_slug: campaign.product_slug ?? 'support_bot',
    to_number:    contact.phone_number,
    campaign_id:  campaign.id,
    triggered_by: 'campaign',
    call_context: {
      campaign_name:    campaign.name,
      customer_name:    contact.customer_name ?? '',
      voice_script:     campaign.voice_script ?? '',
      ...(contact.extra_data as Record<string, string>),
    },
  });

  await db.from('campaign_contacts')
    .update({ voice_call_id: result.voice_call_id, voice_status: 'initiated' })
    .eq('id', contact.id);
}

/**
 * For 'both' campaigns: checks contacts that had WhatsApp sent N hours ago
 * with no reply and dispatches a voice call.
 * Called by the scheduler every 15 minutes.
 */
export async function dispatchPendingVoiceCalls(tenantId?: string): Promise<void> {
  const db = getServerClient();

  const { data: campaigns } = await db
    .from('campaigns')
    .select('id, tenant_id, product_slug, voice_script, retry_config, both_config')
    .eq('status', 'running')
    .eq('channel', 'both')
    .order('created_at', { ascending: true });

  for (const camp of (campaigns ?? []) as CampaignV2[]) {
    if (tenantId && camp.tenant_id !== tenantId) continue;

    const hoursDelay = (camp.both_config?.dispatch_voice_if_no_reply_hours ?? 2);
    const cutoffTime = new Date(Date.now() - hoursDelay * 60 * 60 * 1000).toISOString();

    const { data: contacts } = await db
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', camp.id)
      .eq('whatsapp_status', 'sent')       // WA was sent
      .eq('voice_status', 'pending')       // voice not yet dispatched
      .lt('last_attempt_at', cutoffTime);  // enough time has passed

    for (const c of (contacts ?? []) as CampaignContact[]) {
      try {
        await sendVoiceCall(camp, c, camp.tenant_id);
      } catch (err) {
        console.error(`[Campaign:Both] Voice dispatch failed for ${c.phone_number}:`, err);
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function personaliseTemplate(
  template: string,
  name:     string,
  extra:    Record<string, unknown>,
): string {
  let result = template
    .replace(/\{\{name\}\}/gi,          name || 'Customer')
    .replace(/\{\{customer_name\}\}/gi, name || 'Customer');

  // Replace any {{key}} with extra_data values
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string') {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value);
    }
  }

  return result;
}

async function updateCampaignStats(campaignId: string): Promise<void> {
  const db = getServerClient();

  const { data } = await db
    .from('campaign_contacts')
    .select('whatsapp_status, voice_status')
    .eq('campaign_id', campaignId);

  const contacts = (data ?? []) as Array<{ whatsapp_status: string; voice_status: string }>;

  const stats = {
    total:           contacts.length,
    wa_sent:         contacts.filter(c => ['sent', 'replied'].includes(c.whatsapp_status)).length,
    wa_replied:      contacts.filter(c => c.whatsapp_status === 'replied').length,
    wa_failed:       contacts.filter(c => c.whatsapp_status === 'failed').length,
    calls_made:      contacts.filter(c => ['initiated', 'answered', 'voicemail', 'no_answer'].includes(c.voice_status)).length,
    calls_answered:  contacts.filter(c => c.voice_status === 'answered').length,
    calls_voicemail: contacts.filter(c => c.voice_status === 'voicemail').length,
    calls_failed:    contacts.filter(c => c.voice_status === 'failed').length,
  };

  await db.from('campaigns').update({ stats }).eq('id', campaignId);
}
