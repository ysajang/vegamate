-- 012b: Raise signup heart bonus 5 -> 35 for first-session immersion.
-- Rationale: a 5-heart signup hit a paywall after 5 messages, causing early
-- churn before the user could experience the product (character + memory +
-- selfie). 35 lets a new user complete a real first session; day-2+ pressure
-- still comes from the daily-claim schedule (unchanged). Single-source change:
-- only the new-user trigger. Provisional — retune on real-user data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- First-session immersion bonus (was 5). See migration note above.
  INSERT INTO public.user_hearts (user_id, balance, total_earned)
  VALUES (new.id, 35, 35);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
