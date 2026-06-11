import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { getServerClient } from '@alphabot/database';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    userId: string;
    userRole: 'admin' | 'supervisor' | 'agent';
  }
}

/**
 * Fastify preHandler: validates the Supabase JWT from the Authorization header
 * and attaches tenantId + role to the request for downstream use.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    await reply.status(401).send({ success: false, error: 'Missing auth token' });
    return;
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env['SUPABASE_URL']!;
  const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!;

  // Validate the JWT using the anon client
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await anonClient.auth.getUser(token);

  if (error || !user) {
    await reply.status(401).send({ success: false, error: 'Invalid token' });
    return;
  }

  const db = getServerClient();

  // Try tenant_users first (service-role bypasses RLS)
  const { data: membership, error: membershipError } = await db
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  request.log.info({ userId: user.id, membership, membershipError }, '[auth] tenant_users lookup');

  if (membership) {
    request.tenantId = membership.tenant_id as string;
    request.userId = user.id;
    request.userRole = membership.role as 'admin' | 'supervisor' | 'agent';
    return;
  }

  // Fallback: platform_users get admin access to the first available tenant
  const { data: platformUser, error: platformError } = await db
    .from('platform_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  request.log.info({ userId: user.id, platformUser, platformError }, '[auth] platform_users lookup');

  if (platformUser) {
    const { data: tenant } = await db
      .from('tenants')
      .select('id')
      .limit(1)
      .single();

    if (!tenant) {
      await reply.status(403).send({ success: false, error: 'No tenant found' });
      return;
    }

    request.tenantId = tenant.id as string;
    request.userId = user.id;
    request.userRole = 'admin';
    return;
  }

  await reply.status(403).send({ success: false, error: 'No tenant membership found' });
}

export function requireRole(...roles: Array<'admin' | 'supervisor' | 'agent'>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!roles.includes(request.userRole)) {
      await reply.status(403).send({ success: false, error: 'Insufficient permissions' });
    }
  };
}
