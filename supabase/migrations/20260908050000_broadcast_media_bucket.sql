-- Create public storage bucket for broadcast media (images + PDFs).
-- Max 10 MB per file. WhatsApp fetches the public URL directly.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'broadcast-media',
  'broadcast-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload files to the bucket
DROP POLICY IF EXISTS "broadcast_media_insert" ON storage.objects;
CREATE POLICY "broadcast_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'broadcast-media');

-- Anyone (including WhatsApp servers) can read/download files
DROP POLICY IF EXISTS "broadcast_media_select" ON storage.objects;
CREATE POLICY "broadcast_media_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'broadcast-media');

-- Authenticated users can delete their own uploads
DROP POLICY IF EXISTS "broadcast_media_delete" ON storage.objects;
CREATE POLICY "broadcast_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'broadcast-media' AND auth.uid() IS NOT NULL);
