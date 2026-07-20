// src/firebase-client.js
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, getDoc, setDoc, updateDoc, 
  collection, query, orderBy, onSnapshot,
  addDoc, getDocs, where, deleteDoc,
  enableIndexedDbPersistence
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db)
  .catch((err) => {
    console.warn('Firebase persistence error:', err);
  });

console.log('Firebase initialized successfully');

// Export for client-side use
export { 
  db, 
  doc, getDoc, setDoc, updateDoc, 
  collection, query, orderBy, onSnapshot,
  addDoc, getDocs, where, deleteDoc 
};