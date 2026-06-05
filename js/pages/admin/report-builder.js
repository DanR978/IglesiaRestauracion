// js/pages/admin/report-builder.js
// ─────────────────────────────────────────────────────────────────────────────
// Treasury Report Builder — customizable report with a live paper preview and
// WYSIWYG multi-page PDF export.
//   • Left: controls (period, sections, chart, density, paper, orientation,
//     accent colour, custom titles).
//   • Right: live "paper" preview that updates on every change.
//   • Export: opens a print window built from the SAME document generator +
//     the SAME stylesheet, so the PDF matches the preview exactly. @page rules
//     handle real multi-page pagination.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from './state.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(n) { return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CHURCH = 'Iglesia Restauración Divina';

const ACCENTS = [
  { v: '#345a65', label: 'Verde azulado' },
  { v: '#2a4a9e', label: 'Azul' },
  { v: '#1e6b61', label: 'Verde' },
  { v: '#5c3d9c', label: 'Morado' },
  { v: '#a05a10', label: 'Ámbar' },
  { v: '#394548', label: 'Carbón' },
];

const SECTIONS = [
  { k: 'cover',     label: 'Portada' },
  { k: 'summary',   label: 'Resumen (totales)' },
  { k: 'chart',     label: 'Gráfica mensual' },
  { k: 'monthly',   label: 'Tabla mensual' },
  { k: 'byIncome',  label: 'Ingresos por categoría' },
  { k: 'byExpense', label: 'Gastos por categoría' },
  { k: 'detail',    label: 'Detalle de transacciones' },
];

let config = null;
let data = null;       // { year, months, totIn, totOut, byIncome, byExpense }
let host = null;

export async function mountReportBuilder(root) {
  host = root;
  if (!config) config = {
    year: new Date().getFullYear(),
    title: 'Reporte de Tesorería',
    subtitle: '',
    sections: { cover: true, summary: true, chart: true, monthly: true, byIncome: true, byExpense: true, detail: false },
    accent: '#345a65',
    density: 'comfortable',
    paper: 'letter',
    orientation: 'portrait',
  };
  ensureReportStyles();
  root.innerHTML = `
    <div class="rb">
      <aside class="rb-controls" id="rbControls"></aside>
      <div class="rb-stage"><div class="rb-paperwrap"><div class="rb-paper" id="rbPaper"></div></div></div>
    </div>`;
  renderControls();
  await loadData();
  renderPreview();
}

async function loadData() {
  const y = config.year;
  const yStart = `${y}-01-01`, yEnd = `${y}-12-31`;
  const [inc, exp] = await Promise.all([
    sb.from('fin_income').select('occurred_on,source,fund,amount').gte('occurred_on', yStart).lte('occurred_on', yEnd).order('occurred_on'),
    sb.from('fin_expenses').select('occurred_on,payee,category,ministry_id,label,amount').gte('occurred_on', yStart).lte('occurred_on', yEnd).order('occurred_on'),
  ]);
  const incRows = inc.data || [], expRows = exp.data || [];
  const months = Array.from({ length: 12 }, () => ({ in: 0, out: 0, income: [], expense: [] }));
  incRows.forEach(r => { const i = +r.occurred_on.slice(5, 7) - 1; months[i].in += +r.amount || 0; months[i].income.push(r); });
  expRows.forEach(r => { const i = +r.occurred_on.slice(5, 7) - 1; months[i].out += +r.amount || 0; months[i].expense.push(r); });
  const group = (rows, keyFn) => {
    const m = {}; rows.forEach(r => { const k = keyFn(r) || '—'; m[k] = (m[k] || 0) + (+r.amount || 0); });
    return Object.entries(m).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  };
  data = {
    year: y, months,
    totIn: incRows.reduce((a, r) => a + (+r.amount || 0), 0),
    totOut: expRows.reduce((a, r) => a + (+r.amount || 0), 0),
    byIncome: group(incRows, r => r.source),
    byExpense: group(expRows, r => r.category || (r.label === 'Pastor' ? 'Pastor' : '')),
  };
}

