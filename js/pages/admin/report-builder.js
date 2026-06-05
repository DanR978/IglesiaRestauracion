// js/pages/admin/report-builder.js
// ─────────────────────────────────────────────────────────────────────────────
// Treasury Report Builder — customizable report, live paper preview, WYSIWYG
// multi-page PDF. Periods: semana / mes / trimestre / año. Word-style running
// header + footer, faint logo watermark, optional sample data, and smart
// insights + recommendations. Preview and PDF share one document generator and
// one stylesheet, so the export matches the preview exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from './state.js';

const CHURCH = 'Iglesia Restauración Divina';
// Same-origin so it renders in the live preview AND can be drawn into the PDF.
const LOGO = '/resources/report-logo.png';
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function fmt(n) { return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
const pad = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
function fmtDate(d) { if (!d) return ''; const [y,m,day] = String(d).split('-').map(Number); return new Date(y,m-1,day).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }); }

const SECTIONS = [
  { k: 'cover', label: 'Portada' },
  { k: 'summary', label: 'Resumen (totales)' }, { k: 'chart', label: 'Gráfica del período' },
  { k: 'monthly', label: 'Tabla por período' }, { k: 'byIncome', label: 'Ingresos por categoría' },
  { k: 'byExpense', label: 'Gastos por categoría' }, { k: 'detail', label: 'Detalle de transacciones' },
];

let config = null, data = null, host = null;
const sampleCache = {};

export async function mountReportBuilder(root) {
  host = root;
  const now = new Date();
  if (!config) config = {
    period: 'year', year: now.getFullYear(), quarter: Math.floor(now.getMonth()/3)+1,
    month: `${now.getFullYear()}-${pad(now.getMonth()+1)}`, weekDate: isoDate(now),
    sample: false, title: 'Reporte de Tesorería',
    sections: { cover:true, summary:true, chart:true, monthly:true, byIncome:true, byExpense:true, detail:false },
    accent: '#394548', density: 'comfortable', paper: 'letter', orientation: 'portrait',
  };
  ensureReportStyles();
  root.innerHTML = `<div class="rb">
    <aside class="rb-controls" id="rbControls"></aside>
    <div class="rb-stage"><div class="rb-paperwrap"><div class="rb-paper" id="rbPaper"></div></div></div>
  </div>`;
  renderControls();
  await loadData();
  renderPreview();
}

/* ── Period → range + buckets ──────────────────────────────────────────────── */
function periodRange() {
  const C = config;
  if (C.period === 'quarter') {
    const m0 = (C.quarter - 1) * 3;
    const buckets = [0,1,2].map(k => { const m = m0+k+1; return { label: MONTHS[m-1], short: MONTHS[m-1].slice(0,3), start: `${C.year}-${pad(m)}-01`, end: `${C.year}-${pad(m)}-${pad(lastDay(C.year,m))}` }; });
    return { start: buckets[0].start, end: buckets[2].end, buckets, col: 'Mes', label: `Trimestre ${C.quarter} · ${C.year}`, headRight: `T${C.quarter} ${C.year}` };
  }
  if (C.period === 'month') {
    const [y,m] = C.month.split('-').map(Number); const ld = lastDay(y,m);
    const buckets = [];
    for (let d=1; d<=ld; d+=7) { const e = Math.min(d+6, ld); buckets.push({ label: `${d}–${e}`, short: `${d}–${e}`, start: `${C.month}-${pad(d)}`, end: `${C.month}-${pad(e)}` }); }
    return { start: `${C.month}-01`, end: `${C.month}-${pad(ld)}`, buckets, col: 'Semana', label: `${MONTHS[m-1]} ${y}`, headRight: `${MONTHS[m-1]} ${y}` };
  }
  if (C.period === 'week') {
    const base = parseISO(C.weekDate); const sun = addDays(base, -base.getDay());
    const buckets = Array.from({length:7}, (_,i) => { const d = addDays(sun,i); return { label: `${DAYS[i]} ${d.getDate()}`, short: DAYS[i].slice(0,3), start: isoDate(d), end: isoDate(d) }; });
    return { start: isoDate(sun), end: isoDate(addDays(sun,6)), buckets, col: 'Día', label: `Semana del ${fmtDate(isoDate(sun))}`, headRight: `Semana ${fmtDate(isoDate(sun))}` };
  }
  const buckets = Array.from({length:12}, (_,i) => ({ label: MONTHS[i], short: MONTHS[i].slice(0,3), start: `${C.year}-${pad(i+1)}-01`, end: `${C.year}-${pad(i+1)}-${pad(lastDay(C.year,i+1))}` }));
  return { start: `${C.year}-01-01`, end: `${C.year}-12-31`, buckets, col: 'Mes', label: `Año ${C.year}`, headRight: `${C.year}` };
}

