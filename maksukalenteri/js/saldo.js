import { formatEur, parsePvm, today } from './maksut.js';

// ── SALDOLASKENTA ─────────────────────────────────────────────────────────────

export function laskeSaldot(maksut, kassasaldo) {
  const avoimet = maksut
    .filter(m => m.status !== 'Maksettu')
    .sort((a, b) => (a.pvm || '').localeCompare(b.pvm || ''));

  let saldo = Number(kassasaldo || 0);
  return avoimet.map(m => {
    if (m.tyyppi === 'TULO') {
      saldo += Number(m.summa || 0);
    } else {
      saldo -= Number(m.summa || 0);
    }
    return {
      ...m,
      saldoJalkeen: saldo,
      saldoWarning: saldo < 0,
      saldoLow: saldo >= 0 && saldo < 200,
    };
  });
}

// Ryhmittele kuukausittain
export function ryhmitaKuukausittain(maksut) {
  const ryhmat = {};
  for (const m of maksut) {
    const kk = m.pvm ? m.pvm.substring(0, 7) : 'tuntematon';
    if (!ryhmat[kk]) ryhmat[kk] = [];
    ryhmat[kk].push(m);
  }
  return ryhmat;
}

// Kriittisin tuleva maksu
export function seuraavaKriittinen(maksut) {
  const td = today();
  const kriittiset = maksut.filter(m =>
    m.status !== 'Maksettu' &&
    m.pvm >= td &&
    (m.prioriteetti === 'PAKKO' || m.status === 'KRIITTINEN' || m.status === 'Intrumilla' || m.status === 'Ropolla')
  );
  if (!kriittiset.length) return null;
  return kriittiset.sort((a, b) => a.pvm.localeCompare(b.pvm))[0];
}

// Kuukausittaiset yhteenvedot
export function laskuKuukausittain(maksut) {
  const ryhmat = {};
  for (const m of maksut) {
    const kk = m.pvm ? m.pvm.substring(0, 7) : 'tuntematon';
    if (!ryhmat[kk]) ryhmat[kk] = { tulot: 0, menot: 0 };
    if (m.tyyppi === 'TULO') {
      ryhmat[kk].tulot += Number(m.summa || 0);
    } else {
      ryhmat[kk].menot += Number(m.summa || 0);
    }
  }
  return ryhmat;
}

// Erääntymisvaroitukset
export function tarkistaEraantyminen(maksut) {
  const td = today();
  const kolmePaivaa = new Date();
  kolmePaivaa.setDate(kolmePaivaa.getDate() + 3);
  const kolmePaivaStr = kolmePaivaa.toISOString().split('T')[0];

  const eraantyvat = maksut.filter(m =>
    m.status !== 'Maksettu' &&
    m.pvm <= kolmePaivaStr &&
    (m.prioriteetti === 'PAKKO' || m.status === 'KRIITTINEN')
  );

  const myohassa = maksut.filter(m =>
    m.status !== 'Maksettu' &&
    m.pvm < td
  );

  return { eraantyvat, myohassa };
}

// Kuukauden yhteenveto
export function kkYhteenveto(maksut, kk) {
  const kkMaksut = maksut.filter(m => m.pvm && m.pvm.startsWith(kk));
  const tulot = kkMaksut.filter(m => m.tyyppi === 'TULO').reduce((s, m) => s + Number(m.summa || 0), 0);
  const menot = kkMaksut.filter(m => m.tyyppi !== 'TULO').reduce((s, m) => s + Number(m.summa || 0), 0);
  return { tulot, menot, netto: tulot - menot };
}
