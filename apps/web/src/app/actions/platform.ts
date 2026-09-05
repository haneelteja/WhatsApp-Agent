'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

export async function createTenantAction(formData: FormData) {
  const supabase = getSupabaseAdminClient();

  const name = (formData.get('name') as string | null)?.trim();
  const contactEmail = (formData.get('contactEmail') as string | null)?.trim();
  const plan = (formData.get('plan') as string) || 'starter';
  const trialDays = parseInt((formData.get('trialDays') as string) || '0', 10);
  const products = formData.getAll('products') as string[];

  if (!name || !contactEmail || products.length === 0) return;

  // 1. Create tenant
  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({
      name,
      contact_email: contactEmail,
      plan,
      status: trialDays > 0 ? 'trial' : 'active',
      provider: 'meta_cloud',
    })
    .select()
    .single();

  if (error || !tenant) {
    console.error('[createTenantAction] tenant insert failed', error);
    return;
  }

  // 2. Batch-insert tenant_products + bot_configs for all selected products.
  // Previously sequential for-loops (N*2 round-trips); now 2 parallel batch inserts.
  const tenantProductRows = products.map(productSlug => ({
    tenant_id: tenant.id,
    product_type: productSlug,
    tier: 'base',
    active: true,
  }));

  const botConfigRows = products.map(productSlug => ({
    tenant_id: tenant.id,
    product_slug: productSlug,
    system_prompt: null,  // falls back to products.default_prompt at query time
    ai_model: null,       // falls back to products.default_model at query time
    confidence_threshold: 0.6,
    escalation_triggers: [
      'speak to human', 'talk to agent', 'human please', 'escalate',
      'complaint', 'refund', 'dispute', 'urgent',
    ],
    guardrails_json: {
      blocked_topics: [],
      blocked_keywords: [],
      max_response_length: 1000,
      tone: 'professional',
      content_filters: {
        no_personal_data: false,
        no_external_links: false,
        no_phone_numbers_in_response: false,
      },
      on_blocked_topic: 'escalate',
      on_low_confidence: 'escalate',
    },
  }));

  await Promise.all([
    supabase.from('tenant_products').insert(tenantProductRows),
    supabase.from('bot_configs').insert(botConfigRows),
  ]);

  // 3. Free trial if requested — batch insert all products in one call
  if (trialDays > 0) {
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + trialDays);

    const trialRows = products.map(productSlug => ({
      tenant_id: tenant.id,
      product_slug: productSlug,
      ends_at: endsAt.toISOString(),
      status: 'active',
      allowed_model: 'claude-sonnet-4-6',
    }));

    await supabase.from('free_trials').insert(trialRows);
  }

  // 4. Auto-invite contact email as client_manager + send welcome email
  const { data: invite } = await supabase
    .from('client_invites')
    .insert({ tenant_id: tenant.id, email: contactEmail, role: 'client_manager' })
    .select('token')
    .single();

  if (invite) {
    const webUrl    = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
    const inviteUrl = `${webUrl}/invite/${invite.token}`;
    const apiKey    = process.env['BREVO_API_KEY'];

    const productLabels: Record<string, string> = {
      support_bot: 'Support Bot', sales_bot: 'Sales Bot', lifecycle_bot: 'Lifecycle Bot',
    };
    const productList = products.map(p => productLabels[p] ?? p).join(', ');
    const webhookRows = products
      .map(p => `<tr><td style="padding:4px 0;color:#555;font-size:13px">${productLabels[p] ?? p}</td><td style="padding:4px 0 4px 16px;font-family:monospace;font-size:12px;color:#333">POST ${webUrl}/api/webhook/${tenant.id}/${p}</td></tr>`)
      .join('');

    {
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
          <div style="margin-bottom:28px;">
            <span style="font-weight:700;font-size:20px;color:#111">Alphabot</span>
          </div>
          <h2 style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px">Welcome to Alphabot!</h2>
          <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
            Your account for <strong>${name}</strong> has been set up on Alphabot. You have been assigned as the <strong>Manager</strong> for your workspace.
          </p>
          <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px">
            Click the button below to set your password and access your dashboard:
          </p>
          <a href="${inviteUrl}" style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
            Set Password &amp; Get Started
          </a>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
            <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em">Your Workspace Details</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:140px">Company</td><td style="padding:4px 0;color:#111;font-size:13px;font-weight:600">${name}</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Plan</td><td style="padding:4px 0;color:#111;font-size:13px;text-transform:capitalize">${plan}</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Active Bots</td><td style="padding:4px 0;color:#111;font-size:13px">${productList}</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Role</td><td style="padding:4px 0;color:#111;font-size:13px">Manager</td></tr>
            </table>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
            <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em">Webhook URLs</p>
            <p style="font-size:12px;color:#6b7280;margin:0 0 10px">Configure these in your WhatsApp provider (Twilio / Meta Cloud):</p>
            <table style="width:100%;border-collapse:collapse;">${webhookRows}</table>
          </div>

          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:24px;">
            <p style="font-size:13px;font-weight:700;color:#92400e;margin:0 0 8px">Next Steps</p>
            <ol style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:1.8">
              <li>Accept this invite and set your password</li>
              <li>Log in to your dashboard at <a href="${webUrl}" style="color:#059669">${webUrl}</a></li>
              <li>Configure your WhatsApp number using the webhook URL above</li>
              <li>Upload your knowledge base documents</li>
              <li>Test your bot by sending a message to your WhatsApp number</li>
            </ol>
          </div>

          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0">
            This invite link expires in 7 days. If you have any questions, reply to this email or contact your Alphabot account manager.
          </p>
        </div>
      `;

      await sendEmail({ to: contactEmail, subject: `Welcome to Alphabot — ${name} is ready`, html });
    }
  }

  redirect(`/platform/clients/${tenant.id}`);
}

export async function updateTenantStatusAction(tenantId: string, status: string) {
  const supabase = getSupabaseAdminClient();
  await supabase.from('tenants').update({ status }).eq('id', tenantId);
}

export async function updateContactEmailAction(tenantId: string, email: string): Promise<{ error?: string }> {
  const trimmed = email.trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Invalid email address' };
  }
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('tenants')
    .update({ contact_email: trimmed })
    .eq('id', tenantId);
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/clients');
  return {};
}
