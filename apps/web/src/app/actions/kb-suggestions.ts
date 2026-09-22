'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { revalidatePath }         from 'next/cache';

export interface KBSuggestion {
  id:             string;
  question:       string;
  answer_draft:   string;
  source_queries: string[];
  status:         'pending' | 'approved' | 'rejected';
  collection_id:  string | null;
  created_at:     string;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getKBSuggestionsAction(): Promise<KBSuggestion[]> {
  const session = await getSession();
  if (!session) return [];
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('kb_entry_suggestions')
    .select('id, question, answer_draft, source_queries, status, collection_id, created_at')
    .eq('tenant_id', session.tenantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(30);
  return (data ?? []) as KBSuggestion[];
}

// ── Generate (on-demand, LLM-powered) ────────────────────────────────────────

export async function generateKBSuggestionsAction(): Promise<{ generated: number; error?: string }> {
  const session = await getSession();
  if (!session) return { generated: 0, error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  // 1. Fetch top unanswered queries
  const { data: rows } = await admin
    .from('kb_unanswered_queries')
    .select('query')
    .eq('tenant_id', session.tenantId)
    .gte('created_at', since)
    .limit(500);

  if (!rows?.length) return { generated: 0 };

  // 2. Group by normalised key (lowercase, strip punctuation, first 60 chars)
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

  const groups: Record<string, string[]> = {};
  for (const r of rows) {
    const key = normalize(r.query);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r.query);
  }

  // 3. Pick top 12 groups by frequency
  const topClusters = Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12);

  if (topClusters.length === 0) return { generated: 0 };

  // 4. Skip clusters that already have a pending suggestion
  const { data: existing } = await admin
    .from('kb_entry_suggestions')
    .select('question')
    .eq('tenant_id', session.tenantId)
    .eq('status', 'pending');
  const existingQuestions = new Set((existing ?? []).map(r => normalize(r.question)));
  const toGenerate = topClusters.filter(([key]) => !existingQuestions.has(key));
  if (toGenerate.length === 0) return { generated: 0 };

  // 5. Fetch tenant's bot system prompt for context
  const { data: botCfg } = await admin
    .from('bot_configs')
    .select('system_prompt, persona_name, company_description')
    .eq('tenant_id', session.tenantId)
    .limit(1)
    .maybeSingle();
  const context = [
    botCfg?.persona_name ? `Bot name: ${botCfg.persona_name}` : '',
    botCfg?.company_description ? `Business: ${botCfg.company_description}` : '',
    botCfg?.system_prompt ? `Role: ${botCfg.system_prompt.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');

  // 6. Call LLM once with all queries in a batch prompt
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return { generated: 0, error: 'No Anthropic API key configured' };

  const queryList = toGenerate
    .map(([, samples], i) => `${i + 1}. ${samples[0]}`)
    .join('\n');

  const systemPrompt = `You are a knowledge base author for a WhatsApp AI assistant.${context ? `\n\n${context}` : ''}

Your task: for each customer question below, write a clear, accurate FAQ answer.

Respond ONLY with valid JSON array (no markdown):
[
  { "question": "<original question rewritten as a clean FAQ question>", "answer": "<answer in 1-3 sentences>" },
  ...
]

Rules:
- Keep answers factual and concise (under 200 words each)
- Do not invent specific details (prices, hours, policies) — use generic but helpful language
- If a question is too vague to answer well, write a helpful "to find out, please contact us" style answer
- Output exactly ${toGenerate.length} items in the same order as the input`;

  let drafts: { question: string; answer: string }[] = [];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: `Customer questions:\n${queryList}` }],
      }),
    });
    const json = await res.json() as { content: Array<{ type: string; text: string }> };
    const text  = json.content?.[0]?.text ?? '[]';
    const clean = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    drafts = JSON.parse(clean) as { question: string; answer: string }[];
  } catch {
    return { generated: 0, error: 'LLM generation failed' };
  }

  // 7. Insert suggestions
  const inserts = drafts
    .filter(d => d.question && d.answer)
    .map((d, i) => ({
      tenant_id:     session.tenantId,
      question:      d.question,
      answer_draft:  d.answer,
      source_queries: toGenerate[i]?.[1] ?? [],
      status:        'pending' as const,
    }));

  if (inserts.length === 0) return { generated: 0 };

  const { error } = await admin.from('kb_entry_suggestions').insert(inserts);
  if (error) return { generated: 0, error: error.message };

  revalidatePath('/knowledge-base');
  return { generated: inserts.length };
}

// ── Approve ───────────────────────────────────────────────────────────────────

export async function approveKBSuggestionAction(
  suggestionId: string,
  collectionId: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  // Fetch the suggestion
  const { data: suggestion } = await admin
    .from('kb_entry_suggestions')
    .select('question, answer_draft')
    .eq('id', suggestionId)
    .eq('tenant_id', session.tenantId)
    .single();

  if (!suggestion) return { error: 'Suggestion not found' };

  // Insert as a live KB entry
  const { error: insertErr } = await admin.from('knowledge_base').insert({
    tenant_id:    session.tenantId,
    collection_id: collectionId,
    question:     suggestion.question,
    answer:       suggestion.answer_draft,
    status:       'live',
    product_type: 'support_bot',
    version:      1,
  });
  if (insertErr) return { error: insertErr.message };

  // Mark suggestion as approved
  await admin
    .from('kb_entry_suggestions')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: session.userId })
    .eq('id', suggestionId);

  revalidatePath('/knowledge-base');
  return {};
}

// ── Reject ────────────────────────────────────────────────────────────────────

export async function rejectKBSuggestionAction(suggestionId: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  await admin
    .from('kb_entry_suggestions')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: session.userId })
    .eq('id', suggestionId)
    .eq('tenant_id', session.tenantId);

  revalidatePath('/knowledge-base');
  return {};
}
