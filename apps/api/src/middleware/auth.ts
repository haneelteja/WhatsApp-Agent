import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { getServerClient } from '@alphabot/database';
import { cacheGet, cacheSet } from '../lib/redis.js';

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

interface AuthContext {
  tenantId: string;
  userId:   string;
  userRole: 'admin' | 'supervisor' | 'agent';
}

// Cache auth results for 30s — safe since JWTs are valid for 1h and the
// tenant→user mapping is stable within that window.
const AUTH_CACHE_TTL = 30;

async function resolveAuthContext(token: string): Promise<AuthContext | null> {
  const cacheKey = `auth:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;

  const cached = await cacheGet<AuthContext>(cacheKey);
  if (cached) return cached;

  const { data: { user }, error } = await getAnonClient().auth.getUser(token);
  if (error || !user) return null;

  const db = getServerClient();

  // Try tenant_users first (service-role bypasses RLS)
  const { data: membership } = await db
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (membership) {
    const ctx: AuthContext = {
      tenantId: membership.tenant_id as string,
      userId:   user.id,
      userRole: membership.role as 'admin' | 'supervisor' | 'agent',
    };
    await cacheSet(cacheKey, ctx, AUTH_CACHE_TTL);
    return ctx;
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

    if (!tenant) return null;

    const ctx: AuthContext = {
      tenantId: tenant.id as string,
      userId:   user.id,
      userRole: 'admin',
    };
    await cacheSet(cacheKey, ctx, AUTH_CACHE_TTL);
    return ctx;
  }

  return null;
}

/**
 * Fastify preHandler: validates the Supabase JWT from the Authorization header
 * and attaches tenantId + role to the request for downstream use.
 * Auth context is cached in Redis for 30s to eliminate repeat DB lookups.
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
  const ctx   = await resolveAuthContext(token);

  if (!ctx) {
    await reply.status(401).send({ success: false, error: 'Invalid token or no tenant membership' });
    return;
  }

  request.tenantId  = ctx.tenantId;
  request.userId    = ctx.userId;
  request.userRole  = ctx.userRole;
}

export function requireRole(...roles: Array<'admin' | 'supervisor' | 'agent'>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!roles.includes(request.userRole)) {
      await reply.status(403).send({ success: false, error: 'Insufficient permissions' });
    }
  };
}
