"use client"

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const { auth } = initializeFirebase();
    
    if (!auth) {
      setLoading(false);
      setIsInitialized(true);
      return;
    }

    try {
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
        setIsInitialized(true);
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("[useUser] Auth listener failed:", err);
      setLoading(false);
      setIsInitialized(true);
    }
  }, []);

  return { user, loading, isInitialized };
}
