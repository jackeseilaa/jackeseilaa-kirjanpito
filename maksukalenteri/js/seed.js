import { db } from './firebase.js';
import {
  collection, doc, setDoc, addDoc, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── SEED DATA ─────────────────────────────────────────────────────────────────

const TAKSITULOT_SEED = [
  { kuukausi: '2026-05', era1_pvm: '2026-05-03', era1_summa: 1200, era2_pvm: '2026-05-18', era2_summa: 1220 },
  { kuukausi: '2026-06', era1_pvm: '2026-06-03', era1_summa: 484,  era2_pvm: '2026-06-18', era2_summa: 484 },
  { kuukausi: '2026-07', era1_pvm: '2026-07-03', era1_summa: 1210, era2_pvm: '2026-07-18', era2_summa: 1210 },
  { kuukausi: '2026-08', era1_pvm: '2026-08-03', era1_summa: 1936, era2_pvm: '2026-08-18', era2_summa: 1936 },
  { kuukausi: '2026-09', era1_pvm: '2026-09-03', era1_summa: 1936, era2_pvm: '2026-09-18', era2_summa: 1936 },
  { kuukausi: '2026-10', era1_pvm: '2026-10-03', era1_summa: 1573, era2_pvm: '2026-10-18', era2_summa: 1573 },
  { kuukausi: '2026-11', era1_pvm: '2026-11-03', era1_summa: 2299, era2_pvm: '2026-11-18', era2_summa: 2299 },
  { kuukausi: '2026-12', era1_pvm: '2026-12-03', era1_summa: 1452, era2_pvm: '2026-12-18', era2_summa: 1452 },
];

// Kiinteät kuukausitulot touko-joulukuu
const KUUKAUDET_SEED = ['05','06','07','08','09','10','11','12'];

function kiinteatTulot() {
  const tulot = [];
  for (const kk of KUUKAUDET_SEED) {
    tulot.push({
      pvm: `2026-${kk}-01`, nimi: 'Eläke', summa: 654,
      tyyppi: 'TULO', kategoria: 'Eläke', status: 'Tuleva',
      prioriteetti: 'Tulo', kenelle: '', huomio: '', maksettu_pvm: null
    });
    tulot.push({
      pvm: `2026-${kk}-02`, nimi: 'Vuokra', summa: 620,
      tyyppi: 'TULO', kategoria: 'Vuokra', status: 'Tuleva',
      prioriteetti: 'Tulo', kenelle: '', huomio: '', maksettu_pvm: null
    });
  }
  return tulot;
}

// Taksitulot maksut-kollektioon
function taksitulotMaksut() {
  const maksut = [];
  for (const t of TAKSITULOT_SEED) {
    const [y1, m1, d1] = t.era1_pvm.split('-');
    const kkNimi = ['', 'Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
                    'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'][Number(m1)];
    maksut.push({
      pvm: t.era1_pvm,
      nimi: `Taksitulo ${kkNimi} erä 1 (3.pv)`,
      summa: t.era1_summa, tyyppi: 'TULO', kategoria: 'Taksitulo',
      status: 'Tuleva', prioriteetti: 'Tulo', kenelle: '', huomio: '', maksettu_pvm: null
    });
    maksut.push({
      pvm: t.era2_pvm,
      nimi: `Taksitulo ${kkNimi} erä 2 (18.pv)`,
      summa: t.era2_summa, tyyppi: 'TULO', kategoria: 'Taksitulo',
      status: 'Tuleva', prioriteetti: 'Tulo', kenelle: '', huomio: '', maksettu_pvm: null
    });
  }
  return maksut;
}

const KRIITTISET_SEED = [
  { pvm: '2026-04-27', nimi: 'YEL erä 12/2025', summa: 76.17, tyyppi: 'MENO', kategoria: 'YEL', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'ETK', huomio: 'Erä 12/2025' },
  { pvm: '2026-04-28', nimi: 'YEL erä 10/2025', summa: 78.62, tyyppi: 'MENO', kategoria: 'YEL', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'ETK', huomio: 'Erä 10/2025' },
  { pvm: '2026-04-29', nimi: 'ALV J Sailing erä 1/4', summa: 435.00, tyyppi: 'MENO', kategoria: 'ALV', status: 'KRIITTINEN', prioriteetti: 'PAKKO', kenelle: 'Verohallinto', huomio: 'VIIMEINEN 30.4! Erä 1/4' },
  { pvm: '2026-04-29', nimi: 'Elisa 29239835 erä 1/1', summa: 52.73, tyyppi: 'MENO', kategoria: 'Lasku', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'Elisa', huomio: 'Viitenro 29239835' },
  { pvm: '2026-04-30', nimi: 'YEL huhtikuu 2026', summa: 382.84, tyyppi: 'MENO', kategoria: 'YEL', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'ETK', huomio: 'Huhtikuu 2026' },
  { pvm: '2026-05-03', nimi: 'OmaSP tammi-asuntolaina RÄSTI', summa: 551.00, tyyppi: 'MENO', kategoria: 'Laina', status: 'KRIITTINEN', prioriteetti: 'PAKKO', kenelle: 'OmaSP', huomio: 'Tammikuu 2026 rästi' },
  { pvm: '2026-05-03', nimi: 'OmaSP tammi-muu laina RÄSTI', summa: 803.00, tyyppi: 'MENO', kategoria: 'Laina', status: 'KRIITTINEN', prioriteetti: 'PAKKO', kenelle: 'OmaSP', huomio: 'Tammikuu 2026 rästi' },
  { pvm: '2026-05-03', nimi: 'OmaSP touko-asuntolaina', summa: 551.00, tyyppi: 'MENO', kategoria: 'Laina', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'OmaSP', huomio: 'Toukokuu 2026' },
  { pvm: '2026-05-03', nimi: 'OmaSP touko-muu laina', summa: 803.00, tyyppi: 'MENO', kategoria: 'Laina', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'OmaSP', huomio: 'Toukokuu 2026' },
  { pvm: '2026-05-04', nimi: 'Elisa 29239835 lasku 90494112014', summa: 42.35, tyyppi: 'MENO', kategoria: 'Lasku', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'Elisa', huomio: 'Lasku 90494112014' },
  { pvm: '2026-05-05', nimi: 'Pantaenius venevakuutus', summa: 1291.00, tyyppi: 'MENO', kategoria: 'Vakuutus', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'Pantaenius', huomio: '' },
  { pvm: '2026-05-11', nimi: 'Elisa 29303502 erä 1/6', summa: 38.38, tyyppi: 'MENO', kategoria: 'Lasku', status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: 'Elisa', huomio: 'Erä 1/6, viitenro 29303502' },
  { pvm: '2026-05-11', nimi: 'Intrum YEL 49666293', summa: 495.71, tyyppi: 'MENO', kategoria: 'Perintä', status: 'Intrumilla', prioriteetti: 'PAKKO', kenelle: 'Intrum', huomio: 'Viite: 210 04966 62930 30014' },
  { pvm: '2026-05-25', nimi: 'Intrum YEL 49803717', summa: 476.10, tyyppi: 'MENO', kategoria: 'Perintä', status: 'Intrumilla', prioriteetti: 'PAKKO', kenelle: 'Intrum', huomio: 'Viite: 210 04980 37170 30010' },
];

// Toistuvat lainaerät kesäkuu-joulukuu
function toistuvat() {
  const lista = [];
  const loanKuukaudet = ['06','07','08','09','10','11','12'];
  for (const kk of loanKuukaudet) {
    lista.push({
      pvm: `2026-${kk}-03`,
      nimi: `OmaSP asuntolaina ${kk}/2026`, summa: 551.00,
      tyyppi: 'MENO', kategoria: 'Laina', status: 'Tuleva',
      prioriteetti: 'PAKKO', kenelle: 'OmaSP', huomio: '', maksettu_pvm: null
    });
    lista.push({
      pvm: `2026-${kk}-03`,
      nimi: `OmaSP muu laina ${kk}/2026`, summa: 803.00,
      tyyppi: 'MENO', kategoria: 'Laina', status: 'Tuleva',
      prioriteetti: 'PAKKO', kenelle: 'OmaSP', huomio: '', maksettu_pvm: null
    });
  }
  // Elisa kuukausittain
  const elisaKuukaudet = ['06','07','08','09','10'];
  for (let i = 0; i < elisaKuukaudet.length; i++) {
    lista.push({
      pvm: `2026-${elisaKuukaudet[i]}-11`,
      nimi: `Elisa 29303502 erä ${i + 2}/6`, summa: 38.38,
      tyyppi: 'MENO', kategoria: 'Lasku', status: 'Tuleva',
      prioriteetti: 'PAKKO', kenelle: 'Elisa', huomio: `Erä ${i + 2}/6`, maksettu_pvm: null
    });
  }
  return lista;
}

export async function runSeed() {
  try {
    // Tarkista onko seed jo tehty
    const snap = await getDocs(collection(db, 'maksut'));
    if (!snap.empty) {
      console.log('Seed jo tehty, ohitetaan.');
      return false;
    }

    console.log('Aloitetaan seed...');

    // Asetukset
    await setDoc(doc(db, 'asetukset', 'jarmo'), {
      kassasaldo: 500.00,
      saldo_paivitetty: '2026-04-21',
      kayttaja: 'jarmo',
    });

    // Taksitulot-kollekkio
    for (const t of TAKSITULOT_SEED) {
      await setDoc(doc(db, 'taksitulot', t.kuukausi), {
        ...t,
        yhteensa: t.era1_summa + t.era2_summa,
      });
    }

    // Kaikki maksut yhteen
    const kaikki = [
      ...KRIITTISET_SEED,
      ...taksitulotMaksut(),
      ...kiinteatTulot(),
      ...toistuvat(),
    ].map(m => ({
      ...m,
      maksettu_pvm: m.maksettu_pvm ?? null,
      luotu: serverTimestamp(),
      paivitetty: serverTimestamp(),
    }));

    for (const m of kaikki) {
      await addDoc(collection(db, 'maksut'), m);
    }

    console.log(`Seed valmis: ${kaikki.length} maksua lisätty.`);
    return true;
  } catch (err) {
    console.error('Seed epäonnistui:', err);
    throw err;
  }
}
