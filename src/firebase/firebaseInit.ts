// src/firebase/firebaseInit.ts

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore/lite";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";
import { firebaseConfig } from "./firebaseConfig";

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

let servicesPromise: Promise<FirebaseServices> | null = null;

export const getFirebaseServices = (): Promise<FirebaseServices> => {
  if (servicesPromise) {
    return servicesPromise;
  }

  servicesPromise = new Promise((resolve, reject) => {
    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const db = getFirestore(app);
      const storage = getStorage(app);
      const functions = getFunctions(app, "asia-northeast3");
      
      resolve({ app, auth, db, storage, functions });
    } catch (error) {
      console.error("Firebase initialization failed", error);
      reject(error);
    }
  });
  
  return servicesPromise;
};