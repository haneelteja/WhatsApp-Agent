import Anthropic from '@anthropic-ai/sdk';
import { getServerClient } from '@alphabot/database';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FailurePattern {
  type: string;
  count: number;
  description: string;
}

interface FailureBatchResult {
  failure_summary: FailurePattern[];
}

// ── Failure analysis (SkillOpt analyst_error pattern) ─────────────────────────
// Fetches recent failed conversations, splits into minibatches of 8, and runs
// parallel Claude calls to identify common failure patterns. Returns a flat list
// of patterns merged across all batches (deduplicated by type label).

const MINIBATCH_SIZE = 8;

async function analyzeFailureBatch(
  anthropic: Anthropic,
  transcripts: string[],
  tenantId: string,
  batchIdx: number,
): Promise<FailurePattern[]> {
  const prompt = `You are an expert WhatsApp AI bot analyst. Review this batch of ${transcripts.length} FAILED conversations (customers who did not convert or abandoned).

Identify the most important COMMON failure patterns across this batch. Focus on systemic issues — not individual edge cases.

Conversations:
${transcripts.map((t, i) => `--- Conversation ${i + 1} ---\n${t}`).join('\n\n')}

Respond ONLY with a JSON object:
{
  "failure_summary": [
    { "type": "short label", "count": N, "description": "what is going wrong and how to fix it" }
  ]
}

Rules:
- List at most 4 patterns per batch
- Only include patterns present in ≥2 conversations
- Descriptions must be actionable (what to add/change in the bot or KB)
- Reply with valid JSON only, no markdown`;

  try {
    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw   = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '{}';
    const clean = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(clean) as FailureBatchResult;
    return Array.isArray(parsed.failure_summary) ? parsed.failure_summary : [];
  } catch (err) {
    console.error(`[Insights] Batch ${batchIdx} failure analysis error for tenant ${tenantId}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

function mergeFailurePatterns(batches: FailurePattern[][]): FailurePattern[] {
  const map = new Map<string, FailurePattern>();
  for (const batch of batches) {
    for (const p of batch) {
      const key = p.type.toLowerCase().trim();
      if (map.has(key)) {
        map.get(key)!.count += p.count;
      } else {
        map.set(key, { ...p });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

async function runFailureAnalysis(
  anthropic: Anthropic,
  tenantId: string,
): Promise<FailurePattern[]> {
  const db = getServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch failed conversations with their last 6 messages
  const { data: failedConvs } = await db
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('outcome_hard', 0)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(40);

  if (!failedConvs?.length) return [];

  const convIds = (failedConvs as Array<{ id: string }>).map(c => c.id);

  const { data: msgs } = await db
    .from('messages')
    .select('conversation_id, role, content')
    .in('conversation_id', convIds)
    .order('conversation_id')
    .order('timestamp', { ascending: false });

  if (!msgs?.length) return [];

  // Group messages by conversation and build short transcripts
  const byConv = new Map<string, Array<{ role: string; content: string }>>();
  for (const m of (msgs as Array<{ conversation_id: string; role: string; content: string }>)) {
    if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []);
    // Keep only last 6 messages per conversation (already ordered desc — reverse for readability)
    const arr = byConv.get(m.conversation_id)!;
    if (arr.length < 6) arr.push(m);
  }

  const transcripts = [...byConv.values()].map(messages =>
    messages
      .reverse()
      .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content.slice(0, 180)}`)
      .join('\n'),
  );

  // Split into minibatches and run in parallel
  const batches: string[][] = [];
  for (let i = 0; i < transcripts.length; i += MINIBATCH_SIZE) {
    batches.push(transcripts.slice(i, i + MINIBATCH_SIZE));
  }

  const batchResults = await Promise.allSettled(
    batches.map((batch, idx) => analyzeFailureBatch(anthropic, batch, tenantId, idx)),
  );

  const successfulResults = batchResults
    .filter((r): r is PromiseFulfilledResult<FailurePattern[]> => r.status === 'fulfilled')
    .map(r => r.value);

  return mergeFailurePatterns(successfulResults);
}

