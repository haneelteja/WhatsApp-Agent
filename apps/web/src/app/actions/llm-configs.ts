'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type SaveResult     = { ok: true } | { ok: false; error: string };
export type ValidateResult = {
  ok: true;
  creditInfo?: { usage: number | null; limit: number | null; is_free_tier: boolean };
} | { ok: false; error: string; statusCode?: number };

// ── helpers ──────────────────────────────────────────────────────────────────

function buildRevalidate(tenantId: string | null) {
  if (tenantId === null) {
    revalidatePath('/platform/ai-models');
  } else {
    revalidatePath('/ai-models');
    revalidatePath(`/platform/clients/${tenantId}`);
  }
}

async function findConfig(admin: ReturnType<typeof getSupabaseAdminClient>, tenantId: string | null, productSlug: string | null) {
  let q = admin.from('llm_configs').select('*');
  q = tenantId    === null ? q.is('tenant_id',    null) : q.eq('tenant_id',    tenantId);
  q = productSlug === null ? q.is('product_slug', null) : q.eq('product_slug', productSlug);
  const { data } = await q.maybeSingle();
  return data as Record<string, unknown> | null;
}

// ── Save (upsert without changing the api_key when left empty) ────────────────

export async function saveLlmConfigAction(
  tenantId:    string | null,
  productSlug: string | null,
  provider:    string,
  apiKey:      string,   // empty string = keep existing key (update only)
  model:       string,
  baseUrl?:    string,
): Promise<SaveResult> {
  const admin = getSupabaseAdminClient();

  if (!model.trim()) return { ok: false, error: 'Model name is required.' };

  const existing = await findConfig(admin, tenantId, productSlug);
  const now = new Date().toISOString();

  if (existing) {
    const update: Record<string, unknown> = {
      provider,
      model:             model.trim(),
      base_url:          baseUrl?.trim() || null,
      validation_status: 'pending',
      validation_error:  null,
      validated_at:      null,
      updated_at:        now,
    };
    if (apiKey.trim()) update['api_key'] = apiKey.trim();

    const { error } = await admin.from('llm_configs').update(update).eq('id', existing['id']);
    if (error) return { ok: false, error: error.message };
  } else {
    if (!apiKey.trim()) return { ok: false, error: 'API key is required for a new configuration.' };

    const { error } = await admin.from('llm_configs').insert({
      tenant_id:    tenantId,
      product_slug: productSlug,
      provider,
      api_key:      apiKey.trim(),
      model:        model.trim(),
      base_url:     baseUrl?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
  }

  buildRevalidate(tenantId);
  return { ok: true };
}

// ── Validate (test the stored API key against the provider's native API) ─────

export async function validateLlmConfigAction(
  tenantId:    string | null,
  productSlug: string | null,
): Promise<ValidateResult> {
  const admin = getSupabaseAdminClient();
  const config = await findConfig(admin, tenantId, productSlug);
  if (!config) return { ok: false, error: 'Configuration not found — save it first.' };

  const provider  = String(config['provider'] ?? 'openrouter');
  const apiKey    = String(config['api_key']  ?? '');
  const model     = String(config['model']    ?? '');
  const customUrl = config['base_url'] as string | null;
  const configId  = String(config['id']);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  type CreditInfo = { usage: number | null; limit: number | null; is_free_tier: boolean };
  let statusCode: number | undefined;
  let res: Response;

  try {
    // ── Route to the correct provider API format ──────────────────────────
    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        }),
      });
    } else if (provider === 'gemini') {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        },
      );
    } else {
      // openai / openrouter / custom — all use OpenAI-compatible format
      const baseUrl = customUrl?.replace(/\/$/, '') ?? (
        provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1'
      );
      const headers: Record<string, string> = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://whats-app-agent-web.vercel.app';
        headers['X-Title']      = 'Alphabot';
      }
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
          max_tokens: 5,
        }),
      });
    }

    clearTimeout(timer);
    statusCode = res.status;

    if (!res.ok) {
      const body = await res.text();
      let errMsg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(body) as { error?: { message?: string }; message?: string };
        errMsg = j?.error?.message ?? j?.message ?? errMsg;
      } catch { /* use status string */ }

      await admin.from('llm_configs').update({
        validation_status: 'invalid',
        validation_error:  errMsg,
        validated_at:      new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).eq('id', configId);

      buildRevalidate(tenantId);
      return { ok: false, error: errMsg, statusCode };
    }

    // ── Valid — fetch credit info for OpenRouter ──────────────────────────
    let creditInfo: CreditInfo | undefined = undefined;
    if (provider === 'openrouter') {
      try {
        const keyRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (keyRes.ok) {
          const kj = await keyRes.json() as { data?: { usage?: number; limit?: number; is_free_tier?: boolean } };
          creditInfo = {
            usage:        kj?.data?.usage        ?? null,
            limit:        kj?.data?.limit        ?? null,
            is_free_tier: kj?.data?.is_free_tier ?? false,
          };
        }
      } catch { /* credit info optional */ }
    }

    await admin.from('llm_configs').update({
      validation_status: 'valid',
      validation_error:  null,
      credit_info:       creditInfo ?? null,
      validated_at:      new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }).eq('id', configId);

    buildRevalidate(tenantId);
    return { ok: true, creditInfo };

  } catch (err) {
    clearTimeout(timer);
    const errMsg = (err as Error).name === 'AbortError'
      ? 'Validation timed out (12 s). Check the API endpoint and model name.'
      : (err instanceof Error ? err.message : 'Network error');

    await admin.from('llm_configs').update({
      validation_status: 'invalid',
      validation_error:  errMsg,
      validated_at:      new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }).eq('id', configId);

    buildRevalidate(tenantId);
    return { ok: false, error: errMsg };
  }
}

// ── Get available models for a provider (populated by weekly cron) ────────────

export async function getProviderModelsAction(
  provider: string,
): Promise<Array<{ model_id: string; display_name: string | null; context_window: number | null }>> {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('llm_provider_models')
    .select('model_id, display_name, context_window')
    .eq('provider', provider)
    .eq('is_active', true)
    .order('display_name');
  return (data ?? []) as Array<{ model_id: string; display_name: string | null; context_window: number | null }>;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteLlmConfigAction(
  tenantId:    string | null,
  productSlug: string | null,
): Promise<SaveResult> {
  const admin = getSupabaseAdminClient();
  let q = admin.from('llm_configs').delete();
  q = tenantId    === null ? q.is('tenant_id',    null) : q.eq('tenant_id',    tenantId);
  q = productSlug === null ? q.is('product_slug', null) : q.eq('product_slug', productSlug);

  const { error } = await q;
  if (error) return { ok: false, error: error.message };

  buildRevalidate(tenantId);
  return { ok: true };
}
