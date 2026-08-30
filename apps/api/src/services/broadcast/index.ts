import { getServerClient }    from '@alphabot/database';
import { WhatsAppGateway }    from '../whatsapp/gateway.js';
import type { WhatsAppProvider } from '@alphabot/shared';

type AudienceType = 'all' | 'recent_7d' | 'recent_10d' | 'groups';

interface ContactTarget {
  phone: string;
  name:  string | null;
}

async function resolveAudience(
  tenantId:     string,
  audienceType: AudienceType,
  groupIds:     string[],
): Promise<ContactTarget[]> {
  const db = getServerClient();

  if (audienceType === 'groups') {
    if (!groupIds.length) return [];
    const { data } = await db
      .from('contact_group_members')
      .select('contacts(phone, name)')
      .eq('tenant_id', tenantId)
      .in('group_id', groupIds);

    const seen = new Set<string>();
    const out: ContactTarget[] = [];
    for (const row of (data ?? []) as unknown as Array<{ contacts: { phone: string; name: string | null } | null }>) {
      if (!row.contacts?.phone || seen.has(row.contacts.phone)) continue;
      seen.add(row.contacts.phone);
      out.push({ phone: row.contacts.phone, name: row.contacts.name });
    }
    return out;
  }

  let query = db
    .from('contacts')
    .select('phone, name')
    .eq('tenant_id', tenantId)
    .not('phone', 'is', null);

  if (audienceType === 'recent_7d') {
    query = query.gte('updated_at', new Date(Date.now() - 7 * 86_400_000).toISOString());
  } else if (audienceType === 'recent_10d') {
    query = query.gte('updated_at', new Date(Date.now() - 10 * 86_400_000).toISOString());
  }

  const { data } = await query;
  return (data ?? []) as ContactTarget[];
}

export async function executeBroadcast(broadcastId: string): Promise<void> {
  const db = getServerClient();

  const { data: bcast } = await db
    .from('broadcast_messages')
    .select('*')
    .eq('id', broadcastId)
    .single();

  if (!bcast || !['draft', 'scheduled'].includes(bcast.status as string)) return;

  // Lock row — mark as sending
  await db
    .from('broadcast_messages')
    .update({ status: 'sending' })
    .eq('id', broadcastId)
    .eq('status', bcast.status); // optimistic lock — only proceed if still in expected state

  // Resolve contacts
  const contacts = await resolveAudience(
    bcast.tenant_id as string,
    bcast.audience_type as AudienceType,
    (bcast.group_ids ?? []) as string[],
  );

  if (!contacts.length) {
    await db.from('broadcast_messages').update({
      status: 'sent', total_count: 0, sent_count: 0, failed_count: 0,
    }).eq('id', broadcastId);
    return;
  }

  // Find the first active WhatsApp number for this tenant
  const { data: wn } = await db
    .from('whatsapp_numbers')
    .select('config_json, provider')
    .eq('tenant_id', bcast.tenant_id)
    .eq('active', true)
    .limit(1)
    .single();

  if (!wn) {
    await db.from('broadcast_messages').update({
      status: 'failed', total_count: contacts.length, error_message: 'No active WhatsApp number configured.',
    }).eq('id', broadcastId);
    return;
  }

  const gateway  = new WhatsAppGateway(wn.provider as WhatsAppProvider);
  const wnConfig = wn.config_json as { phone_number_id: string; access_token: string };

  let sentCount   = 0;
  let failedCount = 0;

  for (const contact of contacts) {
    try {
      const message = (bcast.message as string).replace(/\{name\}/gi, contact.name?.split(' ')[0] ?? 'there');
      await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
        type: 'text',
        to:   contact.phone,
        text: message,
      });
      sentCount++;
    } catch {
      failedCount++;
    }

    // Persist progress every 50 sends so the UI can reflect it
    if ((sentCount + failedCount) % 50 === 0) {
      await db.from('broadcast_messages').update({
        sent_count: sentCount, failed_count: failedCount,
      }).eq('id', broadcastId);
    }
  }

  await db.from('broadcast_messages').update({
    status:       failedCount === contacts.length ? 'failed' : 'sent',
    total_count:  contacts.length,
    sent_count:   sentCount,
    failed_count: failedCount,
  }).eq('id', broadcastId);
}

export async function processScheduledBroadcasts(): Promise<void> {
  const db = getServerClient();
  const now = new Date().toISOString();

  const { data: due } = await db
    .from('broadcast_messages')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);

  if (!due?.length) return;

  for (const row of due) {
    try {
      await executeBroadcast((row as { id: string }).id);
    } catch (err) {
      console.error(`[Broadcast] Failed to execute ${(row as { id: string }).id}:`, (err as Error).message);
    }
  }
}
