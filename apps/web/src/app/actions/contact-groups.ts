'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath }         from 'next/cache';
import { getSession }             from '@/lib/session';

// ─── Group CRUD ───────────────────────────────────────────────────────────────

export async function createContactGroup(
  name:        string,
  description: string,
  color:       string,
  emoji:       string,
): Promise<{ id?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('contact_groups')
    .insert({ tenant_id: session.tenantId, name: name.trim(), description: description.trim() || null, color, emoji })
    .select('id')
    .single();

  if (error) return { error: error.code === '23505' ? 'A group with this name already exists.' : error.message };
  revalidatePath('/groups');
  return { id: (data as { id: string }).id };
}

export async function updateContactGroup(
  groupId:     string,
  name:        string,
  description: string,
  color:       string,
  emoji:       string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('contact_groups')
    .update({ name: name.trim(), description: description.trim() || null, color, emoji })
    .eq('id', groupId)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function deleteContactGroup(groupId: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('contact_groups')
    .delete()
    .eq('id', groupId)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/groups');
  return {};
}

// ─── Membership ───────────────────────────────────────────────────────────────

export async function addContactToGroup(
  contactId: string,
  groupId:   string,
  addedBy:   'manual' | 'ai' = 'manual',
  aiReason?: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('contact_group_members')
    .upsert(
      { group_id: groupId, contact_id: contactId, tenant_id: session.tenantId, added_by: addedBy, ai_reason: aiReason ?? null },
      { onConflict: 'group_id,contact_id' },
    );

  if (error) return { error: error.message };
  revalidatePath('/conversations');
  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function removeContactFromGroup(
  contactId: string,
  groupId:   string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('contact_group_members')
    .delete()
    .eq('contact_id', contactId)
    .eq('group_id', groupId)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/conversations');
  revalidatePath(`/groups/${groupId}`);
  return {};
}

// ─── AI group suggestion ──────────────────────────────────────────────────────

type GroupSuggestion = {
  group_id:   string;
  group_name: string;
  reason:     string;
};

export async function suggestGroupForContact(
  contactId: string,
): Promise<{ suggestion?: GroupSuggestion; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  const [contactRes, groupsRes, convsRes] = await Promise.all([
    admin.from('contacts').select('name, phone, memory_json').eq('id', contactId).eq('tenant_id', session.tenantId).single(),
    admin.from('contact_groups').select('id, name, description').eq('tenant_id', session.tenantId).order('name'),
    admin.from('conversations').select('product_type, status, updated_at').eq('contact_id', contactId).eq('tenant_id', session.tenantId).order('updated_at', { ascending: false }).limit(5),
  ]);

  const contact = contactRes.data as {
    name: string | null; phone: string | null;
    memory_json: {
      sentiment?: string; preferences?: Record<string, string>;
      order_history?: string[]; open_issues?: string[];
      csat_score?: number;
    } | null;
  } | null;

  const groups = (groupsRes.data ?? []) as { id: string; name: string; description: string | null }[];
  const convs  = (convsRes.data ?? []) as { product_type: string; status: string; updated_at: string }[];

  if (!contact || groups.length === 0) {
    return { error: groups.length === 0 ? 'No groups created yet. Create groups first.' : 'Contact not found.' };
  }

  const mem = contact.memory_json ?? {};

  const contactSummary = [
    `Name: ${contact.name ?? '—'}`,
    `Phone: ${contact.phone ?? '—'}`,
    `Sentiment: ${mem.sentiment ?? 'unknown'}`,
    `CSAT score: ${mem.csat_score ?? 'no rating'}`,
    `Order history: ${(mem.order_history ?? []).join(', ') || 'none'}`,
    `Open issues: ${(mem.open_issues ?? []).join(', ') || 'none'}`,
    `Preferences: ${JSON.stringify(mem.preferences ?? {})}`,
    `Conversations: ${convs.map(c => `${c.product_type}/${c.status}`).join(', ') || 'none'}`,
  ].join('\n');

  const groupList = groups
    .map(g => `- id: "${g.id}", name: "${g.name}"${g.description ? `, description: "${g.description}"` : ''}`)
    .join('\n');

  const prompt = `You are classifying a customer contact into one of the groups below.

Available groups:
${groupList}

Contact data:
${contactSummary}

Choose the single best-matching group. Respond ONLY with valid JSON (no markdown):
{"group_id":"<id>","reason":"<one sentence why>"}`;

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return { error: 'AI not configured (missing ANTHROPIC_API_KEY).' };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return { error: `AI API error: ${res.status}` };

    const json = await res.json() as { content?: Array<{ text?: string }> };
    const raw  = json.content?.[0]?.text?.trim() ?? '';

    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
    const parsed  = JSON.parse(cleaned) as { group_id: string; reason: string };

    const matched = groups.find(g => g.id === parsed.group_id);
    if (!matched) return { error: 'AI returned an unrecognised group ID.' };

    return { suggestion: { group_id: parsed.group_id, group_name: matched.name, reason: parsed.reason } };
  } catch (err) {
    return { error: `AI suggestion failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
