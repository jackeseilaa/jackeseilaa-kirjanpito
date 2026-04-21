import { db } from './firebase.js';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, getDoc, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── COLLECTIONS ──────────────────────────────────────────────────────────────

export function kuunteleMaksut(callback) {
  const q = query(collection(db, 'maksut'), orderBy('pvm', 'asc'));
  return onSnapshot(q, snap => {
    const maksut = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(maksut);
  }, err => console.error('Maksut snapshot error:', err));
}

export function kuunteleAsetukset(callback) {
  return onSnapshot(doc(db, 'asetukset', 'jarmo'), snap => {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback({ kassasaldo: 0, saldo_paivitetty: today(), kayttaja: 'jarmo' });
    }
  });
}

export function kuunteleTaksitulot(callback) {
  const q = query(collection(db, 'taksitulot'), orderBy('kuukausi', 'asc'));
  return onSnapshot(q, snap => {
    const tulot = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(tulot);
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function lisaaMaksu(data) {
  const doc_data = {
    ...data,
    luotu: serverTimestamp(),
    paivitetty: serverTimestamp(),
  };
  return addDoc(collection(db, 'maksut'), doc_data);
}

export async function paivitaMaksu(id, data) {
  return updateDoc(doc(db, 'maksut', id), {
    ...data,
    paivitetty: serverTimestamp(),
  });
}

export async function poistaMaksu(id) {
  return deleteDoc(doc(db, 'maksut', id));
}

export async function kuittaaMaksetuksi(id) {
  return updateDoc(doc(db, 'maksut', id), {
    status: 'Maksettu',
    maksettu_pvm: today(),
    paivitetty: serverTimestamp(),
  });
}

export async function peruKuittaus(id, vanhaTila) {
  return updateDoc(doc(db, 'maksut', id), {
    status: vanhaTila || 'Avoinna',
    maksettu_pvm: null,
    paivitetty: serverTimestamp(),
  });
}

export async function paivitaSaldo(summa) {
  return setDoc(doc(db, 'asetukset', 'jarmo'), {
    kassasaldo: Number(summa),
    saldo_paivitetty: today(),
    kayttaja: 'jarmo',
  }, { merge: true });
}

export async function paivitaTaksitulo(kuukausi, data) {
  const yhteensa = (Number(data.era1_summa) || 0) + (Number(data.era2_summa) || 0);
  return setDoc(doc(db, 'taksitulot', kuukausi), {
    kuukausi,
    ...data,
    yhteensa,
  }, { merge: true });
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function parsePvm(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function formatPvm(iso) {
  if (!iso) return '';
  const d = parsePvm(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function formatEur(n) {
  return Number(n || 0).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
