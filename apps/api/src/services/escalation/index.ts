import { getServerClient } from '@alphabot/database';
import type { Conversation } from '@alphabot/shared';
import { WhatsAppGateway } from '../whatsapp/gateway.js';
import type { WhatsAppProvider } from '@alphabot/shared';

export interface EscalationResult {
  escalationId: string;
  conversationId: string;
}

export async function escalateConversation(
  conversation: Conversation,
  triggerReason: string
): Promise<EscalationResult> {
  const db = getServerClient();

  // 1. Flip conversation status
  await db
    .from('conversations')
    .update({ status: 'escalated' })
    .eq('id', conversation.id);

  // 2. Create escalation record
  const { data, error } = await db
    .from('escalations')
    .insert({
      conversation_id: conversation.id,
      trigger_reason: triggerReason,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create escalation: ${error.message}`);

  // 3. Fire all notifications non-blocking
  void sendEscalationNotifications(conversation, triggerReason);

  return {
    escalationId: (data as { id: string }).id,
    conversationId: conversation.id,
  };
}

export async function claimEscalation(
  conversationId: string,
  escalationId: string,
  agentId: string
): Promise<void> {
  const db = getServerClient();

  await Promise.all([
    db.from('conversations').update({
      status: 'bot_paused',
      assigned_agent_id: agentId,
    }).eq('id', conversationId),

    db.from('escalations').update({
      agent_id: agentId,
      status: 'assigned',
    }).eq('id', escalationId),

    db.from('agent_sessions').insert({
      conversation_id: conversationId,
      agent_id: agentId,
    }),
  ]);
}

export async function releaseToBot(
  conversationId: string,
  agentId: string,
  resolutionNote?: string
): Promise<void> {
  const db = getServerClient();

  await Promise.all([
    db.from('conversations').update({
      status: 'open',
      assigned_agent_id: null,
    }).eq('id', conversationId),

    db.from('escalations').update({ status: 'resolved' })
      .eq('conversation_id', conversationId)
      .eq('status', 'assigned'),

    db.from('agent_sessions').update({
      ended_at: new Date().toISOString(),
      resolution_note: resolutionNote ?? null,
    })
      .eq('conversation_id', conversationId)
      .eq('agent_id', agentId)
      .is('ended_at', null),
  ]);
}

// ─── Internal notification dispatcher ────────────────────────────────────────

async function sendEscalationNotifications(
  conversation: Conversation,
  triggerReason: string
): Promise<void> {
  const db = getServerClient();

  // Fetch notification settings, contact, recent messages, and WhatsApp config in parallel
  const [settingsRes, contactRes, messagesRes, wnRes] = await Promise.all([
    db.from('tenant_notification_settings')
      .select('escalation_emails, escalation_wa_numbers, escalation_customer_message')
      .eq('tenant_id', conversation.tenant_id)
      .single(),
    db.from('contacts')
      .select('phone, name')
      .eq('id', conversation.contact_id)
      .single(),
    db.from('messages')
      .select('role, content, timestamp')
      .eq('conversation_id', conversation.id)
      .order('timestamp', { ascending: false })
      .limit(10),
    db.from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', conversation.tenant_id)
      .eq('product_slug', conversation.product_type)
      .eq('active', true)
      .limit(1)
      .single(),
  ]);

  const settings = settingsRes.data;
  const contact  = contactRes.data;
  const messages = (messagesRes.data ?? []).reverse(); // oldest first
  const wn       = wnRes.data;

  const customerName  = contact?.name ?? contact?.phone ?? 'Unknown';
  const customerPhone = contact?.phone ?? '—';

  const webUrl  = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
  const convUrl = `${webUrl}/conversations/${conversation.id}`;

  // ── 1. WhatsApp acknowledgment to customer ─────────────────────────────
  const customerMessage = settings?.escalation_customer_message
    ?? 'Your query has been escalated to our team. A team member will get back to you shortly.';

  if (wn && contact?.phone) {
    const wnConfig = wn.config_json as { phone_number_id: string; access_token: string };
    const gateway  = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    try {
      await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
        type: 'text',
        to:   contact.phone,
        text: customerMessage,
      });
      // Store in messages table so it appears in dashboard
      await db.from('messages').insert({
        conversation_id: conversation.id,
        role:            'assistant',
        content:         customerMessage,
      });
    } catch (err) {
      console.error('[Escalation] Failed to send customer WA acknowledgment:', err);
    }
  }

  // Build conversation transcript (last 10 messages)
  const transcript = messages
    .map((m: { role: string; content: string }) => `[${m.role === 'user' ? 'Customer' : 'Bot'}]: ${m.content}`)
    .join('\n');

  // ── 2. Email to each configured address ────────────────────────────────
  const emails = (settings?.escalation_emails as string[] | null) ?? [];
  if (emails.length > 0) {
    void sendEscalationEmails(emails, {
      customerName,
      customerPhone,
      triggerReason,
      transcript,
      convUrl,
      tenantId: conversation.tenant_id,
    });
  }

  // ── 3. WhatsApp to each configured team number ─────────────────────────
  const waNumbers = (settings?.escalation_wa_numbers as string[] | null) ?? [];
  if (waNumbers.length > 0 && wn) {
    const wnConfig = wn.config_json as { phone_number_id: string; access_token: string };
    const gateway  = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    // Compact message for WhatsApp (use last 3 messages)
    const shortTranscript = messages.slice(-3)
      .map((m: { role: string; content: string }) => `${m.role === 'user' ? '👤' : '🤖'} ${m.content.substring(0, 120)}${m.content.length > 120 ? '…' : ''}`)
      .join('\n');

    const teamWaMessage = [
      `🚨 *New Escalation*`,
      ``,
      `*Customer:* ${customerName}`,
      `*Phone:* ${customerPhone}`,
      `*Reason:* ${triggerReason}`,
      ``,
      `*Recent messages:*`,
      shortTranscript,
      ``,
      `View: ${convUrl}`,
    ].join('\n');

    for (const number of waNumbers) {
      try {
        await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
          type: 'text',
          to:   number,
          text: teamWaMessage,
        });
      } catch (err) {
        console.error(`[Escalation] Failed to send team WA to ${number}:`, err);
      }
    }
  }
}

async function sendEscalationEmails(
  emails: string[],
  ctx: {
    customerName: string;
    customerPhone: string;
    triggerReason: string;
    transcript: string;
    convUrl: string;
    tenantId: string;
  }
): Promise<void> {
  const apiKey = process.env['RESEND_API_KEY'];
  const from   = process.env['RESEND_FROM_EMAIL'] ?? 'alerts@alphabot.in';
  if (!apiKey) return;

  const transcriptHtml = ctx.transcript
    .split('\n')
    .map(line => `<p style="margin:4px 0;font-size:13px;color:#333;">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
      <div style="margin-bottom:20px;">
        <span style="font-weight:700;font-size:18px;color:#111">Alphabot</span>
        <span style="display:inline-block;margin-left:10px;background:#fef2f2;color:#dc2626;font-size:12px;font-weight:600;padding:3px 8px;border-radius:99px;">Escalation</span>
      </div>
      <h2 style="font-size:18px;font-weight:700;color:#111;margin:0 0 16px">New conversation escalated</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#666;font-size:13px;width:140px;">Customer</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111;">${ctx.customerName}</td></tr>
        <tr><td style="padding:8px 0;color:#666;font-size:13px;">Phone</td><td style="padding:8px 0;font-size:13px;color:#111;">${ctx.customerPhone}</td></tr>
        <tr><td style="padding:8px 0;color:#666;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:13px;color:#111;">${ctx.triggerReason}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="font-size:12px;font-weight:600;color:#666;margin:0 0 10px;text-transform:uppercase;letter-spacing:.05em;">Recent Conversation</p>
        ${transcriptHtml}
      </div>
      <a href="${ctx.convUrl}" style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
        View Conversation →
      </a>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: emails,
      subject: `[Alphabot] Escalation: ${ctx.customerName} — ${ctx.triggerReason}`,
      html,
    }),
  }).catch(err => console.error('[Escalation] Resend error:', err));
}
