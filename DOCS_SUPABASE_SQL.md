
# QIVO FINAL HARDENED PRODUCTION SQL (v6)

Run this entire script in the **Supabase SQL Editor** to initialize all tables, roles, and atomic economic functions. This version includes the missing Profile Visits table.

```sql
-- 1. SETUP ATOMIC ECONOMY HELPERS
CREATE OR REPLACE FUNCTION public.increment_diamonds(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.balances (user_id, diamonds)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id)
  DO UPDATE SET diamonds = GREATEST(0, COALESCE(balances.diamonds, 0) + p_amount), updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_coins(p_user_id UUID, p_amount BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.balances (user_id, coins)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = GREATEST(0, COALESCE(balances.coins, 0) + p_amount), updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. CREATE CORE TABLES
CREATE TABLE IF NOT EXISTS public.users (
  uid UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  name TEXT,
  gender TEXT,
  dob DATE,
  country TEXT,
  looking_for TEXT,
  interests TEXT,
  photo_url TEXT,
  additional_photos TEXT[] DEFAULT '{}',
  match_flow_id TEXT UNIQUE,
  education_level TEXT,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  is_coin_seller BOOLEAN DEFAULT FALSE,
  is_agent BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  agency_id TEXT,
  agency_status TEXT, 
  check_in_streak INTEGER DEFAULT 0,
  last_check_in_date TIMESTAMPTZ,
  blocking UUID[] DEFAULT '{}',
  blocked_by UUID[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.balances (
  user_id UUID PRIMARY KEY REFERENCES public.users(uid) ON DELETE CASCADE,
  coins BIGINT DEFAULT 0,
  diamonds NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT non_negative_balances CHECK (coins >= 0 AND diamonds >= 0)
);

CREATE TABLE IF NOT EXISTS public.profile_visits (
  id BIGSERIAL PRIMARY KEY,
  visitor_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  visited_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  count INTEGER DEFAULT 1,
  last_visit_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(visitor_id, visited_id)
);

CREATE TABLE IF NOT EXISTS public.chats (
  id TEXT PRIMARY KEY,
  participant_ids UUID[] NOT NULL,
  last_message TEXT,
  last_message_at BIGINT,
  cleared_at JSONB DEFAULT '{}'::jsonb,
  last_seen_at JSONB DEFAULT '{}'::jsonb,
  last_sender_id UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  text TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  is_gift BOOLEAN DEFAULT FALSE,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS public.coin_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  amount BIGINT,
  type TEXT, 
  description TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE IF NOT EXISTS public.diamond_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  amount NUMERIC,
  type TEXT, 
  description TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE IF NOT EXISTS public.agencies (
  code TEXT PRIMARY KEY,
  agent_uid UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  agency_id TEXT REFERENCES public.agencies(code) ON DELETE CASCADE,
  diamonds NUMERIC,
  amount_kes NUMERIC,
  mpesa_number TEXT,
  status TEXT DEFAULT 'pending', 
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE IF NOT EXISTS public.reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  reported_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  reason TEXT,
  description TEXT,
  proof_photo_url TEXT,
  status TEXT DEFAULT 'pending',
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  caller_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('video', 'voice')),
  status TEXT DEFAULT 'calling',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

-- 4. CREATE POLICIES
DROP POLICY IF EXISTS "Public profiles viewable" ON public.users;
CREATE POLICY "Public profiles viewable" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users manage own profile" ON public.users FOR ALL USING (auth.uid() = uid);
CREATE POLICY "Users view own balance" ON public.balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Participants view chats" ON public.chats FOR SELECT USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "Participants view messages" ON public.messages FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.chats WHERE id = messages.chat_id AND auth.uid() = ANY(participant_ids)
));
CREATE POLICY "Users view own visits" ON public.profile_visits FOR SELECT USING (auth.uid() = visited_id);

-- 5. GRANT PERMISSIONS
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```
