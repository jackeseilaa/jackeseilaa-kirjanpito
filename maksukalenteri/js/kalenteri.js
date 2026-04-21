import { formatEur, parsePvm, today, paivitaTaksitulo } from './maksut.js';
import { laskeSaldot, ryhmitaKuukausittain, seuraavaKriittinen, tarkistaEraantyminen, laskuKuukausittain } from './saldo.js';

// ── GLOBAALI TILA ─────────────────────────────────────────────────────────────
export const state = {
  maksut: [],
  asetukset: { kassasaldo: 0, saldo_paivitetty: '', kayttaja: 'jarmo' },
  taksitulot: [],
  tab: 'kalenteri',
  historia: false,
  filter: 'kaikki', // 'kaikki' | 'pakko' | 'tulot'
  unsubs: [],
  undoQueue: null,
  lightMode: localStorage.getItem('lightMode') === '1',
};

// ── KUUKAUSINIMET ─────────────────────────────────────────────────────────────
const KK_NIMET = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
                  'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'];
const KK_LYHYT = ['Tam','Hel','Maa','Huh','Tou','Kes','Hei','Elo','Syy','Lok','Mar','Jou'];

export function kkNimi(isoKk) {
  // isoKk = "2026-05"
  const parts = isoKk.split('-');
  const m = parseInt(parts[1], 10) - 1;
  return KK_NIMET[m] + ' ' + parts[0];
}

export function pvmLabel(iso) {
  if (!iso) return '';
  const d = parsePvm(iso);
  return { paiva: d.getDate(), kk: KK_LYHYT[d.getMonth()] };
}

// ── PRIORITEETTI/STATUS → CSS-LUOKKA ─────────────────────────────────────────
export function maksuLuokka(m) {
  if (m.status === 'Maksettu') return 'maksettu';
  if (m.status === 'KRIITTINEN') return 'kriittinen';
  if (m.status === 'Intrumilla') return 'intrumilla';
  if (m.status === 'Ropolla') return 'ropolla';
  if (m.tyyppi === 'TULO') return 'tulo';
  if (m.prioriteetti === 'PAKKO') return 'pakko';
  return 'avoinna';
}

export function badgeLuokka(m) {
  if (m.status === 'Maksettu') return 'maksettu';
  if (m.status === 'KRIITTINEN') return 'kriittinen';
  if (m.status === 'Intrumilla') return 'intrumilla';
  if (m.status === 'Ropolla') return 'ropolla';
  if (m.tyyppi === 'TULO') return 'tulo';
  if (m.prioriteetti === 'PAKKO') return 'pakko';
  return 'avoinna';
}

export function badgeTeksti(m) {
  if (m.status === 'Maksettu') return 'Maksettu';
  if (m.status === 'KRIITTINEN') return 'KRIITTINEN';
  if (m.status === 'Intrumilla') return 'Intrum';
  if (m.status === 'Ropolla') return 'Ropo';
  if (m.tyyppi === 'TULO') return 'Tulo';
  if (m.prioriteetti === 'PAKKO') return 'PAKKO';
  return 'Avoinna';
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
export function showToast(msg, type = '', duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, duration);
}

// ── RENDER-DISPATCHERI ────────────────────────────────────────────────────────
export function renderTab() {
  const main = document.getElementById('main-content');
  if (!main) return;
  if (state.tab === 'kalenteri') renderKalenteri(main);
  else if (state.tab === 'taksitulot') renderTaksitulot(main);
  else if (state.tab === 'yhteenveto') renderYhteenveto(main);
  else if (state.tab === 'avoimet') renderAvoimet(main);
}

