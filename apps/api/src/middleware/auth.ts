import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';

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

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    await reply.status(401).send({ success: false, error: 'Invalid token' });
    return;
  }

  // Load tenant membership and role
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    await reply.status(403).send({ success: false, error: 'No tenant membership found' });
    return;
  }

  request.tenantId = membership.tenant_id as string;
  request.userId = user.id;
  request.userRole = membership.role as 'admin' | 'supervisor' | 'agent';
}

export function requireRole(...roles: Array<'admin' | 'supervisor' | 'agent'>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!roles.includes(request.userRole)) {
      await reply.status(403).send({ success: false, error: 'Insufficient permissions' });
    }
  };
}
