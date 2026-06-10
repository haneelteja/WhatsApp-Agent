import { getServerClient } from '@alphabot/database';
import type { Conversation } from '@alphabot/shared';

export interface EscalationResult {
  escalationId: string;
  conversationId: string;
}

/**
 * Escalate a conversation to a human agent.
 *
 * Steps:
 *  1. Set conversation status → 'escalated'
 *  2. Insert escalation record
 *  3. Fire email alert via Resend (non-blocking)
 */
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

  // 3. Non-blocking email alert
  void sendEscalationEmail(conversation.tenant_id, conversation.id, triggerReason);

  return {
    escalationId: (data as { id: string }).id,
    conversationId: conversation.id,
  };
}

/**
 * Agent claims an escalation and starts a session.
 */
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

/**
 * Agent releases the conversation back to the bot.
 */
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

async function sendEscalationEmail(
  tenantId: string,
  conversationId: string,
  reason: string
): Promise<void> {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['RESEND_FROM_EMAIL'] ?? 'alerts@alphabot.in';
  if (!apiKey) return;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [from],  // Replace with tenant supervisor email in Phase 2
      subject: `[Alphabot] Escalation required — ${reason}`,
      html: `
        <p>A conversation requires human attention.</p>
        <ul>
          <li><strong>Tenant:</strong> ${tenantId}</li>
          <li><strong>Conversation:</strong> ${conversationId}</li>
          <li><strong>Reason:</strong> ${reason}</li>
        </ul>
        <p>Log in to your Alphabot dashboard to take over.</p>
      `,
    }),
  }).catch(() => { /* non-critical */ });
}