// ── SALDO WIDGET ──────────────────────────────────────────────────────────────
export function renderSaldoWidget() {
  const el = document.getElementById('saldo-widget');
  if (!el) return;
  const saldo = Number(state.asetukset.kassasaldo || 0);
  const kriit = seuraavaKriittinen(state.maksut);
  const cls = saldo < 0 ? 'danger' : saldo < 200 ? 'warning' : '';
  const amtCls = saldo < 0 ? 'negative' : saldo < 200 ? 'low' : 'positive';

  el.className = 'saldo-widget' + (cls ? ' ' + cls : '');
  el.innerHTML = `
    <div class="saldo-header">
      <span class="saldo-label">Kassassa nyt</span>
      <button class="saldo-edit-btn" onclick="window._editSaldo()">Muokkaa</button>
    </div>
    <div class="saldo-amount ${amtCls}">${formatEur(saldo)} €</div>
    <div class="saldo-footer">
      ${kriit ? `
        <div class="saldo-stat">
          <span class="saldo-stat-label">Seuraava kriittinen</span>
          <span class="saldo-stat-value" style="color:var(--red)">${formatEur(kriit.summa)} € — ${formatPvmShort(kriit.pvm)}</span>
        </div>
      ` : ''}
      <div class="saldo-stat">
        <span class="saldo-stat-label">Päivitetty</span>
        <span class="saldo-stat-value" style="color:var(--text3)">${state.asetukset.saldo_paivitetty || '—'}</span>
      </div>
    </div>
  `;
}

function formatPvmShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)}.${parseInt(m)}.`;
}

// ── KALENTERI-NÄKYMÄ ──────────────────────────────────────────────────────────
export function renderKalenteri(container) {
  const { eraantyvat, myohassa } = tarkistaEraantyminen(state.maksut);
  const saldolliset = laskeSaldot(state.maksut, state.asetukset.kassasaldo);
  let avoimet = saldolliset.filter(m => m.status !== 'Maksettu');
  const maksetut = state.maksut.filter(m => m.status === 'Maksettu');

  // Suodatus
  if (state.filter === 'pakko') {
    avoimet = avoimet.filter(m =>
      m.prioriteetti === 'PAKKO' || m.status === 'KRIITTINEN' ||
      m.status === 'Intrumilla' || m.status === 'Ropolla'
    );
  } else if (state.filter === 'tulot') {
    avoimet = avoimet.filter(m => m.tyyppi === 'TULO');
  }

  const ryhmat = ryhmitaKuukausittain(avoimet);
  const td = today();

  let html = '';

  // Varoitusbanneri
  if (myohassa.length > 0) {
    const myohassSumma = myohassa.reduce((s,m) => s + Number(m.summa||0), 0);
    html += `<div class="alert-banner danger">⚠️ ${myohassa.length} maksua myöhässä — yhteensä ${formatEur(myohassSumma)} €</div>`;
  } else if (eraantyvat.length > 0) {
    html += `<div class="alert-banner warning">⏰ ${eraantyvat.length} kriittistä maksua erääntyy 3 päivän sisällä</div>`;
  }

  // Pikasuodattimet
  const filterBtns = [
    { id: 'kaikki', label: 'Kaikki' },
    { id: 'pakko',  label: '🔴 PAKKO' },
    { id: 'tulot',  label: '🟢 Tulot' },
  ].map(f => `
    <button onclick="window._setFilter('${f.id}')"
      style="border:none;padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;
             background:${state.filter===f.id ? 'var(--accent)' : 'var(--bg3)'};
             color:${state.filter===f.id ? 'white' : 'var(--text2)'};
             border:1px solid ${state.filter===f.id ? 'var(--accent)' : 'var(--border)'};
             transition:all .15s">
      ${f.label}
    </button>`).join('');
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${filterBtns}</div>`;

  // Kuukausiryhmät
  const kkJarjestys = Object.keys(ryhmat).sort();
  if (kkJarjestys.length === 0) {
    html += `<div class="empty-state"><div class="empty-icon">${state.filter !== 'kaikki' ? '🔍' : '✅'}</div>
      <div class="empty-text">${state.filter !== 'kaikki' ? 'Ei maksuja tällä suodattimella' : 'Ei avoimia maksuja'}</div></div>`;
  }

  for (const kk of kkJarjestys) {
    const lista = ryhmat[kk];
    const tulot = lista.filter(m => m.tyyppi === 'TULO').reduce((s, m) => s + Number(m.summa || 0), 0);
    const menot = lista.filter(m => m.tyyppi !== 'TULO').reduce((s, m) => s + Number(m.summa || 0), 0);
    const netto = tulot - menot;
    html += `
      <div class="kk-header">
        <span class="kk-title">${kkNimi(kk)}</span>
        <span class="kk-summary">
          <span style="color:var(--green)">+${formatEur(tulot)}</span>
          &nbsp;<span style="color:var(--red)">−${formatEur(menot)}</span>
          &nbsp;<span style="color:${netto>=0?'var(--green)':'var(--red)'}">= ${netto>=0?'+':''}${formatEur(netto)}</span>
        </span>
      </div>
    `;
    for (const m of lista) {
      html += renderMaksuRivi(m, td);
    }
  }

  // Historia-osio
  if (maksetut.length > 0) {
    html += `
      <div class="historia-toggle" onclick="window._toggleHistoria()">
        ${state.historia ? '▲' : '▼'} Historia (${maksetut.length} maksua)
      </div>
    `;
    if (state.historia) {
      const hRyhmat = ryhmitaKuukausittain(maksetut.sort((a,b) => (b.maksettu_pvm||'').localeCompare(a.maksettu_pvm||'')));
      for (const kk of Object.keys(hRyhmat).sort().reverse()) {
        html += `<div class="kk-header"><span class="kk-title" style="opacity:.6">${kkNimi(kk)}</span></div>`;
        for (const m of hRyhmat[kk]) {
          html += renderMaksuRivi(m);
        }
      }
    }
  }

  container.innerHTML = html;
  attachCardActions(container);
  attachSwipeHandlers();
}

