import { getServerClient } from '@alphabot/database';
import type { KnowledgeBase, ProductSlug, RAGResult } from '@alphabot/shared';
import { generateEmbedding } from './embedding.js';
import { cacheGet, cacheSet, cacheDelPattern } from '../../lib/redis.js';
import { createHash } from 'crypto';

export interface KBLookupResult {
  results: KnowledgeBase[];
  /** Top similarity score from semantic search (0 when no vector search ran). */
  topScore: number;
}

function logKBHits(tenantId: string, query: string, productType: ProductSlug, results: KnowledgeBase[]): void {
  if (!results.length) return;
  const db = getServerClient();
  void db.from('kb_hit_log').insert(
    results.map(r => ({
      tenant_id:    tenantId,
      entry_id:     r.id || null,
      query:        query.slice(0, 500),
      product_type: productType,
      score:        null,
    }))
  ).then(() => {}, () => {});
}

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
/**
 * Full RAG lookup returning entries AND the top semantic similarity score.
 * Use this in the webhook pipeline to enable reasoning-effort tier decisions.
 */
export async function lookupKBWithScore(
  tenantId: string,
  productSlug: ProductSlug,
  query: string,
  limit = 5
): Promise<KBLookupResult> {
  const queryHash = createHash('sha256')
    .update(`${tenantId}:${query}`)
    .digest('hex')
    .slice(0, 16);
  const cacheKey = `kb:${tenantId}:${queryHash}`;

  const cached = await cacheGet<KBLookupResult | KnowledgeBase[]>(cacheKey);
  if (cached) {
    // Handle both new { results, topScore } format and old KnowledgeBase[] format
    if (Array.isArray(cached)) {
      logKBHits(tenantId, query, productSlug, cached);
      return { results: cached, topScore: 0 };
    }
    logKBHits(tenantId, query, productSlug, cached.results);
    return cached;
  }

  const lookup = await _lookupKBFromDb(tenantId, productSlug, query, limit);
  if (lookup.results.length > 0) {
    await cacheSet(cacheKey, lookup, KB_CACHE_TTL);
    logKBHits(tenantId, query, productSlug, lookup.results);
  }
  return lookup;
}

/** Backward-compatible wrapper — returns only the KB entries. */
export async function lookupKB(
  tenantId: string,
  productSlug: ProductSlug,
  query: string,
  limit = 5
): Promise<KnowledgeBase[]> {
  const { results } = await lookupKBWithScore(tenantId, productSlug, query, limit);
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
): Promise<KBLookupResult> {
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
    const lookup = await lookupKBByCollections(collectionIds, query, limit);
    if (lookup.results.length > 0) return lookup;
  }

  // 3. Final fallback: tenant-wide keyword search across legacy (non-collection) entries
  // Strip PostgREST filter-injection characters before embedding in the .or() string.
  const safeQ = query.replace(/[,()]/g, ' ');

  const { data, error } = await db
    .from('knowledge_base')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'live')
    .is('collection_id', null)
    .or(`question.ilike.%${safeQ}%,answer.ilike.%${safeQ}%,category.ilike.%${safeQ}%`)
    .limit(limit);

  if (error) {
    console.error('[KB] Legacy fallback lookup failed:', error.message);
    return { results: [], topScore: 0 };
  }

  return { results: (data ?? []) as KnowledgeBase[], topScore: 0 };
}

/**
 * Search KB entries belonging to specific collections.
 * Tries vector similarity first (if embeddings available), falls back to keyword.
 * Returns entries AND the top similarity score (0 when only keyword search ran).
 */
export async function lookupKBByCollections(
  collectionIds: string[],
  query: string,
  limit = 5
): Promise<KBLookupResult> {
  const db = getServerClient();

  // Try semantic search if API key is configured
  if (process.env['VOYAGE_API_KEY']) {
    try {
      const queryEmbedding = await generateEmbedding(query, 'query');

      const { data: semanticResults, error } = await db.rpc('match_knowledge_base', {
        query_embedding:  queryEmbedding,
        collection_ids:   collectionIds,
        match_count:      limit,
        match_threshold:  0.5,
        probes:           10,  // applied via set_config inside the RPC (PgBouncer-safe)
      });

      if (!error && semanticResults && (semanticResults as RAGResult[]).length > 0) {
        const rows = semanticResults as RAGResult[];
        const topScore = rows[0]?.similarity ?? 0;
        return {
          results: rows.map(r => {
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
          }),
          topScore,
        };
      }
    } catch (err) {
      console.warn('[KB] Semantic search failed, falling back to keyword:', (err as Error).message);
    }
  }

  // Keyword fallback via RPC — no similarity score available
  const { data: textResults, error: textError } = await db.rpc('search_knowledge_base_text', {
    query_text: query,
    collection_ids: collectionIds,
    match_count: limit,
  });

  if (textError) {
    console.error('[KB] Text search failed:', textError.message);
    return { results: [], topScore: 0 };
  }

  return {
    results: ((textResults ?? []) as RAGResult[]).map(r => {
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
    }),
    topScore: 0,
  };
}
