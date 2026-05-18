import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { firebaseConfig } from './config';
import { useUser } from './auth/use-user';

export function initializeFirebase() {
  let app: FirebaseApp;
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  
  const firestore = getFirestore(app);
  const auth = getAuth(app);
  const database = getDatabase(app);

  return { firebaseApp: app, firestore, auth, database };
}

export function useFirestore() {
  return initializeFirebase().firestore;
}

export function useAuth() {
  return initializeFirebase().auth;
}

export function useDatabase() {
  return initializeFirebase().database;
}

export { useUser };
