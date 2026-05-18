'use client';

import React, { useMemo } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';

/**
 * A client-side provider that initializes Firebase services and provides them to the app.
 * This handles idempotent initialization to ensure services are only created once.
 */
export function FirebaseClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firebaseApp, firestore, auth, database } = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider
      firebaseApp={firebaseApp}
      firestore={firestore}
      auth={auth}
      database={database}
    >
      {children}
    </FirebaseProvider>
  );
}