/* ── Data ──────────────────────────────────────────────────────────────────── */
async function loadData() {
  const r = periodRange();
  let incRows, expRows;
  if (config.sample) {
    const s = sampleYear(config.year);
    incRows = s.income.filter(x => x.occurred_on >= r.start && x.occurred_on <= r.end);
    expRows = s.expense.filter(x => x.occurred_on >= r.start && x.occurred_on <= r.end);
  } else {
    const [inc, exp] = await Promise.all([
      sb.from('fin_income').select('occurred_on,source,fund,amount').gte('occurred_on', r.start).lte('occurred_on', r.end).order('occurred_on'),
      sb.from('fin_expenses').select('occurred_on,payee,category,label,amount').gte('occurred_on', r.start).lte('occurred_on', r.end).order('occurred_on'),
    ]);
    incRows = inc.data || []; expRows = exp.data || [];
  }
  const buckets = r.buckets.map(b => ({ ...b, in: 0, out: 0, income: [], expense: [] }));
  const place = (row, arr, key) => { const b = buckets.find(b => row.occurred_on >= b.start && row.occurred_on <= b.end); if (b) { b[key] += +row.amount || 0; b[key === 'in' ? 'income' : 'expense'].push(row); } };
  incRows.forEach(r2 => place(r2, null, 'in')); expRows.forEach(r2 => place(r2, null, 'out'));
  const grp = (rows, kf) => { const m = {}; rows.forEach(r2 => { const k = kf(r2) || '—'; m[k] = (m[k]||0) + (+r2.amount||0); }); return Object.entries(m).map(([label,total]) => ({label,total})).sort((a,b)=>b.total-a.total); };
  data = {
    range: r, buckets,
    totIn: incRows.reduce((a,x)=>a+(+x.amount||0),0),
    totOut: expRows.reduce((a,x)=>a+(+x.amount||0),0),
    byIncome: grp(incRows, x => x.source),
    byExpense: grp(expRows, x => x.category || (x.label==='Pastor' ? 'Pastor' : '')),
  };
}

