-- Restrict internal SECURITY DEFINER helpers from being callable as public RPCs.
-- Trigger functions keep working through their triggers; they do not need API EXECUTE.

REVOKE EXECUTE ON FUNCTION public.backfill_usuarios_auth_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_delete_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_update_user_auth_sync() FROM PUBLIC, anon, authenticated;

-- This RPC performs its own admin check with auth.uid(); keep authenticated access
-- for the app's user-management flow, but remove anonymous/public execution.
REVOKE EXECUTE ON FUNCTION public.create_user_admin(text, text, text, text) FROM PUBLIC, anon;
