import { getServerClient } from '@alphabot/database';
import type { KnowledgeBase, ProductSlug, RAGResult } from '@alphabot/shared';
import { generateEmbedding } from './embedding.js';
import { cacheGet, cacheSet, cacheDelPattern } from '../../lib/redis.js';
import { createHash } from 'crypto';

const KB_CACHE_TTL = 300; // 5 minutes — KB content changes infrequently

/**
 * Full RAG lookup for an incoming user query.
 *
 * Strategy (in order):
 *  1. Redis cache — keyed by tenantId + query hash (tenant-wide, shared across all bots)
 *  2. Find all KB collections for this tenant (KB is shared across all bots)
 *  3. If VOYAGE_API_KEY is set: generate query embedding → vector similarity search
 *  4. Fallback: keyword ILIKE search across the same collections
 *  5. Final fallback: legacy product_type-scoped entries (no collection)
 *
 * Returns the top K most relevant KB entries.
 */
export async function lookupKB(
  tenantId: string,
  productSlug: ProductSlug,
  query: string,
  limit = 5
): Promise<KnowledgeBase[]> {
  const queryHash = createHash('sha256')
    .update(`${tenantId}:${query}`)
    .digest('hex')
    .slice(0, 16);
  const cacheKey = `kb:${tenantId}:${queryHash}`;

  const cached = await cacheGet<KnowledgeBase[]>(cacheKey);
  if (cached) return cached;

  const results = await _lookupKBFromDb(tenantId, productSlug, query, limit);
  await cacheSet(cacheKey, results, KB_CACHE_TTL);
  return results;
}

/** Invalidate all KB cache entries for a tenant (call on KB create/update/delete). */
export async function invalidateKBCache(tenantId: string): Promise<void> {
  await cacheDelPattern(`kb:${tenantId}:*`);
}

async function _lookupKBFromDb(
  tenantId: string,
  productSlug: ProductSlug,
  query: string,
  limit: number,
): Promise<KnowledgeBase[]> {
  const db = getServerClient();

  // 1. Find all KB collection IDs for this tenant (KB is shared across all bots)
  const { data: assignments } = await db
    .from('kb_collection_bots')
    .select('collection_id')
    .eq('tenant_id', tenantId)
    .order('priority', { ascending: true });

  const collectionIds = (assignments ?? []).map((a: { collection_id: string }) => a.collection_id);

  // 2. If we have collections, do semantic + keyword search
  if (collectionIds.length > 0) {
    const results = await lookupKBByCollections(collectionIds, query, limit);
    if (results.length > 0) return results;
  }

  // 3. Final fallback: legacy product_type-scoped keyword search
  // Strip PostgREST filter-injection characters before embedding in the .or() string.
  // A raw comma would add extra filter predicates; parens alter grouping.
  const safeQ = query.replace(/[,()]/g, ' ');

  const { data, error } = await db
    .from('knowledge_base')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('product_type', productSlug)
    .eq('status', 'live')
    .or(`question.ilike.%${safeQ}%,answer.ilike.%${safeQ}%,category.ilike.%${safeQ}%`)
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

      // Set probes=10 so IVFFlat searches 10% of clusters (vs default 1%).
      // Improves recall from ~10% to ~70% with negligible latency cost.
      await db.rpc('set_ivfflat_probes', { probes: 10 });

      const { data: semanticResults, error } = await db.rpc('match_knowledge_base', {
        query_embedding: queryEmbedding,
        collection_ids: collectionIds,
        match_count: limit,
        match_threshold: 0.5,
      });

      if (!error && semanticResults && (semanticResults as RAGResult[]).length > 0) {
        return (semanticResults as RAGResult[]).map(r => {
          // Cast to access collection_id returned by the RPC (not in the base RAGResult type)
          const row = r as RAGResult & { collection_id?: string | null };
          return {
            id: r.id,
            question: r.question,
            answer: r.answer,
            category: r.category,
            tenant_id: '',
            product_type: 'support_bot' as ProductSlug,
            collection_id: row.collection_id ?? null,
            embedding: null,
            status: 'live' as const,
            version: 1,
            created_at: '',
            updated_at: '',
          };
        });
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

  return ((textResults ?? []) as RAGResult[]).map(r => {
    const row = r as RAGResult & { collection_id?: string | null };
    return {
      id: r.id,
      question: r.question,
      answer: r.answer,
      category: r.category,
      tenant_id: '',
      product_type: 'support_bot' as ProductSlug,
      collection_id: row.collection_id ?? null,
      embedding: null,
      status: 'live' as const,
      version: 1,
      created_at: '',
      updated_at: '',
    };
  });
}