// ── MAKSU-RIVI HTML ───────────────────────────────────────────────────────────
function renderMaksuRivi(m, td) {
  const luokka = maksuLuokka(m);
  const badge = badgeLuokka(m);
  const badgeTxt = badgeTeksti(m);
  const { paiva, kk: kkStr } = pvmLabel(m.pvm);
  const summaLuokka = m.tyyppi === 'TULO' ? 'tulo' : 'meno';
  const tday = td || today();
  const isToday = m.pvm === tday;
  const isOverdue = m.status !== 'Maksettu' && m.pvm < tday;
  const etuMerkki = m.tyyppi === 'TULO' ? '+' : '-';

  let saldoHtml = '';
  if (m.saldoJalkeen !== undefined) {
    const sCls = m.saldoWarning ? 'neg' : m.saldoLow ? 'warn' : 'pos';
    saldoHtml = `<div class="maksu-saldo-after ${sCls}">→ ${formatEur(m.saldoJalkeen)} €</div>`;
  }

  const nimiEsc = (m.nimi || '').replace(/"/g, '&quot;');
  const vanhaStatus = m.vanha_status || 'Avoinna';

  const actions = m.status !== 'Maksettu'
    ? `<div class="maksu-actions">
        <button type="button" class="btn-kuittaa"
          data-action="kuittaa" data-id="${m.id}" data-vanha="${m.status}">✓ Maksettu</button>
        <button type="button" class="btn-muokkaa"
          data-action="muokkaa" data-id="${m.id}">✎</button>
        <button type="button" class="btn-danger" style="padding:5px 8px;font-size:11px"
          data-action="poista" data-id="${m.id}" data-nimi="${nimiEsc}">🗑</button>
       </div>`
    : `<div class="maksu-actions">
        <button type="button" class="btn-peru"
          data-action="peru" data-id="${m.id}" data-vanha="${vanhaStatus}">↩ Peru</button>
       </div>`;

  const todayBorder = isToday ? 'box-shadow:0 0 0 2px var(--accent);' : '';
  const pvmStyle = isOverdue ? 'color:var(--red)' : isToday ? 'color:var(--accent)' : '';

  return `
    <div class="maksu-card ${luokka}" data-id="${m.id}" style="${todayBorder}">
      <div class="swipe-hint-right">✓</div>
      <div class="swipe-hint-left">✎</div>
      <div class="maksu-inner">
        <div style="min-width:36px;text-align:center">
          <div class="maksu-pvm" style="${pvmStyle}">${paiva}</div>
          <div class="maksu-pvm-kk">${kkStr}</div>
          ${isToday ? `<div style="font-size:8px;color:var(--accent);font-weight:700;letter-spacing:.5px">TÄNÄÄN</div>` : ''}
          ${isOverdue && m.status !== 'Maksettu' ? `<div style="font-size:8px;color:var(--red);font-weight:700">RÄSTI</div>` : ''}
        </div>
        <div class="maksu-info">
          <div class="maksu-nimi">${m.nimi || '—'}</div>
          <div class="maksu-meta">
            ${m.kenelle ? `<span class="maksu-kenelle">${m.kenelle}</span>` : ''}
            <span class="maksu-badge badge-${badge}">${badgeTxt}</span>
            ${m.huomio ? `<span style="color:var(--text3);font-size:10px">${m.huomio}</span>` : ''}
          </div>
        </div>
        <div class="maksu-right">
          <div class="maksu-summa ${summaLuokka}">${etuMerkki}${formatEur(m.summa)} €</div>
          ${saldoHtml}
        </div>
      </div>
      ${actions}
    </div>
  `;
}

// ── TAKSITULOT-NÄKYMÄ ─────────────────────────────────────────────────────────
export function renderTaksitulot(container) {
  const KK_NIMET_LYHYT = ['','Tam','Hel','Maa','Huh','Tou','Kes','Hei','Elo','Syy','Lok','Mar','Jou'];
  const KK_NIMET_FULL = ['','Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
                          'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'];
  const kuukaudet = ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];

  const tMap = {};
  for (const t of state.taksitulot) tMap[t.kuukausi] = t;

  let yhteensaKaikki = 0;

  let rows = '';
  for (const kk of kuukaudet) {
    const t = tMap[kk] || {};
    const era1 = Number(t.era1_summa || 0);
    const era2 = Number(t.era2_summa || 0);
    const yht = era1 + era2;
    yhteensaKaikki += yht;
    const m = parseInt(kk.split('-')[1]);
    rows += `
      <tr>
        <td style="font-weight:600">${KK_NIMET_FULL[m]}</td>
        <td><input class="taksi-input" type="number" data-kk="${kk}" data-era="1" value="${era1||''}" placeholder="0"></td>
        <td><input class="taksi-input" type="number" data-kk="${kk}" data-era="2" value="${era2||''}" placeholder="0"></td>
        <td class="taksi-total">${formatEur(yht)} €</td>
      </tr>
    `;
  }

  container.innerHTML = `
    <div class="section-header">
      <span class="section-title">Taksitulot 2026</span>
      <span class="section-badge">Yht. ${formatEur(yhteensaKaikki)} €</span>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:16px">
      <table class="taksi-table">
        <thead>
          <tr>
            <th>Kuukausi</th>
            <th>3. pv erä</th>
            <th>18. pv erä</th>
            <th>Yhteensä</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="alert-banner info">Muutokset tallentuvat automaattisesti Firebaseen ja päivittyvät maksukalenteriin.</div>
  `;

  // Event listeners
  container.querySelectorAll('.taksi-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const kk = inp.dataset.kk;
      const era = inp.dataset.era;
      const t = tMap[kk] || {};
      const data = {
        era1_pvm: t.era1_pvm || kk + '-03',
        era2_pvm: t.era2_pvm || kk + '-18',
        era1_summa: era === '1' ? Number(inp.value) : Number(t.era1_summa || 0),
        era2_summa: era === '2' ? Number(inp.value) : Number(t.era2_summa || 0),
      };
      try {
        await paivitaTaksitulo(kk, data);
        showToast('Taksitulo päivitetty', 'success');
      } catch(e) {
        showToast('Virhe tallennuksessa', 'error');
      }
    });
  });
}

