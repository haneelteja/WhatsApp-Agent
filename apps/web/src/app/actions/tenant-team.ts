'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function sendTeamInviteAction(_prevState: unknown, formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() ?? '';
  const role  = (formData.get('role') as string | null) ?? 'agent';

  if (!email) return { error: 'Email is required' };
  if (!['agent', 'supervisor', 'admin'].includes(role)) return { error: 'Invalid role' };

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Not a team member' };
  if (!['admin', 'supervisor'].includes(tenantUser.role) && tenantUser.role !== 'client_manager') {
    return { error: 'Only admins can invite team members' };
  }

  const tenantId = tenantUser.tenant_id;
  const { data: tenant } = await admin.from('tenants').select('name').eq('id', tenantId).single();
  if (!tenant) return { error: 'Tenant not found' };

  // Map admin/supervisor to client_manager/client_admin for client_invites constraint
  const inviteRole = role === 'admin' ? 'client_manager' : role === 'supervisor' ? 'client_admin' : 'agent';

  const { data: invite, error: inviteError } = await admin
    .from('client_invites')
    .insert({ tenant_id: tenantId, email, role: inviteRole })
    .select('token')
    .single();

  if (inviteError || !invite) return { error: inviteError?.message ?? 'Failed to create invite' };

  const webUrl    = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
  const inviteUrl = `${webUrl}/invite/${invite.token}`;
  const apiKey    = process.env['BREVO_API_KEY'];

  if (apiKey) {
    const emailHtml = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;">
        <div style="margin-bottom:24px;">
          <span style="font-weight:700;font-size:18px;color:#111">Alphabot</span>
        </div>
        <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px">You've been invited</h2>
        <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px">
          You've been invited to join <strong>${tenant.name}</strong> as a <strong>${role}</strong> on Alphabot.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
          Accept Invitation
        </a>
        <p style="color:#999;font-size:12px;margin-top:32px;line-height:1.6">
          This link expires in 7 days. If you didn't expect this email, you can ignore it.
        </p>
      </div>
    `;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: 'Alphabot', email: 'pega2023test@gmail.com' },
        to:          [{ email }],
        subject:     `You've been invited to join ${tenant.name} on Alphabot`,
        htmlContent: emailHtml,
      }),
    }).catch(err => console.error('[TeamInvite] Brevo error:', err));
  }

  revalidatePath('/team');
  return { success: true, inviteUrl };
}

export async function removeTeamMemberAction(userId: string) {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: callerTU } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!callerTU || !['admin', 'client_manager'].includes(callerTU.role)) {
    return { error: 'Only admins can remove team members' };
  }

  if (userId === user.id) return { error: 'Cannot remove yourself' };

  await admin
    .from('tenant_users')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', callerTU.tenant_id);

  revalidatePath('/team');
  return { success: true };
}
