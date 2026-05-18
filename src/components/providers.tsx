'use client';

import React from 'react';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { Toaster } from "@/components/ui/toaster";
import { usePresence } from '@/hooks/use-presence';
import { InstallPrompt } from '@/components/layout/InstallPrompt';

/**
 * Handles global user presence heartbeat.
 */
function PresenceManager({ children }: { children: React.ReactNode }) {
  usePresence();
  return <>{children}</>;
}

/**
 * Root providers wrapper for the application.
 * Composes Firebase, Presence, UI notifications, and PWA prompts.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseClientProvider>
      <FirebaseErrorListener />
      <PresenceManager>
        <div className="native-page-transition flex-1 flex flex-col">
          {children}
        </div>
        <Toaster />
        <InstallPrompt />
      </PresenceManager>
    </FirebaseClientProvider>
  );
}