function sampleYear(y) {
  if (sampleCache[y]) return sampleCache[y];
  const rnd = (a,b) => Math.round((a + Math.random()*(b-a)) / 5) * 5;
  const income = [], expense = [];
  for (let m = 1; m <= 12; m++) {
    const ld = lastDay(y, m);
    for (let d = 1; d <= ld; d++) {
      const dow = new Date(y, m-1, d).getDay(); const date = `${y}-${pad(m)}-${pad(d)}`;
      if (dow === 0) { income.push({ occurred_on: date, source: 'Ofrenda domingos', fund: 'General', amount: rnd(280,620) }); income.push({ occurred_on: date, source: 'Diezmos', fund: 'General', amount: rnd(400,900) }); }
      if (dow === 2) income.push({ occurred_on: date, source: 'Ofrenda martes', fund: 'General', amount: rnd(90,240) });
    }
    if (Math.random() < 0.5) income.push({ occurred_on: `${y}-${pad(m)}-15`, source: 'Otros (donaciones)', fund: 'General', amount: rnd(100,600) });
    expense.push({ occurred_on: `${y}-${pad(m)}-01`, payee: 'Arrendador', category: 'Renta', amount: 850 });
    expense.push({ occurred_on: `${y}-${pad(m)}-05`, payee: 'Pastor', category: 'Sueldo del pastor', label: 'Pastor', amount: 1200 });
    expense.push({ occurred_on: `${y}-${pad(m)}-06`, payee: 'Limpieza', category: 'Pago de la limpieza', amount: 220 });
    expense.push({ occurred_on: `${y}-${pad(m)}-10`, payee: 'Servicios', category: 'Luz / agua / internet', amount: rnd(240,360) });
    if (Math.random() < 0.6) expense.push({ occurred_on: `${y}-${pad(m)}-18`, payee: 'Ministerio', category: ['Niños','Alabanza','Evangelismo','Eventos especiales'][Math.floor(Math.random()*4)], amount: rnd(80,400) });
    if (Math.random() < 0.3) expense.push({ occurred_on: `${y}-${pad(m)}-22`, payee: 'Ayuda', category: 'Benevolencia', amount: rnd(100,500) });
  }
  return (sampleCache[y] = { income, expense });
}

/* ── Controls ──────────────────────────────────────────────────────────────── */
function renderControls() {
  const c = document.getElementById('rbControls');
  const y0 = new Date().getFullYear();
  const periodSub = {
    year:    `<select id="rbYear" class="rb-input">${[y0+1,y0,y0-1,y0-2,y0-3].map(y=>`<option value="${y}"${y===config.year?' selected':''}>${y}</option>`).join('')}</select>`,
    quarter: `<select id="rbYear" class="rb-input">${[y0+1,y0,y0-1,y0-2].map(y=>`<option value="${y}"${y===config.year?' selected':''}>${y}</option>`).join('')}</select>
              <div class="rb-seg" data-seg="quarter" style="margin-top:.4rem">${[1,2,3,4].map(q=>`<button type="button" data-val="${q}" class="${config.quarter===q?'on':''}">T${q}</button>`).join('')}</div>`,
    month:   `<input type="month" id="rbMonth" class="rb-input" value="${config.month}">`,
    week:    `<input type="date" id="rbWeek" class="rb-input" value="${config.weekDate}">`,
  }[config.period];

  c.innerHTML = `
    <div class="rb-grp"><label class="rb-grp__t">Período</label>
      <div class="rb-seg rb-seg--wrap" data-seg="period">
        <button type="button" data-val="week" class="${config.period==='week'?'on':''}">Semana</button>
        <button type="button" data-val="month" class="${config.period==='month'?'on':''}">Mes</button>
        <button type="button" data-val="quarter" class="${config.period==='quarter'?'on':''}">Trimestre</button>
        <button type="button" data-val="year" class="${config.period==='year'?'on':''}">Año</button>
      </div>
      <div style="margin-top:.5rem">${periodSub}</div>
    </div>
    <div class="rb-grp">
      <label class="rb-check"><input type="checkbox" id="rbSample"${config.sample?' checked':''}><span><strong>Datos de ejemplo</strong> — ver cómo se vería</span></label>
    </div>
    <div class="rb-grp"><label class="rb-grp__t">Título</label>
      <input type="text" id="rbTitle" class="rb-input" value="${esc(config.title)}" placeholder="Reporte de Tesorería">
    </div>
    <div class="rb-grp"><label class="rb-grp__t">Secciones</label>
      ${SECTIONS.map(s=>`<label class="rb-check"><input type="checkbox" data-sec="${s.k}"${config.sections[s.k]?' checked':''}><span>${s.label}</span></label>`).join('')}
    </div>
    <button class="btn btn--primary rb-export" id="rbExport"><i class="fas fa-file-pdf"></i> Descargar PDF</button>`;

  const reload = async () => { await loadData(); renderPreview(); };
  c.querySelector('#rbYear')?.addEventListener('change', e => { config.year = +e.target.value; reload(); });
  c.querySelector('#rbMonth')?.addEventListener('change', e => { config.month = e.target.value; reload(); });
  c.querySelector('#rbWeek')?.addEventListener('change', e => { config.weekDate = e.target.value; reload(); });
  c.querySelector('#rbSample')?.addEventListener('change', e => { config.sample = e.target.checked; reload(); });
  c.querySelector('#rbTitle').addEventListener('input', e => { config.title = e.target.value; renderPreview(); });
  c.querySelectorAll('[data-sec]').forEach(cb => cb.addEventListener('change', () => { config.sections[cb.dataset.sec] = cb.checked; renderPreview(); }));
  c.querySelectorAll('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const key = seg.dataset.seg, val = key === 'quarter' ? +b.dataset.val : b.dataset.val;
    config[key] = val;
    renderControls();
    if (key === 'period' || key === 'quarter') await loadData();
    renderPreview();
  })));
  c.querySelector('#rbExport').addEventListener('click', exportPDF);
}

