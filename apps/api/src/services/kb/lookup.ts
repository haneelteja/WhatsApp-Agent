import { getServerClient } from '@alphabot/database';
import type { KnowledgeBase, ProductSlug, RAGResult } from '@alphabot/shared';
import { generateEmbedding } from './embedding.js';

/**
 * Full RAG lookup for an incoming user query.
 *
 * Strategy (in order):
 *  1. Find all KB collections assigned to this tenant+product
 *  2. If VOYAGE_API_KEY is set: generate query embedding → vector similarity search
 *  3. Fallback: keyword ILIKE search across the same collections
 *  4. Final fallback: legacy product_type-scoped entries (no collection)
 *
 * Returns the top K most relevant KB entries.
 */
export async function lookupKB(
  tenantId: string,
  productSlug: ProductSlug,
  query: string,
  limit = 5
): Promise<KnowledgeBase[]> {
  const db = getServerClient();

  // 1. Find collection IDs assigned to this bot
  const { data: assignments } = await db
    .from('kb_collection_bots')
    .select('collection_id')
    .eq('tenant_id', tenantId)
    .eq('product_slug', productSlug)
    .order('priority', { ascending: true });

  const collectionIds = (assignments ?? []).map((a: { collection_id: string }) => a.collection_id);

  // 2. If we have collections, do semantic + keyword search
  if (collectionIds.length > 0) {
    const results = await lookupKBByCollections(collectionIds, query, limit);
    if (results.length > 0) return results;
  }

  // 3. Final fallback: legacy product_type-scoped keyword search
  const { data, error } = await db
    .from('knowledge_base')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('product_type', productSlug)
    .eq('status', 'live')
    .or(`question.ilike.%${query}%,answer.ilike.%${query}%,category.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error('[KB] Legacy fallback lookup failed:', error.message);
    return [];
  }

  return (data ?? []) as KnowledgeBase[];
}

/**
 * Search KB entries belonging to specific collections.
 * Tries vector similarity first (if embeddings available), falls back to keyword.
 */
export async function lookupKBByCollections(
  collectionIds: string[],
  query: string,
  limit = 5
): Promise<KnowledgeBase[]> {
  const db = getServerClient();

  // Try semantic search if API key is configured
  if (process.env['VOYAGE_API_KEY']) {
    try {
      const queryEmbedding = await generateEmbedding(query, 'query');

      const { data: semanticResults, error } = await db.rpc('match_knowledge_base', {
        query_embedding: queryEmbedding,
        collection_ids: collectionIds,
        match_count: limit,
        match_threshold: 0.5,
      });

      if (!error && semanticResults && (semanticResults as RAGResult[]).length > 0) {
        // Map RPC result shape to KnowledgeBase shape
        return (semanticResults as RAGResult[]).map(r => ({
          id: r.id,
          question: r.question,
          answer: r.answer,
          category: r.category,
          // Populate required KnowledgeBase fields with safe defaults
          tenant_id: '',
          product_type: 'support_bot' as ProductSlug,
          collection_id: collectionIds[0] ?? null,
          embedding: null,
          status: 'live' as const,
          version: 1,
          created_at: '',
          updated_at: '',
        }));
      }
    } catch (err) {
      console.warn('[KB] Semantic search failed, falling back to keyword:', (err as Error).message);
    }
  }

  // Keyword fallback via RPC
  const { data: textResults, error: textError } = await db.rpc('search_knowledge_base_text', {
    query_text: query,
    collection_ids: collectionIds,
    match_count: limit,
  });

  if (textError) {
    console.error('[KB] Text search failed:', textError.message);
    return [];
  }

  return ((textResults ?? []) as RAGResult[]).map(r => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    category: r.category,
    tenant_id: '',
    product_type: 'support_bot' as ProductSlug,
    collection_id: collectionIds[0] ?? null,
    embedding: null,
    status: 'live' as const,
    version: 1,
    created_at: '',
    updated_at: '',
  }));
}
