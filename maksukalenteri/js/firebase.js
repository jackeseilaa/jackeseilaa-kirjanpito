import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB7Dp5_5fN0Iko-4Jn1D2Dp6NNNih63UO0",
  authDomain: "jsailing-f716c.firebaseapp.com",
  projectId: "jsailing-f716c",
  storageBucket: "jsailing-f716c.firebasestorage.app",
  messagingSenderId: "543523103696",
  appId: "1:543523103696:web:439a312efa6aec398a8fd5"
};

export const ALLOWED_EMAIL = "jacke.seilaa@gmail.com";

const firebaseApp = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Offline persistence
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Persistence: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('Persistence: browser not supported');
  }
});
