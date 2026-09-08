-- Enforce global uniqueness of phone_number_id for Meta Cloud numbers.
-- Meta assigns a unique phone_number_id per phone number across all businesses,
-- so the same ID cannot legitimately be registered by more than one tenant.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_numbers_meta_phone_id
  ON whatsapp_numbers ((config_json->>'phone_number_id'))
  WHERE provider = 'meta_cloud'
    AND (config_json->>'phone_number_id') IS NOT NULL
    AND (config_json->>'phone_number_id') <> '';
