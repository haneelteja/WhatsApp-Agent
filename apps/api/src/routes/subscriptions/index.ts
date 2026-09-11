import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { Resend } from 'resend';
import {
  createEasebuzzPaymentLink,
  verifyEasebuzzCallback,
} from '../../services/payment/easebuzz.js';

const resend = new Resend(process.env['RESEND_API_KEY']);

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await resend.emails.send({ from: 'Alphabot <noreply@elmawaterindustries.in>', to, subject, html });
  } catch (err) {
    console.error('[Subscriptions] Email send failed', err);
  }
}

const PLANS: Record<string, { label: string; amountRupees: number; products: string[] }> = {
  growth:       { label: 'Growth',       amountRupees: 2499, products: ['support_bot'] },
  professional: { label: 'Professional', amountRupees: 4999, products: ['support_bot', 'sales_bot', 'lifecycle_bot'] },
};

const WEB_BASE = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
const API_BASE = process.env['API_SELF_URL'] ?? '';

export async function subscriptionRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getServerClient();

  // ── POST /api/subscriptions/initiate ─────────────────────────────────────
  // Public — no auth required.
  // Creates a pending tenant + subscription_payment row, returns Easebuzz link.
  fastify.post<{
    Body: { company: string; email: string; plan: string }
  }>('/initiate', async (request, reply) => {
    const { company, email, plan } = request.body ?? {};

    if (!company?.trim() || !email?.trim() || !plan) {
      return reply.status(400).send({ error: 'company, email, and plan are required' });
    }

    const planConfig = PLANS[plan];
    if (!planConfig) {
      return reply.status(400).send({ error: `Unknown plan: ${plan}` });
    }

    if (!API_BASE) {
      fastify.log.error('[Subscriptions] API_SELF_URL env var not set');
      return reply.status(500).send({ error: 'Payment provider not configured' });
    }

    // 1. Create tenant with pending_payment status
    const { data: tenant, error: tenantError } = await db
      .from('tenants')
      .insert({
        name:          company.trim(),
        contact_email: email.trim().toLowerCase(),
        plan,
        status:        'pending_payment',
        provider:      'meta_cloud',
      })
      .select('id')
      .single();

    if (tenantError || !tenant) {
      fastify.log.error({ tenantError }, '[Subscriptions] Failed to create tenant');
      return reply.status(500).send({ error: 'Failed to create account' });
    }

    // 2. Create products + bot_configs for the plan
    const botConfigDefaults = {
      system_prompt:        null,
      ai_model:             null,
      confidence_threshold: 0.6,
      escalation_triggers:  ['speak to human', 'talk to agent', 'human please', 'escalate', 'complaint', 'refund'],
      guardrails_json: {
        blocked_topics: [], blocked_keywords: [], max_response_length: 1000,
        tone: 'professional',
        content_filters: { no_personal_data: false, no_external_links: false, no_phone_numbers_in_response: false },
        on_blocked_topic: 'escalate', on_low_confidence: 'escalate',
      },
    };

    await Promise.all([
      db.from('tenant_products').insert(
        planConfig.products.map(slug => ({ tenant_id: tenant.id, product_type: slug, tier: 'base', active: true }))
      ),
      db.from('bot_configs').insert(
        planConfig.products.map(slug => ({ tenant_id: tenant.id, product_slug: slug, ...botConfigDefaults }))
      ),
    ]);

    // 3. Create subscription_payment row
    const { data: subPayment, error: spError } = await db
      .from('subscription_payments')
      .insert({ tenant_id: tenant.id, plan, amount: planConfig.amountRupees, status: 'pending' })
      .select('id')
      .single();

    if (spError || !subPayment) {
      fastify.log.error({ spError }, '[Subscriptions] Failed to create subscription_payment');
      return reply.status(500).send({ error: 'Failed to initiate payment' });
    }

    // 4. Generate Easebuzz payment link — txnid = subscription_payment.id
    const callbackUrl = `${API_BASE}/api/subscriptions/callback`;
    const result = await createEasebuzzPaymentLink({
      paymentId:    subPayment.id,
      contactPhone: '0000000000',   // no phone at this stage — Easebuzz requires field but won't validate
      contactName:  company.trim(),
      amountRupees: planConfig.amountRupees,
      description:  `Alphabot ${planConfig.label} Plan — Monthly`,
      surlOverride: callbackUrl,
      furlOverride: callbackUrl,
      emailOverride: email.trim().toLowerCase(),
    });

    if (!result.success || !result.linkUrl) {
      fastify.log.error({ error: result.error }, '[Subscriptions] Easebuzz initiate failed');
      // Don't surface Easebuzz internals — clean up and return error
      await db.from('tenants').delete().eq('id', tenant.id);
      return reply.status(502).send({ error: 'Payment gateway unavailable, please try again' });
    }

    // 5. Store link URL in subscription_payment
    await db.from('subscription_payments')
      .update({ link_url: result.linkUrl })
      .eq('id', subPayment.id);

    return reply.send({ linkUrl: result.linkUrl, txnId: subPayment.id });
  });

  // ── POST /api/subscriptions/callback ─────────────────────────────────────
  // Easebuzz surl + furl — receives a browser form-POST after payment.
  // Verifies hash, activates tenant, sends welcome email, redirects browser.
  fastify.post('/callback', async (request, reply) => {
    const body = request.body as Record<string, string>;

    if (!verifyEasebuzzCallback(body)) {
      fastify.log.warn({ txnid: body['txnid'] }, '[Subscriptions] Callback hash verification failed');
      return reply.redirect(`${WEB_BASE}/subscription/status/${body['txnid'] ?? ''}?result=invalid`, 302);
    }

    const txnid  = body['txnid']  ?? '';
    const status = body['status'] ?? '';

    fastify.log.info({ txnid, status }, '[Subscriptions] Callback received');

    if (status === 'success') {
      // Mark subscription_payment as paid
      const { data: sp } = await db
        .from('subscription_payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', txnid)
        .select('tenant_id, plan, amount')
        .single();

      if (sp) {
        // Activate tenant
        await db.from('tenants')
          .update({ status: 'active' })
          .eq('id', sp.tenant_id);

        // Create invite + send welcome email
        const { data: tenantRow } = await db
          .from('tenants')
          .select('name, contact_email')
          .eq('id', sp.tenant_id)
          .single();

        if (tenantRow?.contact_email) {
          const { data: invite } = await db
            .from('client_invites')
            .insert({ tenant_id: sp.tenant_id, email: tenantRow.contact_email, role: 'admin' })
            .select('token')
            .single();

          if (invite) {
            const inviteUrl   = `${WEB_BASE}/invite/${invite.token}`;
            const planLabels: Record<string, string> = {
              growth: 'Growth', professional: 'Professional',
            };

            const html = `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
                <div style="margin-bottom:28px;">
                  <span style="font-weight:700;font-size:20px;color:#111">Alphabot</span>
                </div>
                <h2 style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px">Your workspace is ready!</h2>
                <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
                  Payment confirmed. Your <strong>${planLabels[sp.plan] ?? sp.plan}</strong> workspace for <strong>${tenantRow.name}</strong> is now active.
                </p>
                <a href="${inviteUrl}" style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
                  Set Password &amp; Open Dashboard
                </a>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:140px">Company</td><td style="padding:4px 0;color:#111;font-size:13px;font-weight:600">${tenantRow.name}</td></tr>
                    <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Plan</td><td style="padding:4px 0;color:#111;font-size:13px;font-weight:600">${planLabels[sp.plan] ?? sp.plan}</td></tr>
                    <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Amount paid</td><td style="padding:4px 0;color:#111;font-size:13px">&#8377;${Number(sp.amount).toLocaleString('en-IN')}/mo</td></tr>
                  </table>
                </div>
                <p style="color:#9ca3af;font-size:12px;">This invite link expires in 7 days.</p>
              </div>
            `;

            await sendEmail(
              tenantRow.contact_email,
              `Your Alphabot workspace is active — ${tenantRow.name}`,
              html,
            );
          }
        }
      }

      return reply.redirect(`${WEB_BASE}/subscription/status/${txnid}?result=success`, 302);
    }

    if (status === 'failure' || status === 'userCancelled') {
      await db.from('subscription_payments')
        .update({ status: 'failed' })
        .eq('id', txnid);

      return reply.redirect(`${WEB_BASE}/subscription/status/${txnid}?result=failed`, 302);
    }

    return reply.redirect(`${WEB_BASE}/subscription/status/${txnid}?result=pending`, 302);
  });
}