// Module-level singleton — previously instantiated inside generateInsightsForTenant
// which created a new SDK client object on every call (one per tenant per run).
const _anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

// Minimal concurrency limiter — avoids adding a new package dependency.
function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            if (queue.length) queue.shift()!();
          });
      };
      if (active < concurrency) run(); else queue.push(run);
    });
}

export interface Suggestion {
  fingerprint: string;
  title: string;
  description: string;
  category: 'knowledge_base' | 'guardrails' | 'bot_config' | 'campaigns' | 'buttons' | 'general';
  priority: 'high' | 'medium' | 'low';
  action_link: string;
}

export async function generateInsightsForTenant(tenantId: string): Promise<void> {
  const db = getServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: kbCollections },
    { data: botConfigs },
    { count: totalConvs },
    { count: escalatedConvs },
    { count: failedConvs },
    { count: convertedConvs },
    { data: buttonTemplates },
    { count: campaignCount },
    failurePatterns,
  ] = await Promise.all([
    db.from('kb_collections').select('name, entry_count').eq('tenant_id', tenantId).eq('active', true),
    db.from('bot_configs').select('product_slug, guardrails_json, escalation_triggers, confidence_threshold, kb_only_mode').eq('tenant_id', tenantId),
    db.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo),
    db.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'escalated').gte('created_at', sevenDaysAgo),
    db.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('outcome_hard', 0).gte('created_at', sevenDaysAgo),
    db.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('outcome_hard', 1).gte('created_at', sevenDaysAgo),
    db.from('interactive_button_templates').select('id').eq('tenant_id', tenantId).eq('is_active', true),
    db.from('campaigns').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    runFailureAnalysis(_anthropic, tenantId),
  ]);

  const totalConvsN    = totalConvs ?? 0;
  const escalatedConvsN = escalatedConvs ?? 0;
  const failedConvsN   = failedConvs ?? 0;
  const convertedConvsN = convertedConvs ?? 0;
  const escalationRate = totalConvsN > 0 ? Math.round((escalatedConvsN / totalConvsN) * 100) : 0;
  const failureRate    = totalConvsN > 0 ? Math.round((failedConvsN / totalConvsN) * 100) : 0;
  const conversionRate = totalConvsN > 0 ? Math.round((convertedConvsN / totalConvsN) * 100) : 0;
  const totalKbEntries = (kbCollections ?? []).reduce((sum, c) => sum + ((c as {entry_count?: number}).entry_count ?? 0), 0);
  const kbCollectionCount = kbCollections?.length ?? 0;
  const buttonCount    = buttonTemplates?.length ?? 0;
  const campaignCountN = campaignCount ?? 0;

  const contextLines: string[] = [
    'KNOWLEDGE BASE:',
    `- Collections: ${kbCollectionCount}`,
    `- Total entries: ${totalKbEntries}`,
    kbCollectionCount > 0 ? `- Names: ${(kbCollections ?? []).map((c) => (c as {name: string}).name).join(', ')}` : '- No collections configured',
    '',
    `BOT CONFIGURATIONS (${(botConfigs ?? []).length} bots):`,
  ];

  for (const cfg of (botConfigs ?? [])) {
    const g = (cfg.guardrails_json ?? {}) as Record<string, unknown>;
    contextLines.push(
      `\n${cfg.product_slug as string}:`,
      `  KB-only mode: ${cfg.kb_only_mode ?? false}`,
      `  Confidence threshold: ${cfg.confidence_threshold ?? 0.6}`,
      `  Escalation trigger count: ${((cfg.escalation_triggers as string[] | null) ?? []).length}`,
      `  Blocked topics: ${((g['blocked_topics'] as string[] | null) ?? []).length}`,
      `  Blocked keywords: ${((g['blocked_keywords'] as string[] | null) ?? []).length}`,
      `  Tone: ${(g['tone'] as string | null) ?? 'professional'}`,
    );
  }

  contextLines.push(
    '',
    'CONVERSATION STATS (last 7 days):',
    `- Total conversations: ${totalConvsN}`,
    `- Converted (hard=1): ${convertedConvsN} (${conversionRate}%)`,
    `- Failed (hard=0): ${failedConvsN} (${failureRate}%)`,
    `- Escalated: ${escalatedConvsN} (${escalationRate}%)`,
    '',
    'FEATURES CONFIGURED:',
    `- Active button templates: ${buttonCount}`,
    `- Campaigns: ${campaignCountN}`,
  );

  // Append failure pattern analysis if available
  if (failurePatterns.length > 0) {
    contextLines.push(
      '',
      `FAILURE PATTERN ANALYSIS (from ${failedConvsN} failed conversations this week):`,
    );
    for (const p of failurePatterns) {
      contextLines.push(`- [${p.count}x] ${p.type}: ${p.description}`);
    }
  }

  const context = contextLines.join('\n');

  const response = await _anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `You are an expert WhatsApp AI bot consultant. Analyze this client's bot configuration and recent conversation failure patterns. Generate 3-6 specific, actionable recommendations to improve their bot's performance and conversion rate.

CLIENT CONFIGURATION AND FAILURE ANALYSIS:
${context}

Generate 3-6 suggestions as a JSON array (return ONLY the array, no other text):
[
  {
    "fingerprint": "snake_case_unique_issue_id",
    "title": "Short title (max 55 chars)",
    "description": "Specific actionable advice referencing their actual numbers (1-2 sentences).",
    "category": "knowledge_base",
    "priority": "high",
    "action_link": "/knowledge-base"
  }
]

Category must be one of: knowledge_base, guardrails, bot_config, campaigns, buttons, general
Priority must be one of: high, medium, low
action_link must be one of: /knowledge-base, /guardrails, /settings, /campaigns, /button-templates, /analytics

Rules:
- If FAILURE PATTERN ANALYSIS is present, prioritise those findings — they come from real conversation transcripts
- Mention actual numbers from their config
- Don't suggest things that are already well-configured
- Prioritize by impact on conversion rate and failure rate`,
    }],
  });

  const rawText = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';
  let suggestions: Suggestion[] = [];
  try {
    // Strip possible markdown code fences
    const clean = rawText.replace(/^```json?\n?/i, '').replace(/\n?```$/, '').trim();
    suggestions = JSON.parse(clean) as Suggestion[];
    if (!Array.isArray(suggestions)) suggestions = [];
  } catch {
    console.error(`[Insights] Failed to parse response for tenant ${tenantId}:`, rawText.slice(0, 300));
    return;
  }

  // Upsert: one row per tenant per calendar day
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const { data: existing } = await db
    .from('ai_insights')
    .select('id')
    .eq('tenant_id', tenantId)
    .gte('generated_at', todayStart.toISOString())
    .lt('generated_at', todayEnd.toISOString())
    .maybeSingle();

  if (existing) {
    await db.from('ai_insights')
      .update({ suggestions, generated_at: new Date().toISOString(), dismissed_fingerprints: [] })
      .eq('id', (existing as { id: string }).id);
  } else {
    await db.from('ai_insights')
      .insert({ tenant_id: tenantId, suggestions, dismissed_fingerprints: [] });
  }

  console.log(`[Insights] Generated ${suggestions.length} suggestions for tenant ${tenantId}`);
}

export async function runInsightsForAllTenants(): Promise<void> {
  const db = getServerClient();
  const { data: tenants } = await db
    .from('tenant_products')
    .select('tenant_id')
    .eq('active', true);

  const uniqueIds = [...new Set((tenants ?? []).map((t) => (t as { tenant_id: string }).tenant_id))];
  console.log(`[Insights] Running for ${uniqueIds.length} tenants`);

  // Process up to 5 tenants concurrently — previously sequential (50 tenants ≈ 2.5 min).
  const limit = pLimit(5);
  await Promise.allSettled(
    uniqueIds.map(tenantId =>
      limit(async () => {
        try {
          await generateInsightsForTenant(tenantId);
        } catch (err) {
          console.error(`[Insights] Failed for tenant ${tenantId}:`, err instanceof Error ? err.message : String(err));
        }
      }),
    ),
  );
}
