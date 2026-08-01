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

// Module-level singleton for JWT validation — avoids allocating a new SupabaseClient
// (with its internal fetch wrappers and event emitters) on every authenticated request.
let _anonClient: ReturnType<typeof createClient> | null = null;

function getAnonClient() {
  if (_anonClient) return _anonClient;
  _anonClient = createClient(
    process.env['SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _anonClient;
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

  // Validate the JWT using the singleton anon client; getUser(token) passes the
  // JWT as a parameter rather than a header, so the client can be safely shared.
  const { data: { user }, error } = await getAnonClient().auth.getUser(token);

  if (error || !user) {
    await reply.status(401).send({ success: false, error: 'Invalid token' });
    return;
  }

  const db = getServerClient();

  // Try tenant_users first (service-role bypasses RLS)
  const { data: membership } = await db
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (membership) {
    request.tenantId = membership.tenant_id as string;
    request.userId = user.id;
    request.userRole = membership.role as 'admin' | 'supervisor' | 'agent';
    return;
  }

  // Fallback: platform_users get admin access to the earliest tenant
  const { data: platformUser } = await db
    .from('platform_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (platformUser) {
    const { data: tenant } = await db
      .from('tenants')
      .select('id')
      .order('created_at', { ascending: true })
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
