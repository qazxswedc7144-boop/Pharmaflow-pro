import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import firebaseAppletConfig from "../../firebase-applet-config.json";

const envDbUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_FIREBASE_DATABASE_URL : undefined;

const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  ...(envDbUrl && { databaseURL: envDbUrl })
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0]!;
let rtdbInstance: any = null;
try {
  const dbUrl = envDbUrl || (firebaseAppletConfig.projectId ? `https://${firebaseAppletConfig.projectId}-default-rtdb.firebaseio.com` : undefined);
  if (dbUrl) {
    rtdbInstance = getDatabase(app, dbUrl);
  } else {
    rtdbInstance = getDatabase(app);
  }
} catch (err) {
  console.warn("Realtime Database initialization skipped:", err);
}

const rtdb = rtdbInstance;
const db = firebaseAppletConfig.firestoreDatabaseId && firebaseAppletConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(app, firebaseAppletConfig.firestoreDatabaseId)
  : getFirestore(app);
const auth = getAuth(app);

export enum OperationType {
  GET = "GET",
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE"
}

export const handleFirestoreError = (error: unknown, opType: OperationType, context: string) => {
  console.error(`Firestore ${opType} error in ${context}:`, error);
  throw error;
};

export const loginWithGoogleFirebase = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
};

export { app, rtdb, db, auth };