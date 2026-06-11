'use client';

import { getSupabaseBrowserClient } from './supabase/client';

export const KB_API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

export async function kbHeaders(): Promise<HeadersInit> {
  const supabase = getSupabaseBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  };
}

export async function kbFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await kbHeaders();
  return fetch(`${KB_API}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}