/* ── Preview ───────────────────────────────────────────────────────────────── */
function renderPreview() {
  const paper = document.getElementById('rbPaper');
  if (!paper || !data) return;
  paper.className = `rb-paper rb-paper--${config.paper} rb-paper--${config.orientation} rb-density-${config.density}`;
  paper.style.setProperty('--rb-accent', config.accent);
  // The accent var must live ON the captured element (not just the parent paper),
  // or var(--rb-accent) resolves to nothing in the PDF canvas → invisible bars.
  paper.innerHTML = `<div class="rb-doc" style="--rb-accent:${config.accent}">${buildDoc()}</div>`;
}

/* ── Document generator ────────────────────────────────────────────────────── */
function buildDoc() {
  // Preview wrapper: on-page running header + faint watermark + the body.
  const r = data.range;
  return `<div class="rb-watermark"><img src="${LOGO}" alt=""></div>
    <header class="rb-runhead"><span>${esc(CHURCH)}</span><span class="rb-runhead__r">${esc(r.headRight)}</span></header>
    <div class="rb-doc__body">${buildBody()}</div>`;
}
function buildBody() {
  const s = config.sections, r = data.range, bal = data.totIn - data.totOut;
  const today = new Date().toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
  const body = [];

  if (s.cover) body.push(`<section class="rb-sec rb-cover">
    <h1 class="rb-cover__title">${esc(config.title || 'Reporte de Tesorería')}</h1>
    <div class="rb-cover__meta">Generado el ${today}</div></section>`);

  if (s.summary) body.push(`<section class="rb-sec"><h2 class="rb-h2">Resumen · ${esc(r.label)}</h2>
    <div class="rb-kpis">${kpi('Ingresos', fmt(data.totIn), 'pos')}${kpi('Gastos', fmt(data.totOut), 'neg')}${kpi('Balance', fmt(bal), bal<0?'neg':'pos')}</div></section>`);

  if (s.chart) {
    const max = Math.max(1, ...data.buckets.map(b => Math.max(b.in, b.out)));
    body.push(`<section class="rb-sec"><h2 class="rb-h2">Ingresos y gastos por ${r.col.toLowerCase()}</h2>
      <div class="rb-chart">${data.buckets.map(b => `<div class="rb-chart__col"><div class="rb-chart__bars">
        <div class="rb-chart__bar in" style="height:${Math.round(b.in/max*100)}%"></div>
        <div class="rb-chart__bar out" style="height:${Math.round(b.out/max*100)}%"></div></div>
        <span class="rb-chart__lbl">${esc(b.short)}</span></div>`).join('')}</div>
      <div class="rb-legend"><span><i class="in"></i> Ingresos</span><span><i class="out"></i> Gastos</span></div></section>`);
  }

  if (s.monthly) {
    let acc = 0;
    const rows = data.buckets.map(b => {
      const d = b.in - b.out; acc += d; const has = b.in || b.out;
      // Detail rows align into the real columns: income under Ingresos,
      // expense under Gastos.
      const detail = (s.detail && has) ? (
        b.income.map(x=>`<tr class="rb-detail"><td>${fmtDate(x.occurred_on)} · ${esc(x.source||'')}</td><td class="r pos">${fmt(x.amount)}</td><td></td><td></td><td></td></tr>`).join('') +
        b.expense.map(x=>`<tr class="rb-detail"><td>${fmtDate(x.occurred_on)} · ${esc(x.payee||x.category||'—')}</td><td></td><td class="r neg">${fmt(x.amount)}</td><td></td><td></td></tr>`).join('')
      ) : '';
      return `<tr class="rb-mrow"><td>${esc(b.label)}</td><td class="r pos">${b.in?fmt(b.in):'—'}</td><td class="r neg">${b.out?fmt(b.out):'—'}</td><td class="r">${has?fmt(d):'—'}</td><td class="r">${fmt(acc)}</td></tr>${detail}`;
    }).join('');
    body.push(`<section class="rb-sec"><h2 class="rb-h2">Detalle por ${r.col.toLowerCase()}</h2>
      <table class="rb-table"><thead><tr><th>${esc(r.col)}</th><th class="r">Ingresos</th><th class="r">Gastos</th><th class="r">Balance</th><th class="r">Acumulado</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><th>Total</th><th class="r pos">${fmt(data.totIn)}</th><th class="r neg">${fmt(data.totOut)}</th><th class="r">${fmt(bal)}</th><th></th></tr></tfoot></table></section>`);
  }
  if (s.byIncome && s.byExpense) {
    body.push(`<div class="rb-cols2">${breakdown('Ingresos por categoría', data.byIncome, data.totIn, 'pos')}${breakdown('Gastos por categoría', data.byExpense, data.totOut, 'neg')}</div>`);
  } else {
    if (s.byIncome) body.push(breakdown('Ingresos por categoría', data.byIncome, data.totIn, 'pos'));
    if (s.byExpense) body.push(breakdown('Gastos por categoría', data.byExpense, data.totOut, 'neg'));
  }

  return body.join('') || '<section class="rb-sec"><p class="rb-empty">Activa al menos una sección.</p></section>';
}

