import { esc } from '/js/utils/escape.js';
// js/pages/admin/project-treasury.js
// ─────────────────────────────────────────────────────────────────────────────
// Per-user "project" treasury for ministry accounts. Each user creates their
// own projects (Youth, Kids, Event…) and tracks income + expenses per project,
// each with a running balance. Entries are ordinary fin_income / fin_expenses
// rows tagged with project_id, so the church treasurer's full books include
// them automatically. RLS (20260701_fin_projects.sql) scopes a user to their
// own projects; treasurer/admin see everything.
//
// Each ministry the account is assigned to also gets its OWN tab once the
// treasurer gives it a budget: a fin_projects row with ministry_id set
// (auto-created here). Its income is seeded read-only from the church's
// allocations to that ministry; its gastos are the leader's own entries. See
// 20260704_ministry_budget_projects.sql.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, currentUser, currentProfile, ministries, MONTHS } from './state.js';
import { toast, confirm } from './ui.js';
import { openFormWizard } from './form-wizard.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { savePdf, churchDocDef, sectionHeading, kpiBox, th, churchLogo, CONTENT_W } from '/js/lib/pdf.js';

const fmt = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const sum = rows => (rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
// Internal linkage tags (auto:recurring / auto:budget / auto:payable) live in
// `note` on the treasurer's rows — never show them to the leader.
const cleanNote = n => (n && !String(n).startsWith('auto:')) ? n : '';
function entrySub(e) {
  if (e.locked) return '<span class="trez-sub">Asignado por la tesorería</span>';
  const n = cleanNote(e.note);
  return n ? `<span class="trez-sub">${esc(n)}</span>` : '';
}
function todayISO() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; }
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
const PALETTE = ['#345a65', '#2a4a9e', '#5c3d9c', '#a05a10', '#1e6b61', '#b02030', '#475569'];

let projects = [];
let activeId = 'resumen';   // 'resumen' or a project id

export async function mountProjectTreasury() {
  const root = document.getElementById('treasuryBody');
  if (!root) return;
  // Projects are all-time — hide the month picker the full books use.
  const mInp = document.getElementById('trezMonth');
  if (mInp) { const bar = mInp.closest('div'); if (bar) bar.style.display = 'none'; }

  root.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  await loadProjects();
  await ensureMinistryProjects();          // give each budgeted ministry its own tab
  if (!projects.some(p => p.id === activeId)) activeId = 'resumen';
  renderNav();
  render();
}

async function loadProjects() {
  const { data } = await sb.from('fin_projects').select('*')
    .eq('owner_id', currentUser?.id).eq('archived', false).order('created_at');
  projects = data || [];
}

// The ministries this user leads (a leader can hold several, e.g. Youth + Kids).
// Falls back to the legacy single ministry_id for un-migrated profiles.
function myMinistryIds() {
  const ids = currentProfile?.ministry_ids;
  if (Array.isArray(ids) && ids.length) return ids;
  return currentProfile?.ministry_id ? [currentProfile.ministry_id] : [];
}

// A ministry the account leads becomes its own budget tab the first time the
// treasurer allocates it a budget (a recurring payment or a one-off expense).
// We reuse an identically-named project the user may have created (adopt it)
// rather than showing two tabs with the same name.
async function ensureMinistryProjects() {
  const mids = myMinistryIds();
  if (!mids.length) return;
  // Best-effort: if migration 20260704 (fin_projects.ministry_id) isn't applied
  // yet, skip silently so the treasury still renders the user's own projects.
  try {
    const haveMinistry = new Set(projects.filter(p => p.ministry_id).map(p => p.ministry_id));

    const [recRes, expRes] = await Promise.all([
      sb.from('fin_recurring').select('ministry_id').in('ministry_id', mids).eq('active', true),
      sb.from('fin_expenses').select('ministry_id').is('project_id', null).in('ministry_id', mids),
    ]);
    const budgeted = new Set([...(recRes.data || []), ...(expRes.data || [])]
      .map(r => r.ministry_id).filter(Boolean));

    let changed = false;
    for (const mid of budgeted) {
      if (haveMinistry.has(mid)) continue;
      const name = ministries.find(m => m.id === mid)?.name || 'Ministerio';
      const dup = projects.find(p => !p.ministry_id && (p.name || '').trim().toLowerCase() === name.trim().toLowerCase());
      const res = dup
        ? await sb.from('fin_projects').update({ ministry_id: mid }).eq('id', dup.id)
        : await sb.from('fin_projects').insert({
            owner_id: currentUser?.id, name, ministry_id: mid,
            color: PALETTE[projects.length % PALETTE.length], icon: 'fa-hand-holding-dollar',
          });
      if (res?.error) throw res.error;
      changed = true;
    }
    if (changed) await loadProjects();
  } catch { /* column/migration not present yet — degrade to projects-only */ }
}

