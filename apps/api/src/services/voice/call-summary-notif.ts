// Post-call WhatsApp summary notification.
// Fires after runPostCallProcessing completes — sends a formatted summary
// to each phone number configured in tenant_voice_configs.call_summary_wa_numbers.

import { getServerClient }  from '@alphabot/database';
import { WhatsAppGateway }  from '../whatsapp/gateway.js';
import type { WhatsAppProvider } from '@alphabot/shared';

type Outcome = {
  intent?:            string;
  product_interest?:  string;
  resolved?:          boolean;
  escalation_needed?: boolean;
  sentiment?:         string;
  follow_up_action?:  string;
  summary?:           string;
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive:   '😊',
  neutral:    '😐',
  negative:   '😞',
  frustrated: '😤',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export async function sendCallSummaryNotifications(voiceCallId: string): Promise<void> {
  const db = getServerClient();

  // Load call details
  const { data: callRow } = await db
    .from('voice_calls')
    .select('id, tenant_id, product_slug, to_number, status, duration_seconds, turn_count, outcome_json, created_at')
    .eq('id', voiceCallId)
    .single();

  if (!callRow) return;

  const call = callRow as {
    id:               string;
    tenant_id:        string;
    product_slug:     string | null;
    to_number:        string;
    status:           string;
    duration_seconds: number | null;
    turn_count:       number;
    outcome_json:     Outcome | null;
    created_at:       string;
  };

  // Load call summary config
  const { data: tvc } = await db
    .from('tenant_voice_configs')
    .select('call_summary_enabled, call_summary_wa_numbers')
    .eq('tenant_id', call.tenant_id)
    .single();

  const tvcRow = tvc as { call_summary_enabled: boolean; call_summary_wa_numbers: string[] } | null;
  if (!tvcRow?.call_summary_enabled) return;

  const phones = tvcRow.call_summary_wa_numbers ?? [];
  if (phones.length === 0) return;

  // Find a WhatsApp number to send FROM — prefer the bot's number, fall back to any active number
  let wnData: { config_json: unknown; provider: string } | null = null;

  if (call.product_slug) {
    const { data } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', call.tenant_id)
      .eq('product_slug', call.product_slug)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    wnData = data;
  }

  if (!wnData) {
    const { data } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', call.tenant_id)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    wnData = data;
  }

  if (!wnData) return;

  const wnConfig = wnData.config_json as { phone_number_id: string; access_token: string };
  if (!wnConfig.phone_number_id || !wnConfig.access_token) return;

  const gateway = new WhatsAppGateway(wnData.provider as WhatsAppProvider);
  const webUrl  = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
  const callUrl = `${webUrl}/voice/${call.id}`;

  const outcome = call.outcome_json;
  const lines: string[] = [
    '📞 *Voice Call Summary*',
    '',
    `*Caller:* ${call.to_number}`,
    `*Duration:* ${formatDuration(call.duration_seconds)} · ${call.turn_count} turn${call.turn_count !== 1 ? 's' : ''}`,
    `*Status:* ${call.status === 'completed' ? '✅ Completed' : call.status}`,
  ];

  if (outcome) {
    lines.push('');
    if (outcome.intent)                                              lines.push(`*Intent:* ${outcome.intent}`);
    if (outcome.product_interest && outcome.product_interest !== 'none') lines.push(`*Product Interest:* ${outcome.product_interest}`);
    if (outcome.sentiment) {
      const emoji = SENTIMENT_EMOJI[outcome.sentiment] ?? '';
      lines.push(`*Sentiment:* ${emoji} ${outcome.sentiment}`);
    }
    lines.push(`*Resolved:* ${outcome.resolved ? '✅ Yes' : '❌ No'}`);
    if (outcome.escalation_needed) lines.push('*⚠️ Escalation needed*');
    if (outcome.follow_up_action && outcome.follow_up_action !== 'none') {
      lines.push(`*Next steps:* ${outcome.follow_up_action}`);
    }
    if (outcome.summary) {
      lines.push('');
      lines.push(`*Summary:* ${outcome.summary}`);
    }
  }

  lines.push('');
  lines.push(`🔗 ${callUrl}`);

  const message = lines.join('\n');

  for (const phone of phones) {
    try {
      await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
        type: 'text',
        to:   phone,
        text: message,
      });
    } catch (err) {
      console.error(
        `[CallSummary] Failed to send to ${phone}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
