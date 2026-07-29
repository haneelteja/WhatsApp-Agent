import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth } from '../../middleware/auth.js';
import { generateEmbedding, generateEmbeddingsBatch } from '../../services/kb/embedding.js';
import { invalidateKBCache } from '../../services/kb/lookup.js';
import { chatCompletion, REPLY_MODEL } from '../../lib/anthropic.js';

// All routes require tenant context from auth middleware.
// The middleware decorates the request with: tenantId, userId, userRole.

export async function kbRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Collections ────────────────────────────────────────────────────────────

  // GET /api/kb/collections — list all collections for the current tenant
  fastify.get('/collections', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { data, error } = await db
      .from('kb_collections')
      .select('*, kb_collection_bots(product_slug, priority)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // POST /api/kb/collections — create a new collection
  fastify.post<{ Body: { name: string; description?: string } }>(
    '/collections',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { name, description } = request.body;
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

      const { data, error } = await db
        .from('kb_collections')
        .insert({ tenant_id: tenantId, name: name.trim(), description: description ?? null })
        .select()
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      return reply.status(201).send({ data });
    }
  );

  // GET /api/kb/collections/:id — single collection with entries
  fastify.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string; search?: string } }>(
    '/collections/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params;
      const page   = Math.max(1, parseInt(request.query.page  ?? '1',  10));
      const limit  = Math.min(100, parseInt(request.query.limit ?? '20', 10));
      const from   = (page - 1) * limit;
      const search = request.query.search?.trim();

      let entriesQuery = db
        .from('knowledge_base')
        .select('id, question, answer, category, status, version, source_document_id, created_at', { count: 'exact' })
        .eq('collection_id', id)
        .order('created_at', { ascending: false })
        .range(from, from + limit - 1);

      if (search) {
        entriesQuery = entriesQuery.or(
          `question.ilike.%${search}%,answer.ilike.%${search}%,category.ilike.%${search}%`
        );
      }

      const [collectionRes, entriesRes] = await Promise.all([
        db.from('kb_collections')
          .select('*, kb_collection_bots(product_slug, priority)')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .single(),
        entriesQuery,
      ]);

      if (collectionRes.error || !collectionRes.data)
        return reply.status(404).send({ error: 'Collection not found' });

      return reply.send({
        data: collectionRes.data,
        entries: entriesRes.data ?? [],
        total: entriesRes.count ?? 0,
        page,
        limit,
      });
    }
  );

  // PATCH /api/kb/collections/:id — update name/description/active
  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; description?: string; active?: boolean };
  }>('/collections/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params;
    const updates: Record<string, unknown> = {};
    if (request.body.name       !== undefined) updates['name']        = request.body.name.trim();
    if (request.body.description !== undefined) updates['description'] = request.body.description;
    if (request.body.active      !== undefined) updates['active']      = request.body.active;

    const { data, error } = await db
      .from('kb_collections')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // DELETE /api/kb/collections/:id — delete collection (cascades to entries)
  fastify.delete<{ Params: { id: string } }>('/collections/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { error } = await db
      .from('kb_collections')
      .delete()
      .eq('id', request.params.id)
      .eq('tenant_id', tenantId);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(204).send();
  });

  // ── Bot Assignments ────────────────────────────────────────────────────────

  // POST /api/kb/collections/:id/bots — assign collection to a bot
  fastify.post<{
    Params: { id: string };
    Body: { product_slug: string; priority?: number };
  }>('/collections/:id/bots', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params;
    const { product_slug, priority = 1 } = request.body;

    const { data, error } = await db
      .from('kb_collection_bots')
      .upsert({
        collection_id: id,
        tenant_id: tenantId,
        product_slug,
        priority,
      }, { onConflict: 'collection_id,tenant_id,product_slug' })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data });
  });

  // DELETE /api/kb/collections/:id/bots/:productSlug — remove bot assignment
  fastify.delete<{ Params: { id: string; productSlug: string } }>(
    '/collections/:id/bots/:productSlug',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { error } = await db
        .from('kb_collection_bots')
        .delete()
        .eq('collection_id', request.params.id)
        .eq('tenant_id', tenantId)
        .eq('product_slug', request.params.productSlug);

      if (error) return reply.status(500).send({ error: error.message });
      return reply.status(204).send();
    }
  );

  // ── KB Entries ─────────────────────────────────────────────────────────────

  // POST /api/kb/collections/:id/entries — create entry + generate embedding
  fastify.post<{
    Params: { id: string };
    Body: { question: string; answer: string; category?: string; status?: string };
  }>('/collections/:id/entries', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id: collectionId } = request.params;
    const { question, answer, category = 'General', status = 'live' } = request.body;

    if (!question?.trim() || !answer?.trim())
      return reply.status(400).send({ error: 'question and answer are required' });

    // Generate embedding for the combined Q+A text
    let embedding: number[] | null = null;
    try {
      const embeddingText = `${question}\n${answer}`;
      embedding = await generateEmbedding(embeddingText, 'document');
    } catch (err) {
      fastify.log.warn({ err }, '[KB] Embedding generation failed — entry saved without embedding');
    }

    const { data, error } = await db
      .from('knowledge_base')
      .insert({
        tenant_id: tenantId,
        product_type: 'support_bot',  // required by schema; collection_id takes precedence for retrieval
        collection_id: collectionId,
        question: question.trim(),
        answer: answer.trim(),
        category,
        status,
        embedding,
      })
      .select('id, question, answer, category, status, created_at')
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    void invalidateKBCache(tenantId);
    return reply.status(201).send({ data });
  });

  // POST /api/kb/collections/:id/entries/bulk — import multiple entries at once
  fastify.post<{
    Params: { id: string };
    Body: { entries: Array<{ question: string; answer: string; category?: string }> };
  }>('/collections/:id/entries/bulk', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id: collectionId } = request.params;
    const { entries } = request.body;

    if (!entries?.length) return reply.status(400).send({ error: 'entries array is required' });
    if (entries.length > 100) return reply.status(400).send({ error: 'Max 100 entries per bulk import' });

    // Batch-generate embeddings
    const texts = entries.map(e => `${e.question}\n${e.answer}`);
    let embeddings: (number[] | null)[] = new Array(entries.length).fill(null);
    try {
      embeddings = await generateEmbeddingsBatch(texts, 'document');
    } catch (err) {
      fastify.log.warn({ err }, '[KB] Batch embedding failed — entries saved without embeddings');
    }

    const rows = entries.map((e, i) => ({
      tenant_id: tenantId,
      product_type: 'support_bot',
      collection_id: collectionId,
      question: e.question.trim(),
      answer: e.answer.trim(),
      category: e.category ?? 'General',
      status: 'live',
      embedding: embeddings[i] ?? null,
    }));

    const { data, error } = await db
      .from('knowledge_base')
      .insert(rows)
      .select('id, question, category, status');

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data, inserted: (data ?? []).length });
  });

  // PUT /api/kb/entries/:entryId — update entry + re-generate embedding
  fastify.put<{
    Params: { entryId: string };
    Body: { question?: string; answer?: string; category?: string; status?: string };
  }>('/entries/:entryId', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { entryId } = request.params;
    const updates: Record<string, unknown> = {};
    if (request.body.question) updates['question'] = request.body.question.trim();
    if (request.body.answer)   updates['answer']   = request.body.answer.trim();
    if (request.body.category) updates['category'] = request.body.category;
    if (request.body.status)   updates['status']   = request.body.status;

    // Re-generate embedding if content changed
    if (updates['question'] || updates['answer']) {
      const { data: existing } = await db
        .from('knowledge_base')
        .select('question, answer, tenant_id')
        .eq('id', entryId)
        .single();

      if (existing && existing.tenant_id !== tenantId)
        return reply.status(403).send({ error: 'Forbidden' });

      const q = (updates['question'] as string) ?? existing?.question ?? '';
      const a = (updates['answer']   as string) ?? existing?.answer   ?? '';
      try {
        updates['embedding'] = await generateEmbedding(`${q}\n${a}`, 'document');
        updates['version']   = (existing as { version?: number } | null)?.version ? ((existing as { version?: number }).version ?? 0) + 1 : 1;
      } catch (err) {
        fastify.log.warn({ err }, '[KB] Re-embedding failed');
      }
    }

    const { data, error } = await db
      .from('knowledge_base')
      .update(updates)
      .eq('id', entryId)
      .eq('tenant_id', tenantId)
      .select('id, question, answer, category, status, version')
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // DELETE /api/kb/entries/:entryId — delete a single entry
  fastify.delete<{ Params: { entryId: string } }>('/entries/:entryId', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { error } = await db
      .from('knowledge_base')
      .delete()
      .eq('id', request.params.entryId)
      .eq('tenant_id', tenantId);

    if (error) return reply.status(500).send({ error: error.message });
    void invalidateKBCache(tenantId);
    return reply.status(204).send();
  });

  // ── AI KB Generator ────────────────────────────────────────────────────────

  // POST /api/kb/generate — use Claude to generate KB entries from business info
  fastify.post<{
    Body: {
      businessOverview: string;
      industry:         string;
      customerType:     string;
      products:         Array<{ name: string; description: string; price: string }>;
      policies: {
        returns:      string;
        shipping:     string;
        payment:      string;
        supportHours: string;
        warranty:     string;
      };
      faqSeeds: string[];
    };
  }>('/generate', { preHandler: [requireAuth] }, async (request, reply) => {
    const tenantId = (request as { tenantId?: string }).tenantId;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const { businessOverview, industry, customerType, products, policies, faqSeeds } = request.body;

    if (!businessOverview?.trim()) {
      return reply.status(400).send({ error: 'businessOverview is required' });
    }

    // Build structured input for Claude
    const productLines = (products ?? [])
      .filter(p => p.name?.trim())
      .map(p => `- ${p.name}${p.description ? `: ${p.description}` : ''}${p.price ? ` (${p.price})` : ''}`)
      .join('\n');

    const policyLines = [
      policies?.returns      && `Returns/Refunds: ${policies.returns}`,
      policies?.shipping     && `Delivery/Shipping: ${policies.shipping}`,
      policies?.payment      && `Payment Methods: ${policies.payment}`,
      policies?.supportHours && `Support Hours & Channels: ${policies.supportHours}`,
      policies?.warranty     && `Warranty/Guarantee: ${policies.warranty}`,
    ].filter(Boolean).join('\n');

    const faqLines = (faqSeeds ?? [])
      .filter(q => q?.trim())
      .map((q, i) => `${i + 1}. ${q.trim()}`)
      .join('\n');

    const userMessage = [
      `BUSINESS OVERVIEW:\n${businessOverview.trim()}`,
      `Industry: ${industry || 'Not specified'}`,
      `Customer Type: ${customerType || 'Not specified'}`,
      productLines  && `\nPRODUCTS & SERVICES:\n${productLines}`,
      policyLines   && `\nPOLICIES & OPERATIONS:\n${policyLines}`,
      faqLines      && `\nCUSTOMER FAQ SEEDS (use these as primary entries and expand):\n${faqLines}`,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are a Knowledge Base builder for a WhatsApp AI customer support bot.
Given business information, generate comprehensive Q&A pairs a bot can use to answer customer questions accurately.

Generate 30-50 entries covering all relevant aspects of the business.
Use ONLY these categories: Products, Pricing, Ordering, Delivery, Returns, Support, Company, General

Rules:
- Questions must be phrased exactly as a customer would ask them via WhatsApp (conversational, natural)
- Answers must be 1-4 sentences, accurate to the provided information, friendly and helpful in tone
- If FAQ seeds are provided, use each as a primary question (answer it based on the business info) then add related questions
- Cover all products, all policies, common customer concerns, and company/trust questions
- Do NOT invent information not provided — use "Contact us for details" for genuinely unknown info
- Return ONLY valid JSON with no explanation, no markdown fences, no preamble

Output format (strict, no other text):
{"entries":[{"question":"...","answer":"...","category":"..."}]}`;

    try {
      const { content } = await chatCompletion({
        model:      REPLY_MODEL,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
        max_tokens: 4096,
      });

      // Extract JSON — handle both bare JSON and ```json fenced blocks
      let raw = content.trim();
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) raw = fenced[1]!.trim();

      let parsed: { entries: Array<{ question: string; answer: string; category: string }> };
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        // Try to extract JSON object if there's surrounding text
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (!objMatch) {
          fastify.log.error('[KB Generate] Could not parse Claude response as JSON');
          return reply.status(502).send({ error: 'Generation failed — please try again' });
        }
        parsed = JSON.parse(objMatch[0]) as typeof parsed;
      }

      if (!Array.isArray(parsed?.entries)) {
        return reply.status(502).send({ error: 'Generation failed — unexpected response format' });
      }

      // Filter empty, dedupe, cap at 100
      const entries = parsed.entries
        .filter(e => e.question?.trim() && e.answer?.trim())
        .slice(0, 100);

      return reply.send({ entries });
    } catch (err) {
      fastify.log.error({ err }, '[KB Generate] Claude call failed');
      return reply.status(502).send({ error: 'Generation failed — please try again' });
    }
  });
}
