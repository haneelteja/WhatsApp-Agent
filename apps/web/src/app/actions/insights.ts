'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';

export interface InsightSuggestion {
  fingerprint: string;
  title: string;
  description: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  action_link: string;
}

export interface InsightRow {
  id: string;
  generated_at: string;
  suggestions: InsightSuggestion[];
  dismissed_fingerprints: string[];
}

export async function getLatestInsightsAction(tenantId: string): Promise<InsightRow | null> {
  noStore(); // insights are written by the API server — always fetch fresh, never use Next.js data cache
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('ai_insights')
    .select('id, generated_at, suggestions, dismissed_fingerprints')
    .eq('tenant_id', tenantId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as InsightRow | null;
}

export async function dismissInsightAction(insightId: string, fingerprint: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { data: row } = await admin
    .from('ai_insights')
    .select('dismissed_fingerprints')
    .eq('id', insightId)
    .single();

  const current = (row?.dismissed_fingerprints as string[] | null) ?? [];
  if (!current.includes(fingerprint)) {
    await admin
      .from('ai_insights')
      .update({ dismissed_fingerprints: [...current, fingerprint] })
      .eq('id', insightId);
  }
  revalidatePath('/dashboard');
}
