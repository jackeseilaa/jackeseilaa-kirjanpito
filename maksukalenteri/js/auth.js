import { auth, ALLOWED_EMAIL } from './firebase.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

export function initAuth(onUser, onNoUser) {
  onAuthStateChanged(auth, user => {
    if (user && user.email === ALLOWED_EMAIL) {
      onUser(user);
    } else if (user) {
      // Wrong email — sign out immediately
      signOut(auth);
      onNoUser('Pääsy estetty: ' + user.email);
    } else {
      onNoUser(null);
    }
  });
}

export async function googleSignIn() {
  try {
    const result = await signInWithPopup(auth, provider);
    if (result.user.email !== ALLOWED_EMAIL) {
      await signOut(auth);
      throw new Error('Pääsy estetty. Käytä oikeaa Google-tiliä.');
    }
    return result.user;
  } catch (err) {
    throw err;
  }
}

export function signOutUser() {
  return signOut(auth);
}
