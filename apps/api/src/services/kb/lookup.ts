import { getServerClient } from '@alphabot/database';
import type { KnowledgeBase, ProductType } from '@alphabot/shared';

/**
 * Retrieve the top-K relevant KB entries for a query.
 * Phase 1: keyword ILIKE search (fast, no vector infrastructure needed).
 * Phase 2: swap body to pgvector cosine similarity using pre-computed embeddings.
 */
export async function lookupKB(
  tenantId: string,
  productType: ProductType,
  query: string,
  limit = 5
): Promise<KnowledgeBase[]> {
  const db = getServerClient();

  // Simple full-text match — good enough for Phase 1 FAQs
  const { data, error } = await db
    .from('knowledge_base')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('product_type', productType)
    .eq('status', 'live')
    .or(`question.ilike.%${query}%,answer.ilike.%${query}%,category.ilike.%${query}%`)
    .limit(limit);

  if (error) throw new Error(`KB lookup failed: ${error.message}`);
  return (data ?? []) as KnowledgeBase[];
}

/**
 * Semantic KB search via pgvector — call after generating an embedding for the query.
 * Requires the embedding column to be populated and the ivfflat index to exist.
 */
export async function lookupKBSemantic(
  tenantId: string,
  productType: ProductType,
  queryEmbedding: number[],
  limit = 5
): Promise<KnowledgeBase[]> {
  const db = getServerClient();

  const { data, error } = await db.rpc('match_knowledge_base', {
    query_embedding: queryEmbedding,
    match_tenant_id: tenantId,
    match_product_type: productType,
    match_count: limit,
  });

  if (error) throw new Error(`Semantic KB lookup failed: ${error.message}`);
  return (data ?? []) as KnowledgeBase[];
}
