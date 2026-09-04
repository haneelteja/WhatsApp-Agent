'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { revalidatePath }         from 'next/cache';
import { sendEmail }              from '@/lib/email';
import { writeAuditLog }          from '@/lib/audit';

export async function sendTeamInviteAction(_prevState: unknown, formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() ?? '';
  const role  = (formData.get('role') as string | null) ?? 'agent';

  if (!email) return { error: 'Email is required' };
  if (!['agent', 'supervisor', 'admin'].includes(role)) return { error: 'Invalid role' };

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  if (!['admin', 'supervisor', 'client_manager'].includes(session.role)) {
    return { error: 'Only admins can invite team members' };
  }

  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin.from('tenants').select('name').eq('id', session.tenantId).single();
  if (!tenant) return { error: 'Tenant not found' };

  const { data: { users: allUsers } } = await admin.auth.admin.listUsers();
  const matchedUser = allUsers.find(u => u.email?.toLowerCase() === email);
  if (matchedUser) {
    const { data: isPlatformUser } = await admin
      .from('platform_users')
      .select('id')
      .eq('user_id', matchedUser.id)
      .maybeSingle();
    if (isPlatformUser) {
      return { error: 'This email belongs to a platform team member and cannot be invited as a client.' };
    }
  }

  if (matchedUser) {
    const { data: existingMember } = await admin
      .from('tenant_users')
      .select('id')
      .eq('user_id', matchedUser.id)
      .eq('tenant_id', session.tenantId)
      .maybeSingle();
    if (existingMember) return { error: 'This person is already a member of your workspace.' };
  }

  const inviteRole = role === 'admin' ? 'client_manager' : role === 'supervisor' ? 'client_admin' : 'agent';

  const { data: invite, error: inviteError } = await admin
    .from('client_invites')
    .insert({ tenant_id: session.tenantId, email, role: inviteRole })
    .select('token')
    .single();

  if (inviteError || !invite) return { error: inviteError?.message ?? 'Failed to create invite' };

  const webUrl    = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
  const inviteUrl = `${webUrl}/invite/${invite.token}`;

  await sendEmail({
    to:      email,
    subject: `You've been invited to join ${tenant.name} on Alphabot`,
    html: `
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
    `,
  });

  void writeAuditLog({
    tenantId:    session.tenantId,
    actorId:     session.userId,
    actorEmail:  session.userEmail,
    action:      'member.invited',
    entityType:  'team_invite',
    entityId:    email,
    description: `Invited ${email} as ${role}`,
    metadata: { email, role },
  });

  revalidatePath('/team');
  return { success: true, inviteUrl };
}

export async function removeTeamMemberAction(userId: string) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  if (!['admin', 'client_manager'].includes(session.role)) {
    return { error: 'Only admins can remove team members' };
  }

  if (userId === session.userId) return { error: 'Cannot remove yourself' };

  const admin = getSupabaseAdminClient();
  await admin
    .from('tenant_users')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', session.tenantId);

  void writeAuditLog({
    tenantId:    session.tenantId,
    actorId:     session.userId,
    actorEmail:  session.userEmail,
    action:      'member.removed',
    entityType:  'tenant_user',
    entityId:    userId,
    description: `Removed team member (user ID: ${userId})`,
    metadata: { removed_user_id: userId },
  });

  revalidatePath('/team');
  return { success: true };
}
