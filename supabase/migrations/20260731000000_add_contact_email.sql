-- Add contact_email to tenants if not already present
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email text;
