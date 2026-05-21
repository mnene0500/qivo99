
'use client';

import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { usePresence } from '@/hooks/use-presence';
import { InstallPrompt } from '@/components/layout/InstallPrompt';
import { CallManager } from '@/components/CallManager';

/**
 * Handles global user presence heartbeat via Supabase.
 */
function PresenceManager({ children }: { children: React.ReactNode }) {
  usePresence();
  return <>{children}</>;
}

/**
 * Root providers wrapper for the application.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PresenceManager>
      <div className="native-page-transition flex-1 flex flex-col">
        {children}
      </div>
      <Toaster />
      <InstallPrompt />
      <CallManager />
    </PresenceManager>
  );
}
