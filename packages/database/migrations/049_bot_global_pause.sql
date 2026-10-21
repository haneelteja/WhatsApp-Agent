-- Migration 049: Global bot pause flag on bot_configs
-- Allows a tenant to pause ALL auto-replies on a bot without touching individual conversations.
-- When bot_globally_paused = true, the webhook stores incoming messages but skips the AI reply.

alter table bot_configs
  add column if not exists bot_globally_paused boolean not null default false;
