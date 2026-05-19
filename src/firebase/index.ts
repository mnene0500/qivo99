'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { firebaseConfig } from './config';
import { useUser } from './auth/use-user';
import { useCollection } from './firestore/use-collection';
import { useDoc } from './firestore/use-doc';
import { useMemo } from 'react';

/**
 * Idempotent initialization of Firebase services.
 * Returns null for services if the configuration is missing to prevent hard crashes.
 */
export function initializeFirebase() {
  const apiKey = firebaseConfig.apiKey || (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY : undefined);
  const isConfigValid = !!(apiKey && apiKey !== 'undefined');
  
  const nullResult = { 
    firebaseApp: null as unknown as FirebaseApp, 
    firestore: null as unknown as Firestore, 
    auth: null as unknown as Auth, 
    database: null as unknown as Database 
  };

  if (!isConfigValid) {
    return nullResult;
  }

  try {
    let app: FirebaseApp;
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    // Some environments (like build time) might allow app init but fail service init
    const firestore = getFirestore(app);
    const auth = getAuth(app);
    const database = getDatabase(app);

    return { firebaseApp: app, firestore, auth, database };
  } catch (err: any) {
    console.warn("[Firebase Init Warning]:", err.message);
    return nullResult;
  }
}

export * from './provider';
export { FirebaseClientProvider } from './client-provider';

export function useMemoFirebase<T>(factory: () => T, deps: any[]): T {
  return useMemo(factory, deps);
}

export { useUser, useCollection, useDoc };
