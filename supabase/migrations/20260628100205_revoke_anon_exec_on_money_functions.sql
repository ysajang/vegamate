REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, credit_tx_type, text, text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_hearts(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_intimacy(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_reserve_spend(uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_daily_hearts(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, integer, credit_tx_type, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_heart(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_reserved_spend(uuid, numeric) FROM anon, authenticated;
