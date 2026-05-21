"use client"
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/firebase/auth/use-user'

/**
 * Hook to manage user presence via Supabase Channels.
 */
export function usePresence() {
  const { user } = useUser()

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase.channel('online-users', {
      config: { presence: { key: user.id } }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        // Sync complete
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => { channel.unsubscribe() }
  }, [user?.id])
}

export function useUserPresence(userId?: string) {
  const [presence, setPresence] = useState({ state: 'offline' });

  useEffect(() => {
    if (!userId) return;

    // For a prototype, we'll check if the user tracked presence in the last 2 minutes
    const fetchPresence = async () => {
      const channel = supabase.channel('online-users');
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        if (state[userId]) {
          setPresence({ state: 'online' });
        } else {
          setPresence({ state: 'offline' });
        }
      }).subscribe();
      
      return () => channel.unsubscribe();
    }

    fetchPresence();
  }, [userId]);

  return presence;
}