// ── YHTEENVETO-NÄKYMÄ ─────────────────────────────────────────────────────────
export function renderYhteenveto(container) {
  const kkData = laskuKuukausittain(state.maksut);
  const kuukaudet = Object.keys(kkData).sort();

  const kokoTulot = state.maksut.filter(m => m.tyyppi === 'TULO').reduce((s,m) => s + Number(m.summa||0), 0);
  const kokoMenot = state.maksut.filter(m => m.tyyppi !== 'TULO').reduce((s,m) => s + Number(m.summa||0), 0);
  const netto = kokoTulot - kokoMenot;
  const maksettu = state.maksut.filter(m => m.status === 'Maksettu').length;
  const avoin = state.maksut.filter(m => m.status !== 'Maksettu').length;

  const maxVal = Math.max(...kuukaudet.map(k => Math.max(kkData[k].tulot, kkData[k].menot)), 1);

  let barHtml = '';
  for (const kk of kuukaudet.slice(-8)) {
    const d = kkData[kk];
    const tH = Math.max(Math.round((d.tulot / maxVal) * 90), 2);
    const mH = Math.max(Math.round((d.menot / maxVal) * 90), 2);
    const m = parseInt(kk.split('-')[1]);
    barHtml += `
      <div class="bar-group">
        <div class="bar-pair">
          <div class="bar-tulo" style="height:${tH}px" title="Tulot: ${formatEur(d.tulot)} €"></div>
          <div class="bar-meno" style="height:${mH}px" title="Menot: ${formatEur(d.menot)} €"></div>
        </div>
        <div class="bar-lbl">${KK_LYHYT[m-1]}</div>
      </div>
    `;
  }

  let kkRows = '';
  let kumSaldo = Number(state.asetukset.kassasaldo || 0);
  for (const kk of kuukaudet) {
    const d = kkData[kk];
    const nettokk = d.tulot - d.menot;
    kumSaldo += nettokk;
    const nCls = nettokk >= 0 ? 'pos' : 'neg';
    const kCls = kumSaldo >= 0 ? 'pos' : 'neg';
    kkRows += `
      <tr>
        <td style="font-weight:600">${kkNimi(kk)}</td>
        <td style="text-align:right;font-family:var(--mono);color:var(--green)">+${formatEur(d.tulot)}</td>
        <td style="text-align:right;font-family:var(--mono);color:var(--red)">-${formatEur(d.menot)}</td>
        <td style="text-align:right;font-family:var(--mono);color:var(--${nCls === 'pos' ? 'green' : 'red'})">${nettokk >= 0 ? '+' : ''}${formatEur(nettokk)}</td>
        <td style="text-align:right;font-family:var(--mono);color:var(--${kCls === 'pos' ? 'green' : 'red'})">${formatEur(kumSaldo)}</td>
      </tr>
    `;
  }

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="font-size:16px;font-weight:700">Yhteenveto 2026</span>
      <button onclick="window._exportCSV()"
        style="background:var(--green2);color:white;border:none;padding:6px 14px;
               border-radius:6px;font-size:12px;cursor:pointer">
        ⬇ Vie CSV
      </button>
    </div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-label">Tulot yhteensä</div>
        <div class="summary-card-value pos">${formatEur(kokoTulot)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Menot yhteensä</div>
        <div class="summary-card-value neg">${formatEur(kokoMenot)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Netto</div>
        <div class="summary-card-value ${netto >= 0 ? 'pos' : 'neg'}">${netto >= 0 ? '+' : ''}${formatEur(netto)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Avoinna / Maksettu</div>
        <div class="summary-card-value neu">${avoin} / ${maksettu}</div>
      </div>
    </div>
    <div class="chart-wrap">
      <div class="chart-title">Tulot 🟢 vs Menot 🔴 — viimeiset kuukaudet</div>
      <div class="bar-chart">${barHtml}</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg3)">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text2)">Kuukausi</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text2)">Tulot</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text2)">Menot</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text2)">Netto</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text2)">Kassa</th>
          </tr>
        </thead>
        <tbody>${kkRows}</tbody>
      </table>
    </div>
  `;
}

// ── AVOIMET LASKUT -NÄKYMÄ ────────────────────────────────────────────────────
export function renderAvoimet(container) {
  const td = today();
  const avoimet = state.maksut
    .filter(m => m.status !== 'Maksettu' && m.tyyppi !== 'TULO')
    .sort((a, b) => {
      const pri = { KRIITTINEN: 0, Intrumilla: 1, Ropolla: 1, Avoinna: 2, Tuleva: 3 };
      const pa = pri[a.status] ?? 2;
      const pb = pri[b.status] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.pvm || '').localeCompare(b.pvm || '');
    });

  const kriittiset = avoimet.filter(m => m.status === 'KRIITTINEN' || m.status === 'Intrumilla' || m.status === 'Ropolla');
  const normaalit  = avoimet.filter(m => m.status !== 'KRIITTINEN' && m.status !== 'Intrumilla' && m.status !== 'Ropolla');
  const myohassa   = avoimet.filter(m => m.pvm < td);
  const summa      = avoimet.reduce((s, m) => s + Number(m.summa || 0), 0);
  const myohassSumma = myohassa.reduce((s, m) => s + Number(m.summa || 0), 0);

  // Velkoja-yhteenveto
  const velkojaMap = {};
  for (const m of avoimet) {
    const k = m.kenelle || 'Muu';
    velkojaMap[k] = (velkojaMap[k] || 0) + Number(m.summa || 0);
  }
  const velkojaLista = Object.entries(velkojaMap)
    .sort((a, b) => b[1] - a[1])
    .map(([k, s]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:6px 10px;border-bottom:1px solid rgba(42,63,82,.4);font-size:13px">
        <span style="color:var(--text2)">${k}</span>
        <span style="font-family:var(--mono);font-weight:600;color:var(--red)">
          ${formatEur(s)} €
        </span>
      </div>`).join('');

  let html = `
    <div class="section-header">
      <span class="section-title">Avoimet laskut</span>
      <span class="section-badge" style="color:var(--red)">${avoimet.length} kpl — ${formatEur(summa)} €</span>
    </div>
    ${myohassa.length > 0 ? `
      <div class="alert-banner danger" style="margin-bottom:12px">
        ⚠️ Myöhässä: ${myohassa.length} laskua — ${formatEur(myohassSumma)} €
      </div>` : ''}
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);
                margin-bottom:16px;overflow:hidden">
      <div style="padding:10px 12px;font-size:11px;color:var(--text2);
                  text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);
                  background:var(--bg3)">
        Erittely velkojan mukaan
      </div>
      ${velkojaLista}
      <div style="display:flex;justify-content:space-between;padding:8px 10px;
                  font-weight:700;font-size:14px">
        <span>Yhteensä</span>
        <span style="font-family:var(--mono);color:var(--red)">${formatEur(summa)} €</span>
      </div>
    </div>
  `;

  if (kriittiset.length > 0) {
    html += `<div style="font-size:12px;color:var(--red);text-transform:uppercase;
                         letter-spacing:1px;margin-bottom:8px;font-weight:700">
               Kriittiset / Perintä
             </div>`;
    for (const m of kriittiset) {
      html += renderAvoinKortti(m, true);
    }
  }

  if (normaalit.length > 0) {
    html += `<div style="font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px;font-weight:600">Muut avoimet</div>`;
    for (const m of normaalit) {
      html += renderAvoinKortti(m, false);
    }
  }

  if (avoimet.length === 0) {
    html += `<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">Ei avoimia laskuja!</div></div>`;
  }

  container.innerHTML = html;
  attachCardActions(container);
}

