import Anthropic from '@anthropic-ai/sdk';
import { getServerClient } from '@alphabot/database';

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
    { data: buttonTemplates },
    { count: campaignCount },
  ] = await Promise.all([
    db.from('kb_collections').select('name, entry_count').eq('tenant_id', tenantId).eq('active', true),
    db.from('bot_configs').select('product_slug, guardrails_json, escalation_triggers, confidence_threshold, kb_only_mode').eq('tenant_id', tenantId),
    db.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo),
    db.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'escalated').gte('created_at', sevenDaysAgo),
    db.from('interactive_button_templates').select('id').eq('tenant_id', tenantId).eq('is_active', true),
    db.from('campaigns').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ]);

  const totalConvsN = totalConvs ?? 0;
  const escalatedConvsN = escalatedConvs ?? 0;
  const escalationRate = totalConvsN > 0 ? Math.round((escalatedConvsN / totalConvsN) * 100) : 0;
  const totalKbEntries = (kbCollections ?? []).reduce((sum, c) => sum + ((c as {entry_count?: number}).entry_count ?? 0), 0);
  const kbCollectionCount = kbCollections?.length ?? 0;
  const buttonCount = buttonTemplates?.length ?? 0;
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
    `- Escalated: ${escalatedConvsN} (${escalationRate}%)`,
    '',
    'FEATURES CONFIGURED:',
    `- Active button templates: ${buttonCount}`,
    `- Campaigns: ${campaignCountN}`,
  );

  const context = contextLines.join('\n');

  const response = await _anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `You are an expert WhatsApp AI bot consultant. Analyze this client's bot configuration and generate 3-5 specific, actionable recommendations to improve their bot's performance and customer experience.

CLIENT CONFIGURATION:
${context}

Generate 3-5 suggestions as a JSON array (return ONLY the array, no other text):
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

Be specific. Mention actual numbers from their config. Don't suggest things that are already well-configured. Prioritize issues that directly hurt bot performance (high escalation rate, empty KB, no guardrails).`,
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