function kpi(l, v, cls) { return `<div class="rb-kpi"><div class="rb-kpi__v ${cls}">${v}</div><div class="rb-kpi__l">${l}</div></div>`; }
function breakdown(title, rows, total, cls) {
  if (!rows.length) return `<section class="rb-sec"><h2 class="rb-h2">${title}</h2><p class="rb-empty">Sin datos.</p></section>`;
  const max = Math.max(1, ...rows.map(r=>r.total));
  return `<section class="rb-sec"><h2 class="rb-h2">${title}</h2><div class="rb-break">${rows.map(r=>`
    <div class="rb-break__row"><span class="rb-break__lbl">${esc(r.label)}</span>
      <span class="rb-break__track"><span class="rb-break__fill ${cls}" style="width:${Math.round(r.total/max*100)}%"></span></span>
      <span class="rb-break__val ${cls}">${fmt(r.total)}</span><span class="rb-break__pct">${total?Math.round(r.total/total*100):0}%</span></div>`).join('')}</div></section>`;
}

/* ── PDF export — a real downloadable PDF (no browser print chrome) ─────────── */
let _h2p = null;
function loadHtml2pdf() {
  if (window.html2pdf) return Promise.resolve();
  if (_h2p) return _h2p;
  _h2p = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js';
    s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el generador de PDF.'));
    document.head.appendChild(s);
  });
  return _h2p;
}
let _wm;
function logoDataURL() {
  if (_wm !== undefined) return Promise.resolve(_wm);
  return new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        _wm = { url: c.toDataURL('image/png'), ratio: img.naturalHeight / img.naturalWidth };
      } catch { _wm = null; }
      res(_wm);
    };
    img.onerror = () => { _wm = null; res(null); };
    img.src = LOGO;
  });
}

