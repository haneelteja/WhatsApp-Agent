import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime    = 'nodejs';
export const maxDuration = 60;

type UpsertRow = {
  provider:       string;
  model_id:       string;
  display_name:   string;
  context_window: number | null;
  is_active:      boolean;
  last_seen_at:   string;
};

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env['CRON_SECRET']}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin   = getSupabaseAdminClient();
  const now     = new Date().toISOString();
  const results: Record<string, { fetched: number; error?: string }> = {};

  // Load platform-level API keys (tenant_id IS NULL)
  const { data: platformConfigs } = await admin
    .from('llm_configs')
    .select('provider, api_key')
    .is('tenant_id', null);

  const keyMap: Record<string, string> = {};
  for (const c of platformConfigs ?? []) {
    keyMap[String(c.provider)] = String(c.api_key);
  }

  // ── Anthropic ─────────────────────────────────────────────────────────────
  const anthropicKey = keyMap['anthropic'] ?? process.env['ANTHROPIC_API_KEY'];
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      });
      if (res.ok) {
        const data = await res.json() as { data: Array<{ id: string; display_name?: string }> };
        const models = data.data ?? [];
        const rows: UpsertRow[] = models.map(m => ({
          provider: 'anthropic', model_id: m.id,
          display_name: m.display_name ?? m.id,
          context_window: null, is_active: true, last_seen_at: now,
        }));
        if (rows.length) await admin.from('llm_provider_models').upsert(rows, { onConflict: 'provider,model_id' });
        // Deprecate models no longer returned
        const ids = models.map(m => m.id);
        if (ids.length) {
          await admin.from('llm_provider_models')
            .update({ is_active: false })
            .eq('provider', 'anthropic')
            .not('model_id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
        }
        results['anthropic'] = { fetched: models.length };
      } else {
        results['anthropic'] = { fetched: 0, error: `HTTP ${res.status}` };
      }
    } catch (e) {
      results['anthropic'] = { fetched: 0, error: String(e) };
    }
  }

  // ── OpenAI ────────────────────────────────────────────────────────────────
  const openaiKey = keyMap['openai'] ?? process.env['OPENAI_API_KEY'];
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${openaiKey}` },
      });
      if (res.ok) {
        const data = await res.json() as { data: Array<{ id: string }> };
        const models = data.data.filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id));
        const rows: UpsertRow[] = models.map(m => ({
          provider: 'openai', model_id: m.id, display_name: m.id,
          context_window: null, is_active: true, last_seen_at: now,
        }));
        if (rows.length) await admin.from('llm_provider_models').upsert(rows, { onConflict: 'provider,model_id' });
        results['openai'] = { fetched: models.length };
      } else {
        results['openai'] = { fetched: 0, error: `HTTP ${res.status}` };
      }
    } catch (e) {
      results['openai'] = { fetched: 0, error: String(e) };
    }
  }

  // ── Google Gemini ─────────────────────────────────────────────────────────
  const geminiKey = keyMap['gemini'] ?? process.env['GEMINI_API_KEY'];
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
      );
      if (res.ok) {
        const data = await res.json() as {
          models: Array<{ name: string; displayName?: string; inputTokenLimit?: number }>;
        };
        const models = (data.models ?? []).filter(m => m.name.includes('gemini'));
        const rows: UpsertRow[] = models.map(m => ({
          provider: 'gemini',
          model_id: m.name.replace('models/', ''),
          display_name: m.displayName ?? m.name.replace('models/', ''),
          context_window: m.inputTokenLimit ?? null,
          is_active: true, last_seen_at: now,
        }));
        if (rows.length) await admin.from('llm_provider_models').upsert(rows, { onConflict: 'provider,model_id' });
        results['gemini'] = { fetched: models.length };
      } else {
        results['gemini'] = { fetched: 0, error: `HTTP ${res.status}` };
      }
    } catch (e) {
      results['gemini'] = { fetched: 0, error: String(e) };
    }
  }

  // ── OpenRouter (no auth needed) ───────────────────────────────────────────
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (res.ok) {
      const data = await res.json() as {
        data: Array<{ id: string; name?: string; context_length?: number }>;
      };
      const models = data.data ?? [];
      // Batch upsert in chunks of 100 to avoid request size limits
      for (let i = 0; i < models.length; i += 100) {
        const chunk = models.slice(i, i + 100);
        const rows: UpsertRow[] = chunk.map(m => ({
          provider: 'openrouter', model_id: m.id,
          display_name: m.name ?? m.id,
          context_window: m.context_length ?? null,
          is_active: true, last_seen_at: now,
        }));
        await admin.from('llm_provider_models').upsert(rows, { onConflict: 'provider,model_id' });
      }
      results['openrouter'] = { fetched: models.length };
    } else {
      results['openrouter'] = { fetched: 0, error: `HTTP ${res.status}` };
    }
  } catch (e) {
    results['openrouter'] = { fetched: 0, error: String(e) };
  }

  return NextResponse.json({ ok: true, results, timestamp: now });
}
