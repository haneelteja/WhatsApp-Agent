// Async document processing pipeline.
// Flow: fetch from Storage → extract text → chunk → batch-embed → save as KB entries → update status.
// Triggered fire-and-forget from the upload endpoint via setImmediate.

import { getServerClient } from '@alphabot/database';
import { chunkText } from './chunker.js';
import { extractImageContent } from './image-extractor.js';
import { generateEmbeddingsBatch } from './embedding.js';

async function extractPDF(buffer: Buffer): Promise<string> {
  // Dynamic import — pdf-parse is CommonJS and heavy, only load when needed
  const mod = await import('pdf-parse');
  const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
  const result = await pdfParse(buffer);
  return result.text;
}

async function extractDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function processDocument(documentId: string): Promise<void> {
  const db = getServerClient();

  const { data: doc, error: fetchErr } = await db
    .from('kb_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchErr || !doc) {
    console.error('[DocProcessor] Document not found:', documentId);
    return;
  }

  await db.from('kb_documents').update({ status: 'processing' }).eq('id', documentId);

  try {
    // ── 1. Download from Supabase Storage ──────────────────────────────────
    const { data: blob, error: downloadErr } = await db.storage
      .from('kb-documents')
      .download(doc.storage_path as string);

    if (downloadErr || !blob) {
      throw new Error(`Storage download failed: ${downloadErr?.message ?? 'empty response'}`);
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    // ── 2. Extract text / content ───────────────────────────────────────────
    let chunks: { title: string; content: string }[] = [];

    if (doc.file_type === 'image') {
      const extracted = await extractImageContent(buffer, doc.mime_type as string);
      if (extracted.trim()) {
        chunks = [{ title: doc.name as string, content: extracted }];
      }
    } else {
      let rawText = '';
      if      (doc.file_type === 'pdf')  rawText = await extractPDF(buffer);
      else if (doc.file_type === 'docx') rawText = await extractDOCX(buffer);
      else                               rawText = buffer.toString('utf-8');  // txt / md

      chunks = chunkText(rawText, doc.name as string);
    }

    if (!chunks.length) {
      await db.from('kb_documents')
        .update({ status: 'done', chunk_count: 0 })
        .eq('id', documentId);
      return;
    }

    // ── 3. Batch-generate embeddings (single API call per document) ─────────
    const embeddingTexts = chunks.map(c => `${c.title}\n${c.content}`);
    let embeddings: (number[] | null)[] = new Array(chunks.length).fill(null);
    try {
      embeddings = await generateEmbeddingsBatch(embeddingTexts, 'document');
    } catch (err) {
      console.warn('[DocProcessor] Embedding failed, saving without vectors:', (err as Error).message);
    }

    // ── 4. Save chunks as knowledge_base entries (50 per batch) ────────────
    const rows = chunks.map((chunk, i) => ({
      tenant_id:          doc.tenant_id,
      product_type:       'support_bot',         // required by schema; collection drives RAG
      collection_id:      doc.collection_id,
      source_document_id: documentId,
      question:           chunk.title,
      answer:             chunk.content,
      category:           doc.name,
      status:             'live',
      embedding:          embeddings[i] ?? null,
    }));

    for (let i = 0; i < rows.length; i += 50) {
      const { error: insertErr } = await db
        .from('knowledge_base')
        .insert(rows.slice(i, i + 50));
      if (insertErr) throw new Error(`Insert batch ${i / 50}: ${insertErr.message}`);
    }

    // ── 5. Mark done ────────────────────────────────────────────────────────
    await db.from('kb_documents')
      .update({ status: 'done', chunk_count: chunks.length })
      .eq('id', documentId);

    console.info(`[DocProcessor] ${doc.name} → ${chunks.length} chunks (${documentId})`);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[DocProcessor] Failed:', documentId, message);
    await db.from('kb_documents')
      .update({ status: 'error', error_message: message.slice(0, 500) })
      .eq('id', documentId);
  }
}
