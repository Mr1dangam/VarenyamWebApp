// src/firebase.js
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, getDoc, setDoc, updateDoc, 
  collection, query, orderBy, onSnapshot,
  addDoc, getDocs, where, deleteDoc,
  enableIndexedDbPersistence
} from "firebase/firestore";

// Your Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIZaSyDLeaVd7EEvKMXYprjv5XIpM_3vVUL5aNE",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "varenyam-2a777.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "varenyam-2a777",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "varenyam-2a777.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "158461129642",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:158461129642:web:a72f0fe85bd1c5dc34f1d3",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-KC9BVYC5X6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence (for better performance)
enableIndexedDbPersistence(db)
  .catch((err) => {
    console.warn('Firebase persistence error:', err);
  });

console.log('Firebase initialized successfully');

export { db, doc, getDoc, setDoc, updateDoc, collection, query, orderBy, onSnapshot, addDoc, getDocs, where, deleteDoc };