async function exportPDF() {
  const btn = document.getElementById('rbExport');
  const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando…';
  const el = document.querySelector('#rbPaper .rb-doc');
  const wmEl = el?.querySelector('.rb-watermark');
  try {
    await loadHtml2pdf();
    const wm = await logoDataURL();
    if (!el) throw new Error('Abre un reporte primero.');
    el.style.setProperty('--rb-accent', config.accent);
    if (wmEl) wmEl.style.display = 'none';   // don't let the image distort the capture

    const size = config.paper === 'a4' ? 'a4' : 'letter';
    const fname = `Reporte-Tesoreria-${String(data.range.headRight).replace(/[^0-9A-Za-z]+/g, '-')}.pdf`;
    const opt = {
      margin: [16, 12, 15, 12],
      filename: fname,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF: { unit: 'mm', format: size, orientation: config.orientation },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.rb-kpi', '.rb-chart', 'tr', '.rb-break__row', '.rb-cols2', '.rb-cover'] },
    };
    await window.html2pdf().set(opt).from(el).toPdf().get('pdf').then(pdf => {
      const n = pdf.internal.getNumberOfPages();
      const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        if (wm) {
          try {
            const ww = W * 0.5, wh = ww * wm.ratio;
            pdf.setGState(new pdf.GState({ opacity: 0.10 }));
            pdf.addImage(wm.url, 'PNG', (W - ww) / 2, (H - wh) / 2, ww, wh);
            pdf.setGState(new pdf.GState({ opacity: 1 }));
          } catch { /* watermark optional */ }
        }
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(155);
        pdf.text(`${i} / ${n}`, W - 12, H - 7, { align: 'right' });
      }
    }).save();
  } catch (e) {
    alert('No se pudo generar el PDF: ' + (e?.message || e));
  } finally {
    if (wmEl) wmEl.style.display = '';
    btn.disabled = false; btn.innerHTML = orig;
  }
}

/* ── Report content CSS (preview + PDF) ────────────────────────────────────── */
function ensureReportStyles() {
  if (document.getElementById('rb-report-styles')) return;
  const el = document.createElement('style'); el.id = 'rb-report-styles'; el.textContent = REPORT_CSS;
  document.head.appendChild(el);
}

