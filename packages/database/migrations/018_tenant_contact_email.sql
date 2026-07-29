-- Add contact_email to tenants table
alter table tenants add column if not exists contact_email text;
