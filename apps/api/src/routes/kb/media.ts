import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth } from '../../middleware/auth.js';
import { invalidateKBCache } from '../../services/kb/lookup.js';

const BUCKET = 'kb-media';
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME: Record<string, 'image' | 'document'> = {
  'image/jpeg':       'image',
  'image/jpg':        'image',
  'image/png':        'image',
  'image/webp':       'image',
  'image/gif':        'image',
  'application/pdf':  'document',
};

async function ensurePublicBucket(db: ReturnType<typeof getServerClient>): Promise<void> {
  const { error } = await db.storage.createBucket(BUCKET, {
    public:           true,   // WhatsApp fetches direct public URL — must be public
    fileSizeLimit:    MAX_FILE_BYTES,
    allowedMimeTypes: Object.keys(ALLOWED_MIME),
  });
  if (error && !error.message.toLowerCase().includes('already exist')) {
    console.warn('[KB Media] Bucket init:', error.message);
  }
}

export async function kbMediaRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/kb/media — list all active media attachments for tenant ─────────
  fastify.get<{ Querystring: { collection_id?: string } }>(
    '/media',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      let q = db
        .from('kb_media_attachments')
        .select('id, name, description, file_type, mime_type, original_filename, public_url, file_size, send_count, active, collection_id, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (request.query.collection_id) {
        q = q.eq('collection_id', request.query.collection_id);
      }

      const { data, error } = await q;
      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ data: data ?? [] });
    },
  );

  // ── POST /api/kb/media/upload — multipart upload to public Supabase Storage ──
  fastify.post<{ Querystring: { collection_id?: string; name?: string; description?: string } }>(
    '/media/upload',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      await ensurePublicBucket(db);

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
          error: `Unsupported type "${mimeType}". Accepted: JPEG, PNG, WEBP, GIF, PDF`,
        });
      }

      // Collect file buffer
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of part.file) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_FILE_BYTES) {
          return reply.status(413).send({ error: `File too large. Max ${MAX_FILE_BYTES / 1024 / 1024} MB` });
        }
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      const collectionId  = request.query.collection_id ?? null;
      const displayName   = (request.query.name ?? part.filename).trim();
      const description   = request.query.description?.trim() ?? null;
      const safeFilename  = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const attachmentId  = crypto.randomUUID();
      const storagePath   = `${tenantId}/${attachmentId}/${safeFilename}`;

      // Upload to public Supabase Storage
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

      if (uploadError) {
        fastify.log.error({ uploadError }, '[KB Media] Storage upload failed');
        return reply.status(500).send({ error: 'File upload failed' });
      }

      // Get public URL
      const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Persist record
      const { data: attachment, error: dbError } = await db
        .from('kb_media_attachments')
        .insert({
          id:                attachmentId,
          tenant_id:         tenantId,
          collection_id:     collectionId,
          name:              displayName,
          description,
          file_type:         fileType,
          mime_type:         mimeType,
          original_filename: part.filename,
          storage_path:      storagePath,
          public_url:        publicUrl,
          file_size:         totalBytes,
        })
        .select()
        .single();

      if (dbError) {
        // Clean up storage on DB failure
        void db.storage.from(BUCKET).remove([storagePath]);
        return reply.status(500).send({ error: dbError.message });
      }

      void invalidateKBCache(tenantId);
      return reply.status(201).send({ data: attachment });
    },
  );

  // ── PATCH /api/kb/media/:id — update name, description, collection, active ───
  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; description?: string; collection_id?: string | null; active?: boolean };
  }>(
    '/media/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const updates: Record<string, unknown> = {};
      if (request.body.name        !== undefined) updates['name']          = request.body.name.trim();
      if (request.body.description !== undefined) updates['description']   = request.body.description;
      if (request.body.collection_id !== undefined) updates['collection_id'] = request.body.collection_id;
      if (request.body.active      !== undefined) updates['active']        = request.body.active;

      const { data, error } = await db
        .from('kb_media_attachments')
        .update(updates)
        .eq('id', request.params.id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ data });
    },
  );

  // ── DELETE /api/kb/media/:id — delete attachment + storage file ──────────────
  fastify.delete<{ Params: { id: string } }>(
    '/media/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = (request as { tenantId?: string }).tenantId;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: attachment } = await db
        .from('kb_media_attachments')
        .select('storage_path')
        .eq('id', request.params.id)
        .eq('tenant_id', tenantId)
        .single();

      if (!attachment) return reply.status(404).send({ error: 'Not found' });

      const { error } = await db
        .from('kb_media_attachments')
        .delete()
        .eq('id', request.params.id)
        .eq('tenant_id', tenantId);

      if (error) return reply.status(500).send({ error: error.message });

      void db.storage.from(BUCKET).remove([(attachment as { storage_path: string }).storage_path]);
      return reply.status(204).send();
    },
  );
}