function renderNav() {
  const nav = document.getElementById('trezSubnav');
  if (!nav) return;
  // Ministry budgets first, then the user's own projects.
  const ordered = [...projects.filter(p => p.ministry_id), ...projects.filter(p => !p.ministry_id)];
  const tabs = [{ id: 'resumen', name: 'Resumen', icon: 'fa-chart-pie' },
    ...ordered.map(p => ({ id: p.id, name: p.name, icon: p.icon || 'fa-folder' }))];
  nav.innerHTML = tabs.map(t =>
    `<button class="trez-subnav__btn${t.id === activeId ? ' active' : ''}" data-proj="${t.id}">
       <i class="fas ${esc(t.icon)}"></i> ${esc(t.name)}</button>`).join('')
    + `<button class="trez-subnav__btn" data-proj="__new"><i class="fas fa-plus"></i> Nuevo</button>`;
  nav.querySelectorAll('[data-proj]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.proj === '__new') return newProject();
    activeId = b.dataset.proj; renderNav(); render();
  }));
}

function render() {
  return activeId === 'resumen' ? renderResumen() : renderProject(activeId);
}

async function projectTotals() {
  const ids = projects.map(p => p.id);
  const t = {};
  projects.forEach(p => t[p.id] = { income: 0, expense: 0 });
  if (ids.length) {
    const [inc, exp] = await Promise.all([
      sb.from('fin_income').select('project_id,amount').in('project_id', ids),
      sb.from('fin_expenses').select('project_id,amount').in('project_id', ids),
    ]);
    (inc.data || []).forEach(r => { if (t[r.project_id]) t[r.project_id].income += Number(r.amount || 0); });
    (exp.data || []).forEach(r => { if (t[r.project_id]) t[r.project_id].expense += Number(r.amount || 0); });
  }
  // Church budget seeds income for ministry projects (read-only).
  const minIds = projects.filter(p => p.ministry_id).map(p => p.ministry_id);
  const budgets = await ministryBudgets(minIds);
  projects.forEach(p => { if (p.ministry_id && budgets[p.ministry_id]) t[p.id].income += budgets[p.ministry_id]; });
  return t;
}

function tiles(income, expense) {
  const balance = income - expense;
  const items = [
    { icon: 'fa-arrow-down', cls: 'in',  num: fmt(income),  label: 'Ingresos' },
    { icon: 'fa-arrow-up',   cls: 'out', num: fmt(expense), label: 'Gastos' },
    { icon: 'fa-scale-balanced', cls: balance >= 0 ? 'in' : 'out', num: fmt(balance), label: 'Balance' },
  ];
  return `<div class="trez-tiles">${items.map(t => `
    <div class="trez-tile trez-tile--${t.cls}">
      <span class="trez-tile__icon"><i class="fas ${t.icon}"></i></span>
      <span class="trez-tile__num">${t.num}</span><span class="trez-tile__label">${t.label}</span>
    </div>`).join('')}</div>`;
}

// Church allocations to a set of ministries (read-only budget income for the
// leader): treasurer's project_id-IS-NULL expenses tagged to that ministry.
// Returns { ministry_id: amount }.
async function ministryBudgets(minIds) {
  const out = {};
  if (!minIds.length) return out;
  const { data } = await sb.from('fin_expenses').select('ministry_id,amount')
    .is('project_id', null).in('ministry_id', minIds);
  (data || []).forEach(r => { out[r.ministry_id] = (out[r.ministry_id] || 0) + Number(r.amount || 0); });
  return out;
}

