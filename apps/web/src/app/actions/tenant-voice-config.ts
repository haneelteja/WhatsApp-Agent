'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantVoiceConfigInput {
  from_number:            string;
  max_calls_per_month:    number | null;
  max_minutes_per_month:  number | null;
  max_calls_per_day:      number | null;
  max_cost_inr_per_month: number | null;
}

export interface ExotelCredsInput {
  api_key:     string;
  api_token:   string;
  account_sid: string;
}

// ─── Platform console actions (admin only) ────────────────────────────────────

export async function saveTenantVoiceConfigAction(
  tenantId: string,
  input:    TenantVoiceConfigInput,
): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:              tenantId,
        from_number:            input.from_number.trim(),
        max_calls_per_month:    input.max_calls_per_month,
        max_minutes_per_month:  input.max_minutes_per_month,
        max_calls_per_day:      input.max_calls_per_day,
        max_cost_inr_per_month: input.max_cost_inr_per_month,
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath(`/platform/clients/${tenantId}`);
  return {};
}

/** Platform manager saves Exotel credentials for a specific tenant. */
export async function saveTenantExotelCredsAction(
  tenantId: string,
  creds:    ExotelCredsInput,
): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:          tenantId,
        exotel_api_key:     creds.api_key.trim(),
        exotel_api_token:   creds.api_token.trim(),
        exotel_account_sid: creds.account_sid.trim(),
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath(`/platform/clients/${tenantId}`);
  return {};
}

export async function resetVoiceUsageAction(tenantId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const { error } = await admin
    .from('tenant_voice_configs')
    .update({
      calls_this_month:    0,
      minutes_this_month:  0,
      cost_inr_this_month: 0,
      calls_today:         0,
      monthly_reset_at:    monthStartStr,
      daily_reset_at:      today,
    })
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };

  revalidatePath(`/platform/clients/${tenantId}`);
  return {};
}

// ─── Client dashboard actions (scoped to authenticated tenant) ────────────────

/** Client saves their own Exotel credentials from the Settings page. */
export async function saveClientExotelCredsAction(
  creds: ExotelCredsInput,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  // Resolve tenantId from session
  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  if (!tenantUser) return { error: 'Tenant not found' };

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:          tenantUser.tenant_id,
        exotel_api_key:     creds.api_key.trim(),
        exotel_api_token:   creds.api_token.trim(),
        exotel_account_sid: creds.account_sid.trim(),
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return {};
}

/** Client saves their selected from_number from the Settings page. */
export async function saveClientFromNumberAction(
  fromNumber: string,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  if (!tenantUser) return { error: 'Tenant not found' };

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      { tenant_id: tenantUser.tenant_id, from_number: fromNumber.trim() },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return {};
}

// ─── Bridge mode (client dashboard) ──────────────────────────────────────────

/** Client enables/disables bridge mode and sets their default agent number. */
export async function saveClientBridgeConfigAction(
  bridgeModeEnabled: boolean,
  bridgeDefaultAgentNumber: string,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  if (!tenantUser) return { error: 'Tenant not found' };

  const normalized = bridgeDefaultAgentNumber.trim();
  const e164 = normalized && !normalized.startsWith('+') ? `+${normalized}` : normalized;

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:                    tenantUser.tenant_id,
        bridge_mode_enabled:          bridgeModeEnabled,
        bridge_default_agent_number:  e164 || null,
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}

// ─── Exotel virtual numbers fetch ─────────────────────────────────────────────

interface ExotelNumber {
  phone_number: string;   // E.164, e.g. "+918040123456"
  friendly_name: string;
}

/**
 * Fetch virtual (incoming) phone numbers registered on an Exotel account.
 * Used to populate the from_number dropdown in both platform console and client settings.
 *
 * tenantId (platform action) — loads credentials for that tenant or falls back to platform.
 * No tenantId (client action) — loads credentials for the calling user's tenant.
 */
export async function fetchExotelNumbersAction(
  tenantId?: string,
): Promise<{ numbers: ExotelNumber[]; error?: string }> {
  const admin = getSupabaseAdminClient();

  let resolvedTenantId = tenantId;

  if (!resolvedTenantId) {
    // Client action — resolve from session
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { numbers: [], error: 'Not authenticated' };

    const { data: tu } = await admin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();
    resolvedTenantId = tu?.tenant_id;
  }

  // Try to load tenant credentials first
  let apiKey: string | null = null;
  let apiToken: string | null = null;
  let accountSid: string | null = null;

  if (resolvedTenantId) {
    const { data: tvc } = await admin
      .from('tenant_voice_configs')
      .select('exotel_api_key, exotel_api_token, exotel_account_sid')
      .eq('tenant_id', resolvedTenantId)
      .single();

    const row = tvc as { exotel_api_key: string | null; exotel_api_token: string | null; exotel_account_sid: string | null } | null;
    apiKey     = row?.exotel_api_key     ?? null;
    apiToken   = row?.exotel_api_token   ?? null;
    accountSid = row?.exotel_account_sid ?? null;
  }

  if (!apiKey || !apiToken || !accountSid) {
    return {
      numbers: [],
      error: 'No Exotel credentials configured for this account. Add your API key, token, and account SID first.',
    };
  }

  try {
    const auth = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');
    const res  = await fetch(
      `https://api.exotel.com/v1/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      { headers: { Authorization: `Basic ${auth}` } },
    );

    if (!res.ok) {
      const body = await res.text();
      return { numbers: [], error: `Exotel API error ${res.status}: ${body.slice(0, 200)}` };
    }

    const json = await res.json() as {
      IncomingPhoneNumbers?: Array<{
        PhoneNumber?: string;
        FriendlyName?: string;
      }>;
    };

    const numbers: ExotelNumber[] = (json.IncomingPhoneNumbers ?? []).map(n => {
      const raw = n.PhoneNumber ?? '';
      // Normalise to E.164 — Exotel returns numbers without + prefix
      const e164 = raw.startsWith('+') ? raw : `+${raw}`;
      return { phone_number: e164, friendly_name: n.FriendlyName ?? e164 };
    });

    return { numbers };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { numbers: [], error: `Failed to reach Exotel API: ${msg}` };
  }
}