const REPORT_CSS = `
.rb-doc{ position:relative; font-family:-apple-system,"Segoe UI",Arial,sans-serif; color:#1f2a2e; font-size:12px; line-height:1.5; }
.rb-watermark{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; opacity:.14; pointer-events:none; z-index:0; overflow:hidden; }
.rb-watermark img{ width:58%; max-width:420px; max-height:90%; object-fit:contain; }
.rb-runhead{ display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#7a868b; border-bottom:1px solid #e2e7e9; padding-bottom:6px; margin-bottom:16px; font-weight:600; letter-spacing:.01em; }
.rb-runhead__r{ color:var(--rb-accent); font-weight:700; }
.rb-doc__body{ position:relative; z-index:1; }
.rb-sec{ margin:0 0 18px; }
.rb-h2{ font-size:12.5px; font-weight:800; color:var(--rb-accent); margin:0 0 9px; padding-bottom:5px; border-bottom:1.5px solid #ccd4d5; text-transform:uppercase; letter-spacing:.05em; break-after:avoid; }
/* Cover masthead — compact, flows straight into the content */
.rb-cover{ text-align:center; padding:4px 0 16px; margin:0 0 20px; border-bottom:2.5px solid var(--rb-accent); }
.rb-cover__title{ font-size:25px; font-weight:800; margin:0 0 4px; letter-spacing:-.01em; }
.rb-cover__meta{ font-size:11px; color:#8a979c; }
/* KPIs */
.rb-kpis{ display:flex; gap:10px; }
.rb-kpi{ flex:1; border:1px solid #e4e9ea; border-left:3px solid var(--rb-accent); border-radius:8px; padding:11px 14px; break-inside:avoid; }
.rb-kpi__v{ font-size:20px; font-weight:800; letter-spacing:-.02em; }
.rb-kpi__l{ font-size:10px; color:#6a767b; font-weight:700; margin-top:2px; text-transform:uppercase; letter-spacing:.04em; }
/* Chart */
.rb-chart{ display:flex; align-items:flex-end; gap:6px; height:140px; break-inside:avoid; }
.rb-chart__col{ flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; min-width:0; }
.rb-chart__bars{ flex:1; width:100%; display:flex; align-items:flex-end; justify-content:center; gap:3px; }
.rb-chart__bar{ width:42%; max-width:12px; min-height:2px; border-radius:2px 2px 0 0; }
.rb-chart__bar.in{ background:var(--rb-accent); } .rb-chart__bar.out{ background:#b02030; }
.rb-chart__lbl{ font-size:8.5px; color:#8a979c; white-space:nowrap; }
.rb-legend{ display:flex; gap:18px; justify-content:center; margin-top:9px; font-size:10.5px; color:#6a767b; break-inside:avoid; }
.rb-legend i{ display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; }
.rb-legend i.in{ background:var(--rb-accent); } .rb-legend i.out{ background:#b02030; }
/* Tables — repeat the header across pages, tabular figures, tinted head */
.rb-table{ width:100%; border-collapse:collapse; font-size:11px; }
.rb-table thead{ display:table-header-group; }
.rb-table thead th{ background:#f2f5f5; font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:#5f6c71; padding:7px 9px; border-bottom:1.5px solid #ccd4d5; text-align:left; }
.rb-table td{ padding:5px 9px; border-bottom:1px solid #eef2f2; text-align:left; }
.rb-table th.r,.rb-table td.r{ text-align:right; font-variant-numeric:tabular-nums; }
.rb-table tbody tr{ break-inside:avoid; }
.rb-mrow td{ font-weight:600; }
.rb-table tfoot th{ border-top:2px solid #cfd6d8; padding:7px 9px; font-size:11px; text-align:left; }
.rb-table tfoot th.r{ text-align:right; font-variant-numeric:tabular-nums; }
.rb-detail td{ background:#fafcfc; font-size:10px; font-weight:400; color:#6a767b; padding:3px 9px; border-bottom:1px solid #f1f5f5; }
.rb-detail td:first-child{ padding-left:20px; }
/* Category breakdowns — two columns side by side */
.rb-cols2{ display:grid; grid-template-columns:1fr 1fr; gap:24px; margin:0 0 18px; }
.rb-cols2 .rb-sec{ margin:0; break-inside:avoid; }
.rb-break{ display:flex; flex-direction:column; gap:6px; }
.rb-break__row{ display:flex; align-items:center; gap:9px; break-inside:avoid; }
.rb-break__lbl{ width:40%; font-size:10.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rb-break__track{ flex:1; height:11px; background:#eef1f2; border-radius:99px; overflow:hidden; }
.rb-break__fill{ display:block; height:100%; border-radius:99px; }
.rb-break__fill.pos{ background:var(--rb-accent); } .rb-break__fill.neg{ background:#b02030; }
.rb-break__val{ width:72px; text-align:right; font-weight:700; font-size:10px; font-variant-numeric:tabular-nums; }
.rb-break__pct{ width:28px; text-align:right; font-size:9.5px; color:#8a979c; }
.rb-doc .pos{ color:#1e6b61; } .rb-doc .neg{ color:#b02030; }
.rb-empty{ color:#8a979c; font-size:12px; }
`;
