
# QIVO Production SQL (Run in SQL Editor)

```sql
-- 1. SETUP ATOMIC HELPERS (Hardened for Production)
CREATE OR REPLACE FUNCTION public.increment_diamonds(user_id UUID, amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.balances (user_id, diamonds)
  VALUES (user_id, amount)
  ON CONFLICT (user_id)
  DO UPDATE SET diamonds = COALESCE(balances.diamonds, 0) + amount, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_coins(user_id UUID, amount BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.balances (user_id, coins)
  VALUES (user_id, amount)
  ON CONFLICT (user_id)
  DO UPDATE SET coins = COALESCE(balances.coins, 0) + amount, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. CREATE CORE TABLES (Idempotent)
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pending_payments (
  order_id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.processed_payments (
  order_tracking_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC,
  coins BIGINT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
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

CREATE TABLE IF NOT EXISTS public.chats (
  id TEXT PRIMARY KEY,
  participant_ids UUID[] NOT NULL,
  last_message TEXT,
  last_message_at BIGINT,
  cleared_at JSONB DEFAULT '{}'::jsonb,
  last_seen_at JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  text TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  is_gift BOOLEAN DEFAULT FALSE
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

-- 3. ENABLE REALTIME SAFELY
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 'SET TABLE' replaces the list, avoiding Error 42710
ALTER PUBLICATION supabase_realtime SET TABLE 
  public.balances, 
  public.coin_history, 
  public.diamond_history, 
  public.chats, 
  public.messages, 
  public.users, 
  public.withdrawals, 
  public.reports,
  public.pending_payments;

-- 4. ENABLE RLS & POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 5. CREATE POLICIES
DROP POLICY IF EXISTS "Users can manage own profile" ON public.users;
CREATE POLICY "Users can manage own profile" ON public.users 
FOR ALL USING (auth.uid() = uid) WITH CHECK (auth.uid() = uid);

DROP POLICY IF EXISTS "Public profiles are viewable" ON public.users;
CREATE POLICY "Public profiles are viewable" ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users view own balance" ON public.balances;
CREATE POLICY "Users view own balance" ON public.balances FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Participants can view chats" ON public.chats;
CREATE POLICY "Participants can view chats" ON public.chats FOR SELECT USING (auth.uid() = ANY(participant_ids));

-- 6. GRANT PERMISSIONS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```