// A clickable card for a project/ministry with a live balance.
function projCard(p, totals, opts = {}) {
  const t = totals[p.id] || { income: 0, expense: 0 };
  const bal = t.income - t.expense;
  return `<button class="trez-projcard" data-open="${p.id}" style="--preset-color:${esc(p.color || '#475569')}">
    <span class="trez-projcard__head"><span class="trez-projcard__icon"><i class="fas ${esc(p.icon || 'fa-folder')}"></i></span>${esc(opts.name || p.name)}</span>
    <span class="trez-projcard__bal ${bal < 0 ? 'neg' : 'pos'}">${fmt(bal)}</span>
    <span class="trez-projcard__row"><span>${opts.inLabel || 'Entró'}</span><span class="pos">${fmt(t.income)}</span></span>
    <span class="trez-projcard__row"><span>Gastado</span><span class="neg">${fmt(t.expense)}</span></span>
  </button>`;
}

async function renderResumen() {
  const root = document.getElementById('treasuryBody');
  if (!root) return;
  root.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  const totals = await projectTotals();

  const mids = myMinistryIds();
  const projByMin = new Map(projects.filter(p => p.ministry_id).map(p => [p.ministry_id, p]));
  const regProjects = projects.filter(p => !p.ministry_id);

  // One card per assigned ministry: budgeted ones open their tab; the rest show
  // as "sin presupuesto".
  const minCards = mids.map(mid => {
    const name = ministries.find(m => m.id === mid)?.name || 'Ministerio';
    const p = projByMin.get(mid);
    if (p) return projCard(p, totals, { name, inLabel: 'Presupuesto' });
    return `<div class="trez-projcard trez-projcard--muted" style="--preset-color:#94a3b8">
      <span class="trez-projcard__head"><span class="trez-projcard__icon"><i class="fas fa-hand-holding-dollar"></i></span>${esc(name)}</span>
      <span class="trez-projcard__bal">${fmt(0)}</span>
      <span class="trez-projcard__row"><span>Sin presupuesto asignado</span><span></span></span>
    </div>`;
  }).join('');

  const minSection = mids.length ? `
    <div class="section-divider"><i class="fas fa-building-columns"></i> Ministerios</div>
    <div class="trez-projgrid">${minCards}</div>` : '';

  const projSection = `
    <div class="section-divider"><i class="fas fa-folder"></i> Proyectos</div>
    ${regProjects.length
      ? `<div class="trez-projgrid">${regProjects.map(p => projCard(p, totals)).join('')}</div>`
      : '<div class="empty-state"><i class="fas fa-folder-plus"></i><p>Crea una carpeta (proyecto) para registrar un presupuesto aparte.</p></div>'}`;

  root.innerHTML = `<p class="trez-lead">Cada ministerio y proyecto lleva su propio presupuesto. Toca uno para ver y registrar sus movimientos.</p>
    ${minSection}${projSection}`;

  root.querySelectorAll('[data-open]').forEach(b =>
    b.addEventListener('click', () => { activeId = b.dataset.open; renderNav(); render(); }));
}

