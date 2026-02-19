
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { getFirestore } from "firebase/firestore";

// Helper to safely retrieve Env Vars
const getEnv = (key: string): string => {
  // 1. Check import.meta.env (Vite standard)
  if ((import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
  
  // 2. Check process.env (Fallback / Render Node environment)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }

  return "";
};

// Configuration object with VITE_ prefixes
const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("VITE_FIREBASE_APP_ID")
};

// Initialize Firebase
let app;
let auth: firebase.auth.Auth | undefined;
let db;
let googleProvider;

try {
    // Only initialize if config is present to avoid crashing on empty envs during dev
    if (firebaseConfig.apiKey) {
        // Use compat initialization
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        // Use modular firestore with compat app
        db = getFirestore(app);
        googleProvider = new firebase.auth.GoogleAuthProvider();
    } else {
        console.warn("Firebase config missing. Auth and DB features will be disabled.");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

export { auth, db, googleProvider };