/* ── Controls ──────────────────────────────────────────────────────────────── */
function renderControls() {
  const c = document.getElementById('rbControls');
  const y0 = new Date().getFullYear();
  c.innerHTML = `
    <div class="rb-grp">
      <label class="rb-grp__t">Año</label>
      <select id="rbYear" class="rb-input">${[y0+1,y0,y0-1,y0-2,y0-3].map(y => `<option value="${y}"${y===config.year?' selected':''}>${y}</option>`).join('')}</select>
    </div>
    <div class="rb-grp">
      <label class="rb-grp__t">Título</label>
      <input type="text" id="rbTitle" class="rb-input" value="${esc(config.title)}" placeholder="Reporte de Tesorería">
      <input type="text" id="rbSub" class="rb-input" value="${esc(config.subtitle)}" placeholder="Subtítulo (opcional)" style="margin-top:.4rem">
    </div>
    <div class="rb-grp">
      <label class="rb-grp__t">Secciones</label>
      ${SECTIONS.map(s => `<label class="rb-check"><input type="checkbox" data-sec="${s.k}"${config.sections[s.k]?' checked':''}><span>${s.label}</span></label>`).join('')}
    </div>
    <div class="rb-grp">
      <label class="rb-grp__t">Color de acento</label>
      <div class="rb-swatches">${ACCENTS.map(a => `<button type="button" class="rb-swatch${config.accent===a.v?' on':''}" data-accent="${a.v}" style="background:${a.v}" title="${a.label}" aria-label="${a.label}"></button>`).join('')}</div>
    </div>
    <div class="rb-grp">
      <label class="rb-grp__t">Densidad</label>
      <div class="rb-seg" data-seg="density">
        <button type="button" data-val="comfortable" class="${config.density==='comfortable'?'on':''}">Cómodo</button>
        <button type="button" data-val="compact" class="${config.density==='compact'?'on':''}">Compacto</button>
      </div>
    </div>
    <div class="rb-grp">
      <label class="rb-grp__t">Papel</label>
      <div class="rb-seg" data-seg="paper">
        <button type="button" data-val="letter" class="${config.paper==='letter'?'on':''}">Carta</button>
        <button type="button" data-val="a4" class="${config.paper==='a4'?'on':''}">A4</button>
      </div>
    </div>
    <div class="rb-grp">
      <label class="rb-grp__t">Orientación</label>
      <div class="rb-seg" data-seg="orientation">
        <button type="button" data-val="portrait" class="${config.orientation==='portrait'?'on':''}">Vertical</button>
        <button type="button" data-val="landscape" class="${config.orientation==='landscape'?'on':''}">Horizontal</button>
      </div>
    </div>
    <button class="btn btn--primary rb-export" id="rbExport"><i class="fas fa-file-pdf"></i> Descargar PDF</button>`;

  c.querySelector('#rbYear').addEventListener('change', async e => { config.year = +e.target.value; await loadData(); renderPreview(); });
  c.querySelector('#rbTitle').addEventListener('input', e => { config.title = e.target.value; renderPreview(); });
  c.querySelector('#rbSub').addEventListener('input', e => { config.subtitle = e.target.value; renderPreview(); });
  c.querySelectorAll('[data-sec]').forEach(cb => cb.addEventListener('change', () => { config.sections[cb.dataset.sec] = cb.checked; renderPreview(); }));
  c.querySelectorAll('[data-accent]').forEach(b => b.addEventListener('click', () => { config.accent = b.dataset.accent; renderControls(); renderPreview(); }));
  c.querySelectorAll('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { config[seg.dataset.seg] = b.dataset.val; renderControls(); renderPreview(); })));
  c.querySelector('#rbExport').addEventListener('click', exportPDF);
}

/* ── Preview ───────────────────────────────────────────────────────────────── */
function renderPreview() {
  const paper = document.getElementById('rbPaper');
  if (!paper || !data) return;
  paper.className = `rb-paper rb-paper--${config.paper} rb-paper--${config.orientation} rb-density-${config.density}`;
  paper.style.setProperty('--rb-accent', config.accent);
  paper.innerHTML = `<div class="rb-doc">${buildDoc()}</div>`;
}

/* ── Shared document generator (preview + PDF use this) ─────────────────────── */
function buildDoc() {
  const s = config.sections;
  const out = [];
  const bal = data.totIn - data.totOut;

  if (s.cover) {
    const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    out.push(`<section class="rb-sec rb-cover">
      <div class="rb-cover__brand">${esc(CHURCH)}</div>
      <h1 class="rb-cover__title">${esc(config.title || 'Reporte de Tesorería')}</h1>
      ${config.subtitle ? `<div class="rb-cover__sub">${esc(config.subtitle)}</div>` : ''}
      <div class="rb-cover__year">${data.year}</div>
      <div class="rb-cover__meta">Generado el ${today}</div>
    </section>`);
  }
  if (s.summary) {
    out.push(`<section class="rb-sec"><h2 class="rb-h2">Resumen del año ${data.year}</h2>
      <div class="rb-kpis">
        ${kpi('Ingresos totales', fmt(data.totIn), 'pos')}
        ${kpi('Gastos totales', fmt(data.totOut), 'neg')}
        ${kpi('Balance', fmt(bal), bal < 0 ? 'neg' : 'pos')}
      </div></section>`);
  }
  if (s.chart) {
    const max = Math.max(1, ...data.months.map(m => Math.max(m.in, m.out)));
    out.push(`<section class="rb-sec"><h2 class="rb-h2">Ingresos y gastos por mes</h2>
      <div class="rb-chart">${data.months.map((m, i) => `
        <div class="rb-chart__col"><div class="rb-chart__bars">
          <div class="rb-chart__bar in"  style="height:${Math.round(m.in/max*100)}%"></div>
          <div class="rb-chart__bar out" style="height:${Math.round(m.out/max*100)}%"></div>
        </div><span class="rb-chart__lbl">${MONTHS[i].slice(0,3)}</span></div>`).join('')}</div>
      <div class="rb-legend"><span><i class="in"></i> Ingresos</span><span><i class="out"></i> Gastos</span></div>
    </section>`);
  }
  if (s.monthly) {
    let ytd = 0;
    const rows = data.months.map((m, i) => {
      const b = m.in - m.out; ytd += b; const has = m.in || m.out;
      const detail = (s.detail && has) ? `<tr class="rb-detail"><td colspan="5">
        ${m.income.map(r => `<div class="rb-ln"><span>+ ${fmtDate(r.occurred_on)} · ${esc(r.source)}${r.fund?` · ${esc(r.fund)}`:''}</span><span class="pos">${fmt(r.amount)}</span></div>`).join('')}
        ${m.expense.map(r => `<div class="rb-ln"><span>− ${fmtDate(r.occurred_on)} · ${esc(r.payee || r.category || '—')}</span><span class="neg">${fmt(r.amount)}</span></div>`).join('')}
      </td></tr>` : '';
      return `<tr><td>${MONTHS[i]}</td><td class="r pos">${m.in?fmt(m.in):'—'}</td><td class="r neg">${m.out?fmt(m.out):'—'}</td>
        <td class="r">${has?fmt(b):'—'}</td><td class="r">${fmt(ytd)}</td></tr>${detail}`;
    }).join('');
    out.push(`<section class="rb-sec"><h2 class="rb-h2">Detalle mensual</h2>
      <table class="rb-table"><thead><tr><th>Mes</th><th class="r">Ingresos</th><th class="r">Gastos</th><th class="r">Balance</th><th class="r">Acumulado</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Total</th><th class="r pos">${fmt(data.totIn)}</th><th class="r neg">${fmt(data.totOut)}</th><th class="r">${fmt(bal)}</th><th></th></tr></tfoot></table></section>`);
  }
  if (s.byIncome) out.push(breakdown('Ingresos por categoría', data.byIncome, data.totIn, 'pos'));
  if (s.byExpense) out.push(breakdown('Gastos por categoría', data.byExpense, data.totOut, 'neg'));

  return out.join('') || '<section class="rb-sec"><p class="rb-empty">Activa al menos una sección.</p></section>';
}
function kpi(label, val, cls) { return `<div class="rb-kpi"><div class="rb-kpi__v ${cls}">${val}</div><div class="rb-kpi__l">${label}</div></div>`; }
function breakdown(title, rows, total, cls) {
  if (!rows.length) return `<section class="rb-sec"><h2 class="rb-h2">${title}</h2><p class="rb-empty">Sin datos.</p></section>`;
  const max = Math.max(1, ...rows.map(r => r.total));
  return `<section class="rb-sec"><h2 class="rb-h2">${title}</h2>
    <div class="rb-break">${rows.map(r => `
      <div class="rb-break__row">
        <span class="rb-break__lbl">${esc(r.label)}</span>
        <span class="rb-break__track"><span class="rb-break__fill ${cls}" style="width:${Math.round(r.total/max*100)}%"></span></span>
        <span class="rb-break__val ${cls}">${fmt(r.total)}</span>
        <span class="rb-break__pct">${total ? Math.round(r.total/total*100) : 0}%</span>
      </div>`).join('')}</div></section>`;
}

/* ── PDF export (same doc + same styles → WYSIWYG) ──────────────────────────── */
function exportPDF() {
  const size = config.paper === 'a4' ? 'A4' : 'letter';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(config.title)} ${data.year}</title>
    <style>
      @page { size: ${size} ${config.orientation}; margin: 14mm; }
      html,body{margin:0}
      body{ --rb-accent:${config.accent}; }
      ${REPORT_CSS}
    </style></head>
    <body class="rb-print rb-density-${config.density}"><div class="rb-doc">${buildDoc()}</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para descargar el PDF.'); return; }
  w.document.write(html); w.document.close();
}

