-- Grant table-level permissions that Supabase requires alongside RLS.
-- Without these, even the service_role gets "permission denied" when RLS is enabled.

GRANT ALL ON TABLE public.interactive_button_templates TO anon;
GRANT ALL ON TABLE public.interactive_button_templates TO authenticated;
GRANT ALL ON TABLE public.interactive_button_templates TO service_role;
