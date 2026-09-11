'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { redirect }               from 'next/navigation';
import { revalidatePath }         from 'next/cache';
import { sendEmail }              from '@/lib/email';

export type AgencyClient = {
  id:            string;
  name:          string;
  plan:          string;
  status:        string;
  contact_email: string | null;
  created_at:    string;
  active_bots:   number;
  conv_count:    number;
};

// ── List all sub-clients for the current agency tenant ────────────────────────

export async function getAgencyClientsAction(): Promise<{ clients: AgencyClient[]; error?: string }> {
  const session = await getSession();
  if (!session) return { clients: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  // Verify this tenant is actually an agency
  const { data: tenant } = await admin
    .from('tenants')
    .select('is_agency')
    .eq('id', session.tenantId)
    .single();

  if (!tenant?.is_agency) return { clients: [], error: 'Not an agency account' };

  const { data: subTenants, error } = await admin
    .from('tenants')
    .select('id, name, plan, status, contact_email, created_at')
    .eq('parent_tenant_id', session.tenantId)
    .order('created_at', { ascending: false });

  if (error) return { clients: [], error: error.message };
  if (!subTenants?.length) return { clients: [] };

  const subIds = subTenants.map(t => t.id);

  // Batch: active bot count + conversation count per sub-tenant
  const [{ data: botRows }, { data: convRows }] = await Promise.all([
    admin.from('tenant_products').select('tenant_id').eq('active', true).in('tenant_id', subIds),
    admin.from('conversations').select('tenant_id').in('tenant_id', subIds),
  ]);

  const botCounts  = new Map<string, number>();
  const convCounts = new Map<string, number>();
  for (const r of botRows  ?? []) botCounts.set(r.tenant_id,  (botCounts.get(r.tenant_id)  ?? 0) + 1);
  for (const r of convRows ?? []) convCounts.set(r.tenant_id, (convCounts.get(r.tenant_id) ?? 0) + 1);

  const clients: AgencyClient[] = subTenants.map(t => ({
    id:            t.id,
    name:          t.name,
    plan:          t.plan,
    status:        t.status,
    contact_email: t.contact_email,
    created_at:    t.created_at,
    active_bots:   botCounts.get(t.id)  ?? 0,
    conv_count:    convCounts.get(t.id) ?? 0,
  }));

  return { clients };
}

// ── Create a sub-client under the current agency tenant ───────────────────────

export async function createSubClientAction(formData: FormData): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  // Verify agency
  const { data: agencyTenant } = await admin
    .from('tenants')
    .select('is_agency, name')
    .eq('id', session.tenantId)
    .single();

  if (!agencyTenant?.is_agency) return { error: 'Not an agency account' };

  const name         = (formData.get('name')         as string | null)?.trim();
  const contactEmail = (formData.get('contactEmail') as string | null)?.trim();
  const products     = formData.getAll('products') as string[];
  const plan         = (formData.get('plan') as string) || 'starter';

  if (!name || !contactEmail || products.length === 0) return { error: 'Name, email, and at least one product are required' };

  // 1. Create sub-client tenant
  const { data: newTenant, error } = await admin
    .from('tenants')
    .insert({
      name,
      contact_email:    contactEmail,
      plan,
      status:           'active',
      provider:         'meta_cloud',
      parent_tenant_id: session.tenantId,
    })
    .select('id')
    .single();

  if (error || !newTenant) return { error: error?.message ?? 'Failed to create client' };

  // 2. Batch-insert products + bot configs
  await Promise.all([
    admin.from('tenant_products').insert(
      products.map(slug => ({ tenant_id: newTenant.id, product_type: slug, tier: 'base', active: true }))
    ),
    admin.from('bot_configs').insert(
      products.map(slug => ({
        tenant_id:            newTenant.id,
        product_slug:         slug,
        system_prompt:        null,
        ai_model:             null,
        confidence_threshold: 0.6,
        escalation_triggers:  ['speak to human', 'talk to agent', 'human please', 'escalate', 'complaint', 'refund'],
        guardrails_json: {
          blocked_topics: [], blocked_keywords: [], max_response_length: 1000,
          tone: 'professional', content_filters: { no_personal_data: false, no_external_links: false, no_phone_numbers_in_response: false },
          on_blocked_topic: 'escalate', on_low_confidence: 'escalate',
        },
      }))
    ),
  ]);

  // 3. Auto-invite contact as client_manager + send welcome email
  const { data: invite } = await admin
    .from('client_invites')
    .insert({ tenant_id: newTenant.id, email: contactEmail, role: 'client_manager' })
    .select('token')
    .single();

  if (invite) {
    const webUrl    = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
    const inviteUrl = `${webUrl}/invite/${invite.token}`;
    const productLabels: Record<string, string> = {
      support_bot: 'Support Bot', sales_bot: 'Sales Bot', lifecycle_bot: 'Lifecycle Bot',
    };
    const productList = products.map(p => productLabels[p] ?? p).join(', ');

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
        <div style="margin-bottom:28px;">
          <span style="font-weight:700;font-size:20px;color:#111">Alphabot</span>
        </div>
        <h2 style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px">Welcome to Alphabot!</h2>
        <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
          Your account for <strong>${name}</strong> has been set up. You have been assigned as the <strong>Manager</strong> for your workspace.
        </p>
        <a href="${inviteUrl}" style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
          Set Password &amp; Get Started
        </a>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
          <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em">Your Workspace</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:140px">Company</td><td style="padding:4px 0;color:#111;font-size:13px;font-weight:600">${name}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Plan</td><td style="padding:4px 0;color:#111;font-size:13px;text-transform:capitalize">${plan}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Active Bots</td><td style="padding:4px 0;color:#111;font-size:13px">${productList}</td></tr>
          </table>
        </div>
        <p style="color:#9ca3af;font-size:12px;">This invite link expires in 7 days.</p>
      </div>
    `;

    await sendEmail({ to: contactEmail, subject: `Welcome to Alphabot — ${name} is ready`, html });
  }

  revalidatePath('/agency-clients');
  return {};
}

// ── Billing summary: aggregate usage across all sub-clients ──────────────────

export type AgencyBillingSummary = {
  total_clients:       number;
  total_conversations: number;
  plan_breakdown:      { plan: string; count: number }[];
};

export async function getAgencyBillingSummaryAction(): Promise<AgencyBillingSummary | null> {
  const session = await getSession();
  if (!session) return null;

  const admin = getSupabaseAdminClient();

  const { data: subTenants } = await admin
    .from('tenants')
    .select('id, plan')
    .eq('parent_tenant_id', session.tenantId);

  if (!subTenants?.length) return { total_clients: 0, total_conversations: 0, plan_breakdown: [] };

  const subIds = subTenants.map(t => t.id);

  const { count: convCount } = await admin
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .in('tenant_id', subIds);

  const planCounts: Record<string, number> = {};
  for (const t of subTenants) {
    planCounts[t.plan] = (planCounts[t.plan] ?? 0) + 1;
  }

  return {
    total_clients:       subTenants.length,
    total_conversations: convCount ?? 0,
    plan_breakdown:      Object.entries(planCounts).map(([plan, count]) => ({ plan, count })),
  };
}
