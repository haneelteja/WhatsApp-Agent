import { getServerClient } from '@alphabot/database';
import { cacheGet, cacheSet } from './redis.js';

const TTL = 300; // 5 min — product changes are infrequent

export interface CachedProduct {
  id: string;
  name: string;
  description: string | null;
  price_inr: number | null;
  category: string | null;
  sku: string | null;
}

/**
 * Fetch active products for a tenant, cached in Redis for 5 minutes.
 * Used to inject the product catalogue into the sales bot system prompt.
 */
export async function getProductCatalogue(tenantId: string): Promise<CachedProduct[]> {
  const key = `products:${tenantId}`;

  const cached = await cacheGet<CachedProduct[]>(key);
  if (cached) return cached;

  const db = getServerClient();
  const { data } = await db
    .from('product_catalogue')
    .select('id, name, description, price_inr, category, sku')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  const products = (data ?? []) as CachedProduct[];
  if (products.length > 0) await cacheSet(key, products, TTL);
  return products;
}