async function renderProject(id) {
  const root = document.getElementById('treasuryBody');
  if (!root) return;
  const p = projects.find(x => x.id === id);
  if (!p) { activeId = 'resumen'; renderNav(); return render(); }

  const isMinistry = !!p.ministry_id;
  root.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  const [inc, exp, bud] = await Promise.all([
    sb.from('fin_income').select('*').eq('project_id', id),
    sb.from('fin_expenses').select('*').eq('project_id', id),
    isMinistry
      ? sb.from('fin_expenses').select('*').is('project_id', null).eq('ministry_id', p.ministry_id)
      : Promise.resolve({ data: [] }),
  ]);
  const budgetRows = bud.data || [];
  const income = sum(inc.data) + sum(budgetRows), expense = sum(exp.data);
  const entries = [
    ...budgetRows.map(r => ({ ...r, kind: 'income',  who: 'Presupuesto de la iglesia', locked: true })),
    ...(inc.data || []).map(r => ({ ...r, kind: 'income',  who: r.source })),
    ...(exp.data || []).map(r => ({ ...r, kind: 'expense', who: r.payee })),
  ].sort((a, b) => String(b.occurred_on || '').localeCompare(String(a.occurred_on || '')));

  root.innerHTML = `
    <div class="trez-projhead">
      <h2 class="trez-projhead__title"><i class="fas ${esc(p.icon || 'fa-folder')}" style="color:${esc(p.color || '#475569')}"></i> ${esc(p.name)}${isMinistry ? ' <span class="trez-projhead__tag">Presupuesto de ministerio</span>' : ''}</h2>
      <div style="display:flex;gap:.4rem;align-items:center">
        <button class="adm-icon-btn" id="projReport" title="Descargar reporte PDF" aria-label="Descargar reporte PDF"><i class="fas fa-file-pdf"></i></button>
        ${isMinistry ? '' : '<button class="adm-icon-btn" id="projMenu" title="Acciones" aria-label="Acciones"><i class="fas fa-ellipsis-vertical"></i></button>'}
      </div>
    </div>
    ${tiles(income, expense)}
    <div class="trez-addbar">
      <button class="btn btn--primary" data-add="income"><i class="fas fa-arrow-down"></i> Ingreso</button>
      <button class="btn btn--secondary" data-add="expense"><i class="fas fa-arrow-up"></i> Gasto</button>
    </div>
    ${entries.length ? `<div class="trez-tablewrap"><table class="trez-table">
      <thead><tr><th>Fecha</th><th>Detalle</th><th class="num">Monto</th><th></th></tr></thead>
      <tbody>${entries.map(e => `
        <tr><td>${fmtDate(e.occurred_on)}</td>
          <td>${esc(e.who || (e.kind === 'income' ? 'Ingreso' : 'Gasto'))}${entrySub(e)}</td>
          <td class="num ${e.kind === 'income' ? 'pos' : 'neg'}">${e.kind === 'income' ? '+' : '−'}${fmt(e.amount)}</td>
          <td class="row-act">${e.locked
            ? '<span class="trez-sub" title="Asignado por la tesorería"><i class="fas fa-lock"></i></span>'
            : `<button class="adm-icon-btn" data-del="${e.kind}:${e.id}" title="Eliminar"><i class="fas fa-ellipsis-vertical"></i></button>`}</td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fas fa-inbox"></i><p>Sin movimientos todavía. Agrega un ingreso o un gasto.</p></div>'}`;

  root.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addEntry(b.dataset.add, id)));
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const [kind, eid] = b.dataset.del.split(':');
    deleteEntry(kind, eid);
  }));
  document.getElementById('projReport')?.addEventListener('click', () =>
    isMinistry ? openMinistryReport(p) : generateProjectReport(p, null));
  document.getElementById('projMenu')?.addEventListener('click', () => showActionSheet({
    trigger: document.getElementById('projMenu'), title: p.name,
    actions: [
      { label: 'Renombrar', icon: 'fa-pen', onClick: () => renameProject(p) },
      { label: 'Eliminar proyecto', icon: 'fa-trash', variant: 'danger', onClick: () => deleteProject(p) },
    ],
  }));
}

