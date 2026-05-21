
"use client"

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * @fileOverview Pure Supabase Auth Hook.
 * Manages user identity exclusively via Supabase.
 */
export function useUser() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // 1. Get initial Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
      setIsInitialized(true);
    });

    // 2. Listen for Auth changes (Sign in, Sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      setLoading(false);
      setIsInitialized(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, isInitialized };
}
