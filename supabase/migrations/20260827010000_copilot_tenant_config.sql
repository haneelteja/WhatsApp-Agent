ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS copilot_config jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "instructions": "",
    "allowed_actions": ["add_kb_article", "update_escalation_triggers", "toggle_button_template", "update_system_prompt"]
  }'::jsonb;
