import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth } from '../../middleware/auth.js';
import { processDocument } from '../../services/kb/document-processor.js';

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf':                                                        'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain':    'txt',
  'text/markdown': 'md',
  'image/jpeg':    'image',
  'image/jpg':     'image',
  'image/png':     'image',
  'image/webp':    'image',
  'image/gif':     'image',
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

async function ensureBucket(db: ReturnType<typeof getServerClient>): Promise<void> {
  const { error } = await db.storage.createBucket('kb-documents', {
    public:           false,
    fileSizeLimit:    MAX_FILE_BYTES,
    allowedMimeTypes: Object.keys(ALLOWED_MIME),
  });
  if (error && !error.message.toLowerCase().includes('already exist')) {
    console.warn('[KB Documents] Bucket init:', error.message);
  }
}

export async function kbDocumentRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/kb/collections/:id/documents ─────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/collections/:id/documents',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { data, error } = await db
        .from('kb_documents')
        .select('id, name, file_type, file_size, status, error_message, chunk_count, created_at')
        .eq('collection_id', request.params.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ data: data ?? [] });
    },
  );

  // ── POST /api/kb/collections/:id/documents  (multipart upload) ────────────
  fastify.post<{ Params: { id: string } }>(
    '/collections/:id/documents',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db           = getServerClient();
      const tenantId     = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id: collectionId } = request.params;

      // @fastify/multipart adds request.file()
      const part = await (request as unknown as { file(): Promise<{
        filename: string;
        mimetype: string;
        file: AsyncIterable<Buffer>;
      } | null> }).file();

      if (!part) return reply.status(400).send({ error: 'No file in request' });

      const mimeType = part.mimetype.toLowerCase();
      const fileType = ALLOWED_MIME[mimeType];
      if (!fileType) {
        return reply.status(400).send({
          error: `Unsupported type "${mimeType}". Accepted: PDF, DOCX, TXT, MD, JPG, PNG, WEBP`,
        });
      }

      // Read into buffer
      const buffers: Buffer[] = [];
      for await (const chunk of part.file) buffers.push(chunk);
      const fileBuffer = Buffer.concat(buffers);

      if (fileBuffer.length > MAX_FILE_BYTES) {
        return reply.status(413).send({ error: 'File exceeds 50 MB limit' });
      }
      if (fileBuffer.length === 0) {
        return reply.status(400).send({ error: 'File is empty' });
      }

      await ensureBucket(db);

      // Create DB record first (need the UUID for the storage path)
      const { data: docRec, error: insertErr } = await db
        .from('kb_documents')
        .insert({
          tenant_id:     tenantId,
          collection_id: collectionId,
          name:          part.filename,
          file_type:     fileType,
          mime_type:     mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
          storage_path:  '_pending_',
          file_size:     fileBuffer.length,
          status:        'pending',
        })
        .select('id')
        .single();

      if (insertErr || !docRec) {
        return reply.status(500).send({ error: insertErr?.message ?? 'DB insert failed' });
      }

      // Upload to Storage
      const storagePath = `${tenantId}/${collectionId}/${docRec.id}/${part.filename}`;
      const { error: uploadErr } = await db.storage
        .from('kb-documents')
        .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

      if (uploadErr) {
        await db.from('kb_documents').delete().eq('id', docRec.id);
        return reply.status(500).send({ error: `Upload failed: ${uploadErr.message}` });
      }

      // Patch real storage path
      await db.from('kb_documents')
        .update({ storage_path: storagePath })
        .eq('id', docRec.id);

      // Fire-and-forget processing
      setImmediate(() => { void processDocument(docRec.id); });

      return reply.status(202).send({ data: { id: docRec.id, status: 'pending' } });
    },
  );

  // ── GET /api/kb/documents/:docId  (status polling) ────────────────────────
  fastify.get<{ Params: { docId: string } }>(
    '/documents/:docId',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { data, error } = await db
        .from('kb_documents')
        .select('id, name, file_type, file_size, status, error_message, chunk_count, created_at, updated_at')
        .eq('id', request.params.docId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) return reply.status(404).send({ error: 'Document not found' });
      return reply.send({ data });
    },
  );

  // ── DELETE /api/kb/documents/:docId ───────────────────────────────────────
  fastify.delete<{ Params: { docId: string } }>(
    '/documents/:docId',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      // Fetch storage path before deletion
      const { data: doc } = await db
        .from('kb_documents')
        .select('storage_path')
        .eq('id', request.params.docId)
        .eq('tenant_id', tenantId)
        .single();

      // Remove from Storage (best-effort, don't block on failure)
      if (doc?.storage_path && doc.storage_path !== '_pending_') {
        void db.storage.from('kb-documents').remove([doc.storage_path as string]);
      }

      // Delete DB record — cascades to knowledge_base via source_document_id FK
      const { error } = await db
        .from('kb_documents')
        .delete()
        .eq('id', request.params.docId)
        .eq('tenant_id', tenantId);

      if (error) return reply.status(500).send({ error: error.message });
      return reply.status(204).send();
    },
  );
}
