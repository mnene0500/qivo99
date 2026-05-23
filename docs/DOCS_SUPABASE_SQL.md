
# QIVO Production SQL (Run in SQL Editor)

This script sets up all tables and the **CONSOLIDATED** storage RLS policies for the single 'photos' bucket.

```sql
-- 1. SETUP ATOMIC HELPERS
CREATE OR REPLACE FUNCTION public.increment_diamonds(user_id UUID, amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.balances (user_id, diamonds)
  VALUES (user_id, amount)
  ON CONFLICT (user_id)
  DO UPDATE SET diamonds = balances.diamonds + amount, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_coins(user_uid UUID, amount BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.balances (user_id, coins)
  VALUES (user_uid, amount)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = balances.coins + amount, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. CREATE CORE TABLES
-- [Run table creation from earlier docs if starting from scratch]

-- 3. ENABLE RLS FOR 'photos' STORAGE BUCKET
-- Public read access for all photos
CREATE POLICY "Public Read Photos" ON storage.objects FOR SELECT USING (bucket_id = 'photos');

-- Avatars: Only owner can upload/update their own avatar
CREATE POLICY "Users can manage own avatar" ON storage.objects FOR ALL USING (
  bucket_id = 'photos' AND (storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid()::text || '.jpg')
);

-- Posts: Only owner can manage photos in their own posts folder
CREATE POLICY "Users can manage own posts" ON storage.objects FOR ALL USING (
  bucket_id = 'photos' AND (storage.foldername(name))[1] = 'posts' AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 4. REPORT SYSTEM RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE uid = auth.uid() AND is_admin = true));
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE USING (EXISTS (SELECT 1 FROM public.users WHERE uid = auth.uid() AND is_admin = true));

-- 5. RE-ENABLE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.balances, public.coin_history, public.diamond_history, public.chats, public.messages, public.users, public.reports;
```
