import firebase from "firebase/app";
import "firebase/auth";
import "firebase/firestore";

// Helper to safely retrieve Env Vars
const getEnvVar = (key: string): string => {
  // Vite requires variables to be prefixed with VITE_ to be exposed to the client
  const viteKey = `VITE_${key}`;

  // 1. Check import.meta.env (Vite standard)
  if ((import.meta as any).env) {
    // Check for VITE_ prefix first (most common in Vite/Render)
    if ((import.meta as any).env[viteKey]) {
      return (import.meta as any).env[viteKey];
    }
    // Check for non-prefixed (if manually configured in vite.config.js define)
    if ((import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  }

  // 2. Check process.env (Fallback for other build systems or if process is polyfilled with data)
  if (typeof process !== 'undefined' && process.env) {
     if (process.env[viteKey]) return process.env[viteKey];
     if (process.env[key]) return process.env[key];
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
let auth: firebase.auth.Auth | undefined;
let db: firebase.firestore.Firestore | undefined;
let googleProvider: firebase.auth.GoogleAuthProvider | undefined;

try {
    // Check if critical config is present
    if (firebaseConfig.apiKey) {
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
        } else {
            app = firebase.app();
        }
        
        auth = firebase.auth();
        db = firebase.firestore();
        googleProvider = new firebase.auth.GoogleAuthProvider();
    } else {
        console.warn("Firebase config missing. Auth and DB features will be disabled. Ensure VITE_FIREBASE_... environment variables are set.");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

export { auth, db, googleProvider };
export default firebase;
