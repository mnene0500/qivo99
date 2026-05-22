# QIVO Production SQL (Secure with RLS)

Run this entire script in your **Supabase SQL Editor** to initialize the economy, gifting, and calling systems. This script handles tables, real-time settings, and Row Level Security (RLS) with corrected policies for user onboarding.

```sql
-- 1. SETUP HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.increment_diamonds(user_id UUID, amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.balances (user_id, diamonds)
  VALUES (user_id, amount)
  ON CONFLICT (user_id)
  DO UPDATE SET diamonds = balances.diamonds + amount, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RESET TABLES
DROP TABLE IF EXISTS public.users, public.balances, public.coin_history, public.diamond_history, public.processed_payments, public.chats, public.messages, public.agencies, public.withdrawals, public.reports CASCADE;

-- 3. CREATE CORE TABLES
CREATE TABLE public.users (
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

CREATE TABLE public.balances (
  user_id UUID PRIMARY KEY REFERENCES public.users(uid) ON DELETE CASCADE,
  coins BIGINT DEFAULT 0,
  diamonds NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.coin_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  amount BIGINT,
  type TEXT, 
  description TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE public.diamond_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  amount NUMERIC,
  type TEXT,
  description TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE public.processed_payments (
  order_tracking_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  amount NUMERIC,
  coins BIGINT,
  payment_method TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE public.chats (
  id TEXT PRIMARY KEY,
  participant_ids UUID[] NOT NULL,
  last_message TEXT,
  last_message_at BIGINT,
  cleared_at JSONB DEFAULT '{}'::jsonb,
  last_seen_at JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE public.messages (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  text TEXT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  is_gift BOOLEAN DEFAULT FALSE
);

CREATE TABLE public.agencies (
  code TEXT PRIMARY KEY,
  agent_uid UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  agency_id TEXT REFERENCES public.agencies(code) ON DELETE CASCADE,
  diamonds NUMERIC,
  amount_kes NUMERIC,
  status TEXT DEFAULT 'pending',
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE public.reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  reported_id UUID REFERENCES public.users(uid) ON DELETE CASCADE,
  reason TEXT,
  description TEXT,
  proof_photo_url TEXT,
  status TEXT DEFAULT 'pending',
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- 4. ENABLE REALTIME REPLICATION
ALTER PUBLICATION supabase_realtime ADD TABLE public.balances, public.coin_history, public.diamond_history, public.chats, public.messages, public.users, public.withdrawals, public.reports;

-- 5. ENABLE ROW LEVEL SECURITY (RLS)
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

-- 6. DEFINE SECURITY POLICIES

-- USERS
CREATE POLICY "Public profiles are viewable by everyone" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = uid);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = uid);

-- BALANCES
CREATE POLICY "Users can view own balance" ON public.balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own balance" ON public.balances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own balance" ON public.balances FOR UPDATE USING (auth.uid() = user_id);

-- LEDGERS
CREATE POLICY "Users can view own coin history" ON public.coin_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own coin history" ON public.coin_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own diamond history" ON public.diamond_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own diamond history" ON public.diamond_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- CHATS & MESSAGES
CREATE POLICY "Participants can view chats" ON public.chats FOR SELECT USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "Participants can update chats" ON public.chats FOR UPDATE USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "Participants can insert chats" ON public.chats FOR INSERT WITH CHECK (auth.uid() = ANY(participant_ids));

CREATE POLICY "Participants can view messages" ON public.messages FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.chats WHERE id = chat_id AND auth.uid() = ANY(participant_ids)
));
CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- FINANCIALS
CREATE POLICY "Users can view own withdrawals" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own payments" ON public.processed_payments FOR SELECT USING (auth.uid() = user_id);

-- 7. GRANT PERMISSIONS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```
