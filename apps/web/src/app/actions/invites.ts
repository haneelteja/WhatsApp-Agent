'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ── Send invite ───────────────────────────────────────────────────────────────

export async function sendInviteAction(tenantId: string, email: string, role: string) {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: platformUser } = await admin
    .from('platform_users')
    .select('id, role')
    .eq('user_id', user.id)
    .single();

  if (platformUser?.role !== 'manager') return { error: 'Only platform managers can send invites' };

  const { data: tenant } = await admin.from('tenants').select('name').eq('id', tenantId).single();
  if (!tenant) return { error: 'Tenant not found' };

  // Create invite record
  const { data: invite, error: inviteError } = await admin
    .from('client_invites')
    .insert({
      tenant_id:  tenantId,
      email:      email.toLowerCase().trim(),
      role,
      invited_by: platformUser.id,
    })
    .select('token')
    .single();

  if (inviteError || !invite) return { error: inviteError?.message ?? 'Failed to create invite' };

  // Send email via Resend
  const webUrl    = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
  const inviteUrl = `${webUrl}/invite/${invite.token}`;
  const fromEmail = process.env['RESEND_FROM_EMAIL'] ?? 'noreply@alphabot.in';
  const apiKey    = process.env['RESEND_API_KEY'];

  if (apiKey && !apiKey.startsWith('re_...')) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `Alphabot <${fromEmail}>`,
        to:      [email],
        subject: `You've been invited to ${tenant.name} on Alphabot`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;">
            <div style="margin-bottom:24px;">
              <span style="font-weight:700;font-size:18px;color:#111">Alphabot</span>
            </div>
            <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px">You've been invited</h2>
            <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px">
              You've been invited to join <strong>${tenant.name}</strong> as a <strong>${role.replace(/_/g, ' ')}</strong> on Alphabot.
            </p>
            <a href="${inviteUrl}"
               style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
              Accept Invitation
            </a>
            <p style="color:#999;font-size:12px;margin-top:32px;line-height:1.6">
              This link expires in 7 days. If you didn't expect this email, you can ignore it.<br/>
              Or copy this URL: ${inviteUrl}
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[sendInvite] Resend error:', body);
      // Don't block — invite record is created, share the link manually
    }
  }

  revalidatePath(`/platform/clients/${tenantId}`);
  return { success: true, inviteUrl };
}

// ── Accept invite ─────────────────────────────────────────────────────────────

export async function getInviteByToken(token: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('client_invites')
    .select('*, tenant:tenants(name)')
    .eq('token', token)
    .is('accepted_at', null)
    .single();
  return data;
}

export async function acceptInviteAction(token: string, fullName: string, password: string) {
  const admin = getSupabaseAdminClient();

  // Validate invite
  const { data: invite } = await admin
    .from('client_invites')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .single();

  if (!invite) return { error: 'Invite not found or already used' };
  if (new Date(invite.expires_at) < new Date()) return { error: 'Invite has expired' };

  // Check if user already exists
  const { data: { users: existingUsers } } = await admin.auth.admin.listUsers();
  const existingUser = existingUsers.find(u => u.email === invite.email);

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Create Supabase auth user
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email:           invite.email,
      password,
      email_confirm:   true,
      user_metadata:   { full_name: fullName },
    });
    if (createError || !newUser.user) return { error: createError?.message ?? 'Failed to create account' };
    userId = newUser.user.id;
  }

  // Link user to tenant
  const { error: tuError } = await admin.from('tenant_users').insert({
    tenant_id:  invite.tenant_id,
    user_id:    userId,
    role:       invite.role,
    invited_by: invite.invited_by,
  });

  if (tuError && tuError.code !== '23505') {  // ignore duplicate
    return { error: tuError.message };
  }

  // Mark invite as accepted
  await admin.from('client_invites').update({ accepted_at: new Date().toISOString() }).eq('token', token);

  return { success: true, email: invite.email };
}