// ── Actions ──────────────────────────────────────────────────────────────────
function addEntry(kind, projectId) {
  const isIncome = kind === 'income';
  openFormWizard({
    title: isIncome ? 'Agregar ingreso' : 'Agregar gasto',
    icon: isIncome ? 'fa-arrow-down' : 'fa-arrow-up',
    submitLabel: 'Guardar',
    data: {},
    steps: [
      { label: isIncome ? '¿Cuánto entró al presupuesto?' : '¿Cuánto se gastó?', fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
      { label: isIncome ? '¿De dónde vino?' : '¿En qué se gastó?',
        fields: [{ id: 'who', label: isIncome ? 'Fuente' : 'Concepto', type: 'text',
          placeholder: isIncome ? 'Ej. Presupuesto de la iglesia, donación' : 'Ej. Materiales, comida, transporte' }] },
      { label: '¿Qué día?', fields: [{ id: 'occurred_on', label: 'Fecha', type: 'date', default: todayISO() }] },
      { label: 'Nota (opcional)', fields: [{ id: 'note', label: 'Nota', type: 'textarea' }] },
    ],
    onSubmit: (d) => {
      const base = {
        occurred_on: d.occurred_on || todayISO(), amount: Number(d.amount),
        note: (d.note || '').trim() || null, project_id: projectId, created_by: currentUser?.id || null,
      };
      return isIncome
        ? sb.from('fin_income').insert({ ...base, source: (d.who || '').trim() || 'Ingreso', fund: null })
        : sb.from('fin_expenses').insert({ ...base, payee: (d.who || '').trim() || null, ministry_id: null, label: null, category: 'Proyecto', status: 'paid' });
    },
    onDone: () => render(),
  });
}

async function deleteEntry(kind, id) {
  if (!await confirm('Eliminar', '¿Eliminar este movimiento? No se puede deshacer.')) return;
  const table = kind === 'income' ? 'fin_income' : 'fin_expenses';
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Eliminado', 'success'); render();
}

function newProject() {
  openFormWizard({
    title: 'Nuevo proyecto', icon: 'fa-folder-plus', submitLabel: 'Crear proyecto',
    data: {},
    steps: [{ label: '¿Cómo se llama el proyecto?', hint: 'Ej. Jóvenes, Niños, Evento especial',
      fields: [{ id: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Jóvenes' }] }],
    onSubmit: (d) => sb.from('fin_projects').insert({
      owner_id: currentUser?.id, name: (d.name || '').trim(),
      color: PALETTE[projects.length % PALETTE.length], icon: 'fa-folder',
    }),
    onDone: async () => { await loadProjects(); activeId = projects[projects.length - 1]?.id || 'resumen'; renderNav(); render(); },
  });
}

function renameProject(p) {
  openFormWizard({
    title: 'Renombrar proyecto', icon: 'fa-pen', submitLabel: 'Guardar',
    data: { name: p.name },
    steps: [{ label: 'Nuevo nombre', fields: [{ id: 'name', label: 'Nombre', type: 'text', required: true }] }],
    onSubmit: (d) => sb.from('fin_projects').update({ name: (d.name || '').trim() }).eq('id', p.id),
    onDone: async () => { await loadProjects(); renderNav(); render(); },
  });
}

async function deleteProject(p) {
  if (!await confirm('Eliminar proyecto',
    `¿Eliminar "${p.name}"? Sus ingresos y gastos quedarán sin proyecto (no se borran). No se puede deshacer.`)) return;
  const { error } = await sb.from('fin_projects').delete().eq('id', p.id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Proyecto eliminado', 'success');
  activeId = 'resumen';
  await loadProjects(); renderNav(); render();
}

// ── PDF report (shared standard, /js/lib/pdf.js) ──────────────────────────────
// Projects are all-time; ministries offer a monthly or yearly report only.
function reportRange(kind, val) {
  const pad = (n) => String(n).padStart(2, '0');
  if (kind === 'month') {
    const [y, m] = val.split('-').map(Number);
    const ld = new Date(y, m, 0).getDate();
    return { start: `${val}-01`, end: `${val}-${pad(ld)}`, label: `${MONTHS[m - 1]} ${y}` };
  }
  if (kind === 'year') return { start: `${val}-01-01`, end: `${val}-12-31`, label: `Año ${val}` };
  return null;   // all-time
}

// Ministry report: ask monthly-or-yearly (the only two options), then generate.
function openMinistryReport(p) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
  });
  const years = [0, 1, 2, 3].map((k) => ({ value: String(now.getFullYear() - k), label: String(now.getFullYear() - k) }));
  openFormWizard({
    title: `Reporte de ${p.name}`, icon: 'fa-file-pdf', submitLabel: 'Descargar PDF',
    data: { period: 'month', month: months[0].value, year: years[0].value },
    steps: [
      { label: '¿Qué período?', fields: [{ id: 'period', type: 'choice', default: 'month', options: [
        { value: 'month', label: 'Mensual', desc: 'Un mes', icon: 'fa-calendar-days' },
        { value: 'year', label: 'Anual', desc: 'Todo el año', icon: 'fa-calendar' }] }] },
      { label: '¿Cuál?', fields: [
        { id: 'month', label: 'Mes', type: 'select', showIf: (d) => d.period === 'month', options: months },
        { id: 'year', label: 'Año', type: 'select', showIf: (d) => d.period === 'year', options: years }] },
    ],
    onSubmit: (d) => generateProjectReport(p, reportRange(d.period, d.period === 'month' ? d.month : d.year)),
  });
}

async function generateProjectReport(p, range) {
  const isMinistry = !!p.ministry_id;
  const inRange = (d) => !range || (d && d >= range.start && d <= range.end);
  const [inc, exp, bud] = await Promise.all([
    sb.from('fin_income').select('*').eq('project_id', p.id),
    sb.from('fin_expenses').select('*').eq('project_id', p.id),
    isMinistry
      ? sb.from('fin_expenses').select('*').is('project_id', null).eq('ministry_id', p.ministry_id)
      : Promise.resolve({ data: [] }),
  ]);
  const budgetRows = (bud.data || []).filter((r) => inRange(r.occurred_on));
  const incomeRows = (inc.data || []).filter((r) => inRange(r.occurred_on));
  const expenseRows = (exp.data || []).filter((r) => inRange(r.occurred_on));
  const income = sum(budgetRows) + sum(incomeRows);
  const expense = sum(expenseRows);
  const balance = income - expense;

  const entries = [
    ...budgetRows.map((r) => ({ occurred_on: r.occurred_on, who: 'Presupuesto de la iglesia', kind: 'income', amount: r.amount })),
    ...incomeRows.map((r) => ({ occurred_on: r.occurred_on, who: r.source || 'Ingreso', kind: 'income', amount: r.amount })),
    ...expenseRows.map((r) => ({ occurred_on: r.occurred_on, who: r.payee || 'Gasto', kind: 'expense', amount: r.amount })),
  ].sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)));

  const accent = p.color || '#345a65';
  const bodyRows = entries.length
    ? entries.map((e) => [
      { text: fmtDate(e.occurred_on), fontSize: 9 },
      { text: e.who, fontSize: 9, color: e.kind === 'income' ? '#1f2a2e' : '#6a767b' },
      { text: (e.kind === 'income' ? '+' : '−') + fmt(e.amount), alignment: 'right', fontSize: 9, color: e.kind === 'income' ? '#1e6b61' : '#b02030' },
    ])
    : [[{ text: 'Sin movimientos en el período.', colSpan: 3, color: '#8a979c', fontSize: 9 }, {}, {}]];

  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const periodLabel = range ? range.label : 'Todo el período';
  const content = [
    { text: p.name, fontSize: 20, bold: true, alignment: 'center', margin: [0, 6, 0, 2] },
    { text: `${isMinistry ? 'Presupuesto de ministerio' : 'Proyecto'} · ${periodLabel}`, alignment: 'center', color: '#8a979c', fontSize: 10 },
    { text: 'Generado el ' + today, alignment: 'center', color: '#8a979c', fontSize: 9, margin: [0, 1, 0, 12] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 2, lineColor: accent }], margin: [0, 0, 0, 14] },
    { columns: [
      kpiBox(isMinistry ? 'Presupuesto' : 'Ingresos', fmt(income), '#1e6b61', accent),
      kpiBox('Gastos', fmt(expense), '#b02030', accent),
      kpiBox('Balance', fmt(balance), balance < 0 ? '#b02030' : '#1e6b61', accent),
    ], columnGap: 8, margin: [0, 0, 0, 16] },
    sectionHeading('Movimientos', accent),
    { table: { headerRows: 1, widths: ['auto', '*', 'auto'], body: [[th('Fecha'), th('Detalle'), th('Monto', 1)], ...bodyRows] },
      layout: { hLineWidth: (i, node) => (i <= 1 || i >= node.table.body.length) ? 0.8 : 0.4, hLineColor: () => '#e7ecec',
        vLineWidth: () => 0, paddingTop: () => 3.2, paddingBottom: () => 3.2, paddingLeft: () => 6, paddingRight: () => 6 } },
  ];

  const wm = await churchLogo();
  const safe = String(p.name).replace(/[^0-9A-Za-z]+/g, '-');
  const suffix = range ? '-' + range.label.replace(/[^0-9A-Za-z]+/g, '-') : '';
  await savePdf(churchDocDef({ title: `Reporte — ${p.name}`, headRight: periodLabel, content, accent, wm }),
    `Reporte-${safe}${suffix}.pdf`);
}
