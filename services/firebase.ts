import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Helper to safely retrieve Env Vars (similar to geminiService)
const getEnvVar = (key: string): string => {
  // 1. Process.env
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  // 2. Vite import.meta.env
  const metaEnv = (import.meta as any).env;
  if (metaEnv) {
    if (metaEnv[`VITE_${key}`]) return metaEnv[`VITE_${key}`];
    if (metaEnv[key]) return metaEnv[key];
  }
  return "";
};

// Configuration object
const firebaseConfig = {
  apiKey: getEnvVar("FIREBASE_API_KEY"),
  authDomain: getEnvVar("FIREBASE_AUTH_DOMAIN"),
  projectId: getEnvVar("FIREBASE_PROJECT_ID"),
  storageBucket: getEnvVar("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnvVar("FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnvVar("FIREBASE_APP_ID")
};

// Initialize Firebase
let app;
let auth;
let db;
let googleProvider;

try {
    // Only initialize if config is present to avoid crashing on empty envs during dev
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        googleProvider = new GoogleAuthProvider();
    } else {
        console.warn("Firebase config missing. Auth and DB features will be disabled.");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

export { auth, db, googleProvider };