/* ── Report content CSS (injected for preview + inlined for PDF) ────────────── */
function ensureReportStyles() {
  if (document.getElementById('rb-report-styles')) return;
  const el = document.createElement('style');
  el.id = 'rb-report-styles';
  // All report rules live under .rb-doc, so the preview copy can't leak into
  // the admin UI. Print reuses the exact same string.
  el.textContent = REPORT_CSS;
  document.head.appendChild(el);
}

const REPORT_CSS = `
.rb-doc{ font-family:-apple-system,"Segoe UI",Arial,sans-serif; color:#1f2a2e; font-size:12px; line-height:1.5; }
.rb-sec{ margin:0 0 22px; break-inside:avoid; }
.rb-cover{ text-align:center; padding:60px 20px 40px; border-bottom:3px solid var(--rb-accent); margin-bottom:26px; break-after:avoid; }
.rb-cover__brand{ font-size:13px; letter-spacing:.16em; text-transform:uppercase; color:var(--rb-accent); font-weight:700; }
.rb-cover__title{ font-size:30px; font-weight:800; margin:14px 0 4px; letter-spacing:-.01em; }
.rb-cover__sub{ font-size:15px; color:#5a6a70; }
.rb-cover__year{ font-size:52px; font-weight:800; color:var(--rb-accent); margin:18px 0 2px; letter-spacing:-.02em; }
.rb-cover__meta{ font-size:11px; color:#8a979c; }
.rb-h2{ font-size:15px; font-weight:800; color:var(--rb-accent); margin:0 0 12px; padding-bottom:6px; border-bottom:2px solid color-mix(in srgb,var(--rb-accent) 22%,transparent); }
.rb-kpis{ display:flex; gap:12px; }
.rb-kpi{ flex:1; border:1px solid #e2e7e9; border-radius:10px; padding:14px 16px; }
.rb-kpi__v{ font-size:22px; font-weight:800; letter-spacing:-.02em; }
.rb-kpi__l{ font-size:11px; color:#6a767b; font-weight:600; margin-top:3px; }
.rb-chart{ display:flex; align-items:flex-end; gap:6px; height:150px; }
.rb-chart__col{ flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; }
.rb-chart__bars{ flex:1; width:100%; display:flex; align-items:flex-end; justify-content:center; gap:3px; }
.rb-chart__bar{ width:42%; max-width:13px; min-height:2px; border-radius:3px 3px 0 0; }
.rb-chart__bar.in{ background:var(--rb-accent); } .rb-chart__bar.out{ background:#b02030; }
.rb-chart__lbl{ font-size:9px; color:#8a979c; }
.rb-legend{ display:flex; gap:18px; justify-content:center; margin-top:10px; font-size:11px; color:#6a767b; }
.rb-legend i{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; }
.rb-legend i.in{ background:var(--rb-accent); } .rb-legend i.out{ background:#b02030; }
.rb-table{ width:100%; border-collapse:collapse; font-size:11.5px; }
.rb-table th,.rb-table td{ padding:6px 9px; border-bottom:1px solid #e9edee; text-align:left; }
.rb-table th.r,.rb-table td.r{ text-align:right; font-variant-numeric:tabular-nums; }
.rb-table thead th{ font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; color:#7a868b; }
.rb-table tfoot th{ border-top:2px solid #cfd6d8; font-size:11.5px; }
.rb-detail td{ background:#f7f9f9; padding:5px 16px; }
.rb-ln{ display:flex; justify-content:space-between; gap:12px; font-size:10.5px; color:#5a6a70; padding:2px 0; }
.rb-break{ display:flex; flex-direction:column; gap:8px; }
.rb-break__row{ display:flex; align-items:center; gap:10px; }
.rb-break__lbl{ width:34%; font-size:11.5px; }
.rb-break__track{ flex:1; height:14px; background:#eef1f2; border-radius:99px; overflow:hidden; }
.rb-break__fill{ display:block; height:100%; border-radius:99px; }
.rb-break__fill.pos{ background:var(--rb-accent); } .rb-break__fill.neg{ background:#b02030; }
.rb-break__val{ width:88px; text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }
.rb-break__pct{ width:38px; text-align:right; font-size:10.5px; color:#8a979c; }
.rb-doc .pos{ color:#1e6b61; } .rb-doc .neg{ color:#b02030; }
.rb-empty{ color:#8a979c; font-size:12px; }
.rb-density-compact .rb-sec{ margin-bottom:14px; }
.rb-density-compact .rb-table th,.rb-density-compact .rb-table td{ padding:4px 8px; }
.rb-density-compact .rb-cover{ padding:30px 20px 24px; }
`;