function renderAvoinKortti(m, kriitt) {
  const perintaCls = m.status === 'Intrumilla' || m.status === 'Ropolla' ? 'perintä' : kriitt ? 'kriittinen' : '';
  return `
    <div class="avoin-card ${perintaCls}">
      <div class="avoin-header">
        <div>
          <div class="avoin-nimi">${m.nimi || '—'}</div>
          <div class="avoin-meta">${m.kenelle || ''} ${m.pvm ? '— eräpäivä: ' + formatPvmShort(m.pvm) + (new Date().toISOString().split('T')[0] > m.pvm ? ' <span style="color:var(--red)">(MYÖHÄSSÄ)</span>' : '') : ''}</div>
        </div>
        <div class="avoin-summa">${formatEur(m.summa)} €</div>
      </div>
      ${m.huomio ? `<div class="avoin-huomio">${m.huomio}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button type="button" class="btn-kuittaa" style="max-width:140px"
          data-action="kuittaa" data-id="${m.id}" data-vanha="${m.status}">✓ Maksettu</button>
        <button type="button" class="btn-muokkaa"
          data-action="muokkaa" data-id="${m.id}">✎ Muokkaa</button>
      </div>
    </div>
  `;
}

// ── EVENT DELEGAATIO: KAIKKI KORTTIEN NAPIT ──────────────────────────────────
// Yksi kuuntelija per container — ei inline onclickeja, toimii luotettavasti iOS:lla
export function attachCardActions(container) {
  // Poista vanha kuuntelija jos olemassa
  if (container._cardActionHandler) {
    container.removeEventListener('click', container._cardActionHandler);
  }

  container._cardActionHandler = function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    // Estä tapahtuman leviäminen swipe-handlereille
    e.stopPropagation();

    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    const vanha  = btn.dataset.vanha || 'Avoinna';
    const nimi   = btn.dataset.nimi  || '';

    if (action === 'kuittaa') window._kuittaa(id, vanha);
    else if (action === 'peru')   window._peruKuittaus(id, vanha);
    else if (action === 'muokkaa') window._muokkaa(id);
    else if (action === 'poista')  window._poista(id, nimi);
  };

  container.addEventListener('click', container._cardActionHandler);

  // Avoimet-kortit (ei swipejä, mutta sama delegaatio)
  container.querySelectorAll('.avoin-card [data-action]').forEach(btn => {
    btn.dataset._delegated = '1';
  });
}

// ── SWIPE GESTURES ────────────────────────────────────────────────────────────
export function attachSwipeHandlers() {
  document.querySelectorAll('.maksu-card').forEach(card => {
    if (card.dataset.swipeAttached) return;
    card.dataset.swipeAttached = '1';
    let startX = 0, startY = 0, dx = 0;
    let isDragging = false;

    card.addEventListener('touchstart', e => {
      // Älä käynnistä swipeä jos kosketus alkaa napin päältä
      if (e.target.closest('[data-action]')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      isDragging = false;
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (e.target.closest('[data-action]')) return;
      dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (Math.abs(dx) > dy + 5) {
        isDragging = true;
        const clamped = Math.max(-90, Math.min(90, dx));
        card.style.transform = `translateX(${clamped}px)`;
        card.style.transition = 'none';
      }
    }, { passive: true });

    card.addEventListener('touchend', e => {
      if (e.target.closest('[data-action]')) return;
      card.style.transition = '';
      card.style.transform = '';
      if (!isDragging) return;
      isDragging = false;
      const id = card.dataset.id;
      if (dx > 60) {
        const m = state.maksut.find(x => x.id === id);
        if (m && m.status !== 'Maksettu') window._kuittaa(id, m.status);
      } else if (dx < -60) {
        window._muokkaa(id);
      }
    });
  });
}

// ── MODAL: LISÄÄ / MUOKKAA MAKSU ─────────────────────────────────────────────
export function naytaMaksuModal(maksu = null) {
  const otsikko = maksu ? 'Muokkaa maksua' : 'Lisää uusi maksu';
  const v = maksu || {
    pvm: today(), nimi: '', summa: '', tyyppi: 'MENO', kategoria: 'Lasku',
    status: 'Avoinna', prioriteetti: 'PAKKO', kenelle: '', huomio: ''
  };

  const html = `
    <div class="modal-overlay" id="modal" onclick="e => { if(e.target.id==='modal') window._suljeModal(); }">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-title">${otsikko}</div>
        <div class="form-group">
          <label class="form-label">Nimi / kuvaus</label>
          <input class="form-input" id="m-nimi" type="text" value="${v.nimi||''}" placeholder="esim. OmaSP asuntolaina">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Summa (€)</label>
            <input class="form-input" id="m-summa" type="number" step="0.01" value="${v.summa||''}" placeholder="0.00">
          </div>
          <div class="form-group">
            <label class="form-label">Päivämäärä</label>
            <input class="form-input" id="m-pvm" type="date" value="${v.pvm||today()}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tyyppi</label>
            <select class="form-select" id="m-tyyppi">
              <option value="MENO" ${v.tyyppi==='MENO'?'selected':''}>Meno</option>
              <option value="TULO" ${v.tyyppi==='TULO'?'selected':''}>Tulo</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Prioriteetti</label>
            <select class="form-select" id="m-prioriteetti">
              <option value="PAKKO" ${v.prioriteetti==='PAKKO'?'selected':''}>PAKKO</option>
              <option value="Normaali" ${v.prioriteetti==='Normaali'?'selected':''}>Normaali</option>
              <option value="Tulo" ${v.prioriteetti==='Tulo'?'selected':''}>Tulo</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="m-status">
              <option value="Avoinna" ${v.status==='Avoinna'?'selected':''}>Avoinna</option>
              <option value="KRIITTINEN" ${v.status==='KRIITTINEN'?'selected':''}>KRIITTINEN</option>
              <option value="Tuleva" ${v.status==='Tuleva'?'selected':''}>Tuleva</option>
              <option value="Intrumilla" ${v.status==='Intrumilla'?'selected':''}>Intrumilla</option>
              <option value="Ropolla" ${v.status==='Ropolla'?'selected':''}>Ropolla</option>
              <option value="Maksettu" ${v.status==='Maksettu'?'selected':''}>Maksettu</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Kategoria</label>
            <select class="form-select" id="m-kategoria">
              ${['Laina','YEL','ALV','Lasku','Vakuutus','Perintä','Taksitulo','Eläke','Vuokra','Muu'].map(k =>
                `<option value="${k}" ${v.kategoria===k?'selected':''}>${k}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Kenelle / maksusaaja</label>
          <input class="form-input" id="m-kenelle" type="text" value="${v.kenelle||''}" placeholder="esim. OmaSP">
        </div>
        <div class="form-group">
          <label class="form-label">Huomio / viite</label>
          <input class="form-input" id="m-huomio" type="text" value="${v.huomio||''}" placeholder="esim. viite, lisätieto">
        </div>
        <div class="modal-btns">
          <button class="btn-sec" onclick="window._suljeModal()">Peruuta</button>
          ${maksu ? `<button class="btn-danger" onclick="window._poista('${maksu.id}','${(maksu.nimi||'').replace(/'/g,"\\'")}')">Poista</button>` : ''}
          <button class="btn-prim" onclick="window._tallennaMaksu('${maksu ? maksu.id : ''}')">
            ${maksu ? 'Tallenna' : 'Lisää maksu'}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('m-nimi')?.focus(), 50);
}

