-- Reduce signup heart bonus 35 -> 20.
-- Rationale (2026-07-10): 35 hearts let a first session run ~35 messages
-- before any monetization pressure. Field data: heavy first sessions burn the
-- whole pool without ever seeing the gift surface until the very end. 20 still
-- covers a real first session (median observed first session: 6-10 messages)
-- while bringing the zero-state (the visible beg + gift card) into session 1-2
-- for engaged users. Existing balances are untouched.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- First-session immersion bonus (35 -> 20, see migration note above).
  INSERT INTO public.user_hearts (user_id, balance, total_earned)
  VALUES (new.id, 20, 20);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
