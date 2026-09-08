-- Add optional media attachment columns to broadcast_messages.
-- media_url: publicly accessible URL (image or document)
-- media_type: 'image' or 'document'

ALTER TABLE broadcast_messages
  ADD COLUMN IF NOT EXISTS media_url  TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'document'));
