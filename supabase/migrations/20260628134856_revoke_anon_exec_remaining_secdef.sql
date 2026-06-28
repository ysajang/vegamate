REVOKE EXECUTE ON FUNCTION public.get_active_subscription(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_memories(uuid, uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_selfie(uuid, uuid, selfie_trigger_type) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_selfie_by_scene(uuid, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_user_memory(uuid, uuid, text, text, memory_type, double precision, uuid, text) FROM anon, authenticated;