// ── MODAL: SALDO MUOKKAUS ─────────────────────────────────────────────────────
export function naytaSaldoModal() {
  const html = `
    <div class="modal-overlay" id="modal">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-title">Päivitä kassasaldo</div>
        <div class="form-group">
          <label class="form-label">Kassassa nyt (€)</label>
          <input class="form-input" id="s-saldo" type="number" step="0.01"
            value="${state.asetukset.kassasaldo || 0}" style="font-size:24px;font-weight:700;text-align:right">
        </div>
        <div class="modal-btns">
          <button class="btn-sec" onclick="window._suljeModal()">Peruuta</button>
          <button class="btn-prim" onclick="window._tallennaSaldo()">Tallenna</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => {
    const inp = document.getElementById('s-saldo');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

// ── UNDO TOAST ────────────────────────────────────────────────────────────────
export function naytaUndo(id, vanhaStatus, nimi) {
  const olemassa = document.getElementById('undo-toast');
  if (olemassa) olemassa.remove();
  if (state.undoQueue) clearTimeout(state.undoQueue.timer);

  const el = document.createElement('div');
  el.id = 'undo-toast';
  el.className = 'undo-toast';
  el.innerHTML = `
    <span>✓ ${nimi || 'Maksu'} merkitty maksetuksi</span>
    <button class="undo-btn" onclick="window._undoKuittaus('${id}','${vanhaStatus}')">Peru (5s)</button>
  `;
  document.body.appendChild(el);

  const timer = setTimeout(() => {
    el.remove();
    state.undoQueue = null;
  }, 5000);
  state.undoQueue = { id, vanhaStatus, timer };
}
