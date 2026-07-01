import { esc } from '/js/utils/escape.js';
// js/pages/admin/treasury-tab.js
// "Tesorería" — church-wide treasury + per-ministry MONTHLY budgets.
// Every add/edit is a step-by-step wizard (one question per screen, big
// choices, a review, then save) — same intuitive flow as event/group creation.
// Row actions live behind a ⋮ menu.

import { sb, ministries, currentUser, currentProfile } from './state.js';
import { toast, confirm } from './ui.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { openFormWizard } from './form-wizard.js';
import { mountReportBuilder } from './report-builder.js';
import { mountProjectTreasury } from './project-treasury.js';

/* ── helpers ──────────────────────────────────────────────────────────────── */

function fmt(n) { return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
function todayISO() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; }
function thisMonth() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`; }
function minName(id) { return ministries.find(m => m.id === id)?.name || '—'; }
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const sum = (rows, f = r => r.amount) => (rows || []).reduce((a, r) => a + (Number(f(r)) || 0), 0);
// Internal linkage tags (auto:budget / auto:recurring) live in `note`; never show them.
const cleanNote = n => (n && !String(n).startsWith('auto:')) ? n : '';

const PASTOR = 'Pastor';
// Exclude any ministry literally named "General" — the built-in General option
// already covers it (would otherwise show twice).
const realMinistries = () => ministries.filter(m => (m.name || '').trim().toLowerCase() !== 'general');
function allocChoice() {
  return [{ value: '', label: 'General', icon: 'fa-church' },
    ...realMinistries().map(m => ({ value: m.id, label: m.name, icon: 'fa-people-group' })),
    { value: 'pastor', label: 'Pastor', icon: 'fa-user-tie' }];
}
function allocDecode(v) {
  if (v === 'pastor') return { ministry_id: null, label: PASTOR };
  if (v) return { ministry_id: v, label: null };
  return { ministry_id: null, label: null };
}
function allocEncode(row) { return row?.label === PASTOR ? 'pastor' : (row?.ministry_id || ''); }
function allocName(row) { return row?.label ? row.label : (row?.ministry_id ? minName(row.ministry_id) : 'General'); }
function ministrySelectOpts() { return [{ value: '', label: 'General' }, ...realMinistries().map(m => ({ value: m.id, label: m.name }))]; }

const SUBS = [
  { k: 'resumen',   label: 'Resumen',      icon: 'fa-chart-pie' },
  { k: 'income',    label: 'Ingresos',     icon: 'fa-arrow-down' },
  { k: 'expenses',  label: 'Gastos',       icon: 'fa-arrow-up' },
  { k: 'recurring', label: 'Recurrentes',  icon: 'fa-rotate' },
  { k: 'payables',  label: 'Por pagar',    icon: 'fa-file-invoice-dollar' },
  { k: 'reports',   label: 'Reportes',     icon: 'fa-calendar-days' },
  { k: 'notes',     label: 'Notas',        icon: 'fa-note-sticky' },
  { k: 'config',    label: 'Configurar',   icon: 'fa-gear' },
];

let sub = 'resumen';
let monthKey = thisMonth();
const cache = {};

// Church fund-accounting lists (editable in Configurar)
let FUNDS = [], INCOME_CATS = [], EXPENSE_CATS = [];
async function loadFundData() {
  const [f, i, e] = await Promise.all([
    sb.from('fin_funds').select('*').eq('archived', false).order('sort').order('name'),
    sb.from('fin_income_categories').select('*').eq('archived', false).order('sort').order('name'),
    sb.from('fin_expense_categories').select('*').eq('archived', false).order('sort').order('name'),
  ]);
  FUNDS = f.data || []; INCOME_CATS = i.data || []; EXPENSE_CATS = e.data || [];
}

const year   = () => monthKey.slice(0, 4);
const mStart = () => `${monthKey}-01`;
const mEnd   = () => { const [y, m] = monthKey.split('-').map(Number); return `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`; };
const yStart = () => `${year()}-01-01`;
const yEnd   = () => `${year()}-12-31`;
const monthLbl = () => { const [y, m] = monthKey.split('-').map(Number); return `${MONTHS[m-1]} ${y}`; };

export async function loadTreasury() {
  // Ministry users (non-finance) get the scoped per-project tracker instead of
  // the full church books.
  if (currentProfile?.role !== 'admin' && currentProfile?.role !== 'treasurer') {
    return mountProjectTreasury();
  }
  await loadFundData();
  await ensureRecurringForMonth(monthKey);
  const inp = document.getElementById('trezMonth');
  if (inp && !inp.value) {
    inp.value = monthKey;
    inp.addEventListener('change', async () => { monthKey = inp.value || thisMonth(); await ensureRecurringForMonth(monthKey); render(); });
  }
  const nav = document.getElementById('trezSubnav');
  if (nav) {
    nav.innerHTML = SUBS.map(s =>
      `<button class="trez-subnav__btn${s.k === sub ? ' active' : ''}" data-sub="${s.k}"><i class="fas ${s.icon}"></i> ${s.label}</button>`).join('');
    nav.querySelectorAll('[data-sub]').forEach(b =>
      b.addEventListener('click', () => { sub = b.dataset.sub; syncNav(); render(); }));
  }
  render();
}
function syncNav() {
  document.querySelectorAll('#trezSubnav .trez-subnav__btn').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
}
function render() {
  const root = document.getElementById('treasuryBody');
  if (!root) return;
  root.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  // Reportes uses the full screen width on desktop.
  document.getElementById('tab-treasury')?.classList.toggle('trez-wide', sub === 'reports');
  ({ resumen: renderResumen, income: renderIncome, expenses: renderExpenses, recurring: renderRecurring,
     payables: renderPayables, reports: mountReportBuilder, notes: renderNotes,
     config: renderConfig }[sub] || renderResumen)(root);
}

/* ── Resumen (selected month) ──────────────────────────────────────────────── */
async function renderResumen(root) {
  const [inc, exp, pay] = await Promise.all([
    sb.from('fin_income').select('amount').is('project_id', null).gte('occurred_on', mStart()).lte('occurred_on', mEnd()),
    sb.from('fin_expenses').select('amount,ministry_id,label').is('project_id', null).gte('occurred_on', mStart()).lte('occurred_on', mEnd()),
    sb.from('fin_payables').select('amount').eq('status', 'open'),
  ]);
  if (inc.error || exp.error) { root.innerHTML = errBox(inc.error || exp.error); return; }

  const income = sum(inc.data), expenses = sum(exp.data), owed = sum(pay.data), balance = income - expenses;
  const spentByMin = {}; let spentPastor = 0, spentGeneral = 0;
  (exp.data || []).forEach(e => {
    if (e.label === PASTOR)   spentPastor  += Number(e.amount || 0);
    else if (!e.ministry_id)  spentGeneral += Number(e.amount || 0);
    else spentByMin[e.ministry_id] = (spentByMin[e.ministry_id] || 0) + Number(e.amount || 0);
  });

  // Spending broken out by line (General + each ministry + Pastor). No budgets.
  const lines = [{ name: 'General', spent: spentGeneral },
    ...ministries.map(m => ({ name: m.name, spent: spentByMin[m.id] || 0 })),
    { name: 'Pastor (estipendio)', spent: spentPastor }];
  const rows = lines.filter(r => r.spent);

  const tiles = [
    { icon: 'fa-arrow-down', cls: 'in',  num: fmt(income),   label: `Ingresos · ${monthLbl()}` },
    { icon: 'fa-arrow-up',   cls: 'out', num: fmt(expenses), label: `Gastos · ${monthLbl()}` },
    { icon: 'fa-scale-balanced', cls: balance >= 0 ? 'in' : 'out', num: fmt(balance), label: 'Balance del mes' },
    { icon: 'fa-file-invoice-dollar', cls: 'owe', num: fmt(owed), label: 'Por pagar' },
  ];

  root.innerHTML = `
    <div class="trez-tiles">
      ${tiles.map(t => `<div class="trez-tile trez-tile--${t.cls}">
        <span class="trez-tile__icon"><i class="fas ${t.icon}"></i></span>
        <span class="trez-tile__num">${t.num}</span><span class="trez-tile__label">${t.label}</span></div>`).join('')}
    </div>
    <div class="trez-card">
      <h3 class="trez-card__title"><i class="fas fa-arrow-up"></i> Gastos por línea · ${monthLbl()}</h3>
      ${rows.length ? `<div class="trez-budtable">${rows.map(r => `
        <div class="trez-budrow">
          <div class="trez-budrow__head"><span class="trez-budrow__name">${esc(r.name)}</span>
            <span class="trez-budrow__nums">${fmt(r.spent)}</span></div>
        </div>`).join('')}</div>`
        : `<div class="empty-state"><i class="fas fa-arrow-up"></i><p>Aún no hay gastos para ${monthLbl()}.</p></div>`}
    </div>`;
}

/* ── Wizard specs ──────────────────────────────────────────────────────────── */
const WIZ = {
  income: () => ({
    title: 'Nuevo ingreso', editTitle: 'Editar ingreso', icon: 'fa-arrow-down', submitLabel: 'Guardar ingreso',
    steps: [
      { label: '¿Cuánto dinero se recibió?', hint: 'Escribe la cantidad.', fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
      { label: '¿De dónde vino?', hint: INCOME_CATS.length ? '' : 'Agrega categorías de ingreso en Configurar.',
        fields: [{ id: 'source', label: 'Fuente', type: 'select', required: true,
          options: [{ value: '', label: 'Selecciona una fuente…' },
            ...INCOME_CATS.map(c => ({ value: c.name, label: c.name }))] }] },
      { label: '¿Qué día se recibió?', fields: [{ id: 'occurred_on', label: 'Fecha', type: 'date', default: todayISO() }] },
      { label: 'Detalles (opcional)', fields: [
        { id: 'fund', label: 'Fondo', type: 'text', placeholder: 'General / Misiones' },
        { id: 'note', label: 'Nota', type: 'textarea' }] },
    ],
    toData: r => ({ amount: r.amount, source: r.source, occurred_on: r.occurred_on, fund: r.fund, note: r.note }),
    toPayload: d => ({ occurred_on: d.occurred_on || todayISO(), source: (d.source || '').trim(),
      fund: (d.fund || '').trim() || null, amount: Number(d.amount), note: (d.note || '').trim() || null, created_by: currentUser?.id || null }),
  }),
  expenses: () => ({
    title: 'Nuevo gasto', editTitle: 'Editar gasto', icon: 'fa-arrow-up', submitLabel: 'Guardar gasto',
    steps: [
      { label: '¿Cuánto se gastó?', fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
      { label: '¿A qué pertenece?', hint: 'Escoge el ministerio o el pastor.', fields: [{ id: 'alloc', type: 'choice', options: allocChoice(), default: '' }] },
      { label: '¿A quién se le pagó?', fields: [{ id: 'payee', label: 'Pagado a', type: 'text', placeholder: 'Proveedor o persona' }] },
      { label: '¿Ya está pagado?', fields: [{ id: 'status', type: 'choice', default: 'paid', options: [
        { value: 'paid', label: 'Pagado', desc: 'Ya salió el dinero', icon: 'fa-check' },
        { value: 'pending', label: 'Pendiente', desc: 'Aún no se paga', icon: 'fa-clock' }] }] },
      { label: 'Detalles (opcional)', fields: [
        { id: 'occurred_on', label: 'Fecha', type: 'date', default: todayISO() },
        { id: 'category', label: 'Categoría', type: 'select',
          hint: EXPENSE_CATS.length ? '' : 'Agrega categorías de gasto en Configurar.',
          options: [{ value: '', label: 'Selecciona una categoría…' },
            ...EXPENSE_CATS.map(c => ({ value: c.name, label: c.name }))] },
        { id: 'note', label: 'Nota', type: 'textarea' }] },
    ],
    toData: r => ({ amount: r.amount, alloc: allocEncode(r), payee: r.payee, status: r.status, occurred_on: r.occurred_on, category: r.category, note: r.note }),
    toPayload: d => { const a = allocDecode(d.alloc || ''); return {
      occurred_on: d.occurred_on || todayISO(), ministry_id: a.ministry_id, label: a.label,
      payee: (d.payee || '').trim() || null, category: (d.category || '').trim() || null,
      amount: Number(d.amount), status: d.status || 'paid', note: (d.note || '').trim() || null, created_by: currentUser?.id || null }; },
  }),
  recurring: () => ({
    title: 'Nuevo pago recurrente', editTitle: 'Editar pago recurrente', icon: 'fa-rotate', submitLabel: 'Guardar',
    steps: [
      { label: '¿Es para una persona o un ministerio?',
        fields: [{ id: 'target', type: 'choice', default: 'ministry', options: [
          { value: 'ministry', label: 'Un ministerio', desc: 'Va a su presupuesto', icon: 'fa-people-group' },
          { value: 'person',   label: 'Una persona',   desc: 'Ej. pastor, músico',  icon: 'fa-user' }] }] },
      { label: '¿Cuál?', fields: [
        { id: 'rmin', label: 'Ministerio', type: 'select', required: true, showIf: d => d.target !== 'person',
          options: [{ value: '', label: 'Selecciona…' }, ...realMinistries().map(m => ({ value: m.id, label: m.name }))] },
        { id: 'rperson', label: 'Nombre de la persona', type: 'text', required: true, placeholder: 'Ej. Pastor Juan, músico',
          showIf: d => d.target === 'person' }] },
      { label: '¿Cuánto se paga?', fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
      { label: '¿Cada cuánto?', fields: [{ id: 'frequency', type: 'choice', default: 'monthly', options: [
        { value: 'monthly', label: 'Cada mes', icon: 'fa-calendar-days' },
        { value: 'weekly', label: 'Cada semana', icon: 'fa-calendar-week' },
        { value: 'yearly', label: 'Cada año', icon: 'fa-calendar' }] }] },
      { label: 'Detalles (opcional)', fields: [
        { id: 'day_of_month', label: 'Día del mes (1–31)', type: 'number', placeholder: 'ej. 1' },
        { id: 'category', label: 'Categoría', type: 'text', placeholder: 'Personal / Servicios' },
        { id: 'note', label: 'Nota', type: 'textarea' }] },
    ],
    toData: r => ({ amount: r.amount,
      target: r.label ? 'person' : 'ministry', rmin: r.ministry_id || '', rperson: r.label || '',
      frequency: r.frequency, day_of_month: r.day_of_month, category: r.category, note: r.note }),
    // payee (the "Pagado a" shown in the list) is derived: the person's name, or
    // the ministry's name — no redundant question.
    toPayload: d => { const isPerson = d.target === 'person'; const day = parseInt(d.day_of_month, 10); return {
      payee: isPerson ? (d.rperson || '').trim() : minName(d.rmin),
      ministry_id: isPerson ? null : (d.rmin || null),
      label: isPerson ? ((d.rperson || '').trim() || null) : null,
      category: (d.category || '').trim() || null,
      amount: Number(d.amount), frequency: d.frequency || 'monthly', day_of_month: (day >= 1 && day <= 31) ? day : null,
      note: (d.note || '').trim() || null, created_by: currentUser?.id || null }; },
  }),
  payables: () => ({
    title: 'Nueva cuenta por pagar', editTitle: 'Editar cuenta por pagar', icon: 'fa-file-invoice-dollar', submitLabel: 'Guardar',
    steps: [
      { label: '¿A quién se le debe?', fields: [{ id: 'creditor', label: 'Se le debe a', type: 'text', required: true, placeholder: 'Proveedor o persona' }] },
      { label: '¿Cuánto se debe?', fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
      { label: '¿Cuándo se vence?', fields: [{ id: 'due_on', label: 'Fecha de vencimiento', type: 'date' }] },
      { label: 'Detalles (opcional)', fields: [
        { id: 'ministry_id', label: 'Ministerio', type: 'select', options: ministrySelectOpts() },
        { id: 'note', label: 'Nota', type: 'textarea' }] },
    ],
    toData: r => ({ creditor: r.creditor, amount: r.amount, due_on: r.due_on, ministry_id: r.ministry_id || '', note: r.note }),
    toPayload: d => ({ creditor: (d.creditor || '').trim(), amount: Number(d.amount), due_on: d.due_on || null,
      ministry_id: d.ministry_id || null, note: (d.note || '').trim() || null, created_by: currentUser?.id || null }),
  }),
  notes: () => ({
    title: 'Nueva nota', editTitle: 'Editar nota', icon: 'fa-note-sticky', submitLabel: 'Guardar nota',
    steps: [
      { label: '¿Qué quieres anotar?', fields: [{ id: 'body', label: 'Nota o recordatorio', type: 'textarea', required: true, placeholder: 'Ej. Pagar al músico el viernes' }] },
      { label: 'Opcional', fields: [
        { id: 'ministry_id', label: 'Ministerio', type: 'select', options: ministrySelectOpts() },
        { id: 'pinned', label: '¿Mantener arriba?', type: 'choice', default: 'no', options: [
          { value: 'no', label: 'No' }, { value: 'yes', label: 'Sí, fijar' }] }] },
    ],
    toData: r => ({ body: r.body, ministry_id: r.ministry_id || '', pinned: r.pinned ? 'yes' : 'no' }),
    toPayload: d => ({ body: (d.body || '').trim(), ministry_id: d.ministry_id || null, pinned: d.pinned === 'yes', created_by: currentUser?.id || null }),
  }),
  // ── Configurar: funds + categories ──
  fund: () => ({
    title: 'Nuevo fondo', editTitle: 'Editar fondo', icon: 'fa-vault', submitLabel: 'Guardar fondo',
    steps: [
      { label: '¿Cómo se llama el fondo?', fields: [{ id: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Misiones' }] },
      { label: '¿Es de uso restringido?', hint: 'Restringido = el dinero solo se usa para su propósito.', fields: [{ id: 'restricted', type: 'choice', default: 'no', options: [
        { value: 'no', label: 'No', desc: 'Uso general' }, { value: 'yes', label: 'Sí', desc: 'Solo su propósito' }] }] },
      { label: 'Saldo inicial (opcional)', hint: 'Cuánto dinero tiene este fondo hoy, antes de empezar a registrar.', fields: [{ id: 'opening_balance', label: 'Saldo inicial', type: 'money' }] },
    ],
    toData: r => ({ name: r.name, restricted: r.restricted ? 'yes' : 'no', opening_balance: r.opening_balance }),
    toPayload: d => ({ name: (d.name || '').trim(), restricted: d.restricted === 'yes', opening_balance: Number(d.opening_balance) || 0 }),
  }),
  incomeCat: () => ({
    title: 'Nueva categoría de ingreso', editTitle: 'Editar categoría', icon: 'fa-arrow-down', submitLabel: 'Guardar',
    steps: [{ label: '¿Cómo se llama?', fields: [{ id: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Ofrenda especial' }] }],
    toData: r => ({ name: r.name }), toPayload: d => ({ name: (d.name || '').trim() }),
  }),
  expenseCat: () => ({
    title: 'Nueva categoría de gasto', editTitle: 'Editar categoría', icon: 'fa-arrow-up', submitLabel: 'Guardar',
    steps: [
      { label: '¿Cómo se llama?', fields: [{ id: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Renta' }] },
      { label: '¿En qué grupo va?', fields: [{ id: 'group_name', type: 'choice', default: 'Otros', options:
        ['Salario', 'Servicios', 'Ministerios', 'Benevolencia', 'Otros'].map(g => ({ value: g, label: g })) }] },
    ],
    toData: r => ({ name: r.name, group_name: r.group_name || 'Otros' }),
    toPayload: d => ({ name: (d.name || '').trim(), group_name: d.group_name || 'Otros' }),
  }),
};

/* ── Configurar (editable funds + categories) ──────────────────────────────── */
async function renderConfig(root) {
  await loadFundData();
  cache.funds = FUNDS; cache.incomeCats = INCOME_CATS; cache.expenseCats = EXPENSE_CATS;
  root.innerHTML = `
    ${confCard('funds', 'fa-vault', 'Fondos (dónde está el dinero)', FUNDS,
      f => `${esc(f.name)}${f.restricted ? ' <span class="trez-pill trez-pill--owe">Restringido</span>' : ''}${f.opening_balance ? ` <span class="muted">· saldo inicial ${fmt(f.opening_balance)}</span>` : ''}`)}
    ${confCard('incomeCats', 'fa-arrow-down', 'Categorías de ingreso', INCOME_CATS, c => esc(c.name))}
    ${confCard('expenseCats', 'fa-arrow-up', 'Categorías de gasto', EXPENSE_CATS,
      c => `${esc(c.name)}${c.group_name ? ` <span class="muted">· ${esc(c.group_name)}</span>` : ''}`)}`;
  wireConf(root, 'funds', 'fin_funds', WIZ.fund(), r => r?.name);
  wireConf(root, 'incomeCats', 'fin_income_categories', WIZ.incomeCat(), r => r?.name);
  wireConf(root, 'expenseCats', 'fin_expense_categories', WIZ.expenseCat(), r => r?.name);
}
function confCard(key, icon, title, items, fmtItem) {
  return `<div class="trez-card" data-list="${key}">
    <h3 class="trez-card__title"><i class="fas ${icon}"></i> ${title}</h3>
    <div class="trez-addbar"><button class="btn btn--primary btn--sm" data-add-btn><i class="fas fa-plus"></i> Agregar</button></div>
    <div class="trez-conf__items">
      ${items.length ? items.map(it => `<div class="trez-conf__item"><span>${fmtItem(it)}</span>
        <button class="adm-icon-btn" data-kebab="${it.id}" title="Acciones" aria-label="Acciones"><i class="fas fa-ellipsis-vertical"></i></button></div>`).join('')
        : '<p class="muted" style="padding:.5rem 0 0">Aún no hay. Toca “Agregar”.</p>'}
    </div></div>`;
}
function wireConf(root, key, table, wiz, title) {
  const scope = root.querySelector(`[data-list="${key}"]`);
  if (scope) bindList(root, key, table, wiz, { scope, title });
}

/* ── Ingresos ──────────────────────────────────────────────────────────────── */
async function renderIncome(root) {
  const { data, error } = await sb.from('fin_income').select('*')
    .is('project_id', null).gte('occurred_on', mStart()).lte('occurred_on', mEnd()).order('occurred_on', { ascending: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.income = data || [];
  root.innerHTML = `
    ${INCOME_CATS.length ? addBtn('Agregar ingreso')
      : `<div class="trez-addbar"><button class="btn btn--primary" disabled><i class="fas fa-plus"></i> Agregar ingreso</button>
         <p class="trez-hint" style="margin:.4rem 0 0"><i class="fas fa-circle-info"></i> Agrega categorías de ingreso en <strong>Configurar</strong> primero.</p></div>`}
    <div class="trez-total">Total recaudado · ${monthLbl()}: <strong class="pos">${fmt(sum(data))}</strong></div>
    ${table(['Fecha', 'Fuente', 'Fondo', 'Monto', ''], (data || []).map(r => `
      <tr><td>${fmtDate(r.occurred_on)}</td>
        <td>${esc(r.source)}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td>${esc(r.fund || '—')}</td><td class="num pos">${fmt(r.amount)}</td>${kebabCell(r.id)}</tr>`).join(''), 'No hay ingresos este mes.')}`;
  bindList(root, 'income', 'fin_income', WIZ.income(), { title: r => r?.source });
}

/* ── Gastos ────────────────────────────────────────────────────────────────── */
async function renderExpenses(root) {
  const { data, error } = await sb.from('fin_expenses').select('*')
    .is('project_id', null).gte('occurred_on', mStart()).lte('occurred_on', mEnd()).order('occurred_on', { ascending: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.expenses = data || [];
  root.innerHTML = `
    ${addBtn('Agregar gasto')}
    <div class="trez-total">Total gastado · ${monthLbl()}: <strong class="neg">${fmt(sum(data))}</strong></div>
    ${table(['Fecha', 'Asignado a', 'Pagado a', 'Monto', 'Estado', ''], (data || []).map(r => `
      <tr><td>${fmtDate(r.occurred_on)}</td>
        <td>${esc(allocName(r))}${r.category ? `<span class="trez-sub">${esc(r.category)}</span>` : ''}</td>
        <td>${esc(r.payee || '—')}${cleanNote(r.note) ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td class="num neg">${fmt(r.amount)}</td><td>${statusPill(r.status)}</td>${kebabCell(r.id)}</tr>`).join(''), 'No hay gastos este mes.')}`;
  bindList(root, 'expenses', 'fin_expenses', WIZ.expenses(), { title: r => r?.payee || allocName(r) });
}

/* ── Recurrentes ───────────────────────────────────────────────────────────── */
async function renderRecurring(root) {
  const { data, error } = await sb.from('fin_recurring').select('*').order('active', { ascending: false }).order('payee');
  if (error) { root.innerHTML = errBox(error); return; }
  cache.recurring = data || [];
  const FREQ = { monthly: 'Mensual', weekly: 'Semanal', yearly: 'Anual' };
  root.innerHTML = `
    ${addBtn('Agregar pago recurrente')}
    ${table(['Pagado a', 'Asignado a', 'Monto', 'Frecuencia', 'Activo', ''], (data || []).map(r => `
      <tr class="${r.active ? '' : 'is-paid'}"><td>${esc(r.payee)}${cleanNote(r.note) ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td>${esc(allocName(r))}</td><td class="num neg">${fmt(r.amount)}</td>
        <td>${FREQ[r.frequency] || r.frequency}${r.day_of_month ? ` · día ${r.day_of_month}` : ''}</td>
        <td>${r.active ? '<span class="trez-pill trez-pill--paid">Sí</span>' : '<span class="trez-pill trez-pill--pending">No</span>'}</td>${kebabCell(r.id)}</tr>`).join(''), 'No hay pagos recurrentes.')}`;
  bindList(root, 'recurring', 'fin_recurring', WIZ.recurring(), { title: r => r?.payee });
}

// Active monthly recurring payments auto-appear in Gastos for each month
// (current + past) — idempotent via an `auto:recurring:<id>:<month>` note tag.
async function ensureRecurringForMonth(mk) {
  if (!mk || mk > thisMonth()) return;
  const [y, m] = mk.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const s = `${mk}-01`, e2 = `${mk}-${String(last).padStart(2, '0')}`;
  const [recRes, expRes] = await Promise.all([
    sb.from('fin_recurring').select('*').eq('active', true).eq('frequency', 'monthly'),
    sb.from('fin_expenses').select('note').gte('occurred_on', s).lte('occurred_on', e2).like('note', 'auto:recurring:%'),
  ]);
  const recs = recRes.data || [];
  if (!recs.length) return;
  const have = new Set((expRes.data || []).map(x => x.note));
  const rows = [];
  recs.forEach(r => {
    if ((r.created_at || '').slice(0, 7) > mk) return;     // not before it existed
    const tag = `auto:recurring:${r.id}:${mk}`;
    if (have.has(tag)) return;
    const day = Math.min(r.day_of_month || 1, last);
    rows.push({ occurred_on: `${mk}-${String(day).padStart(2, '0')}`, ministry_id: r.ministry_id, label: r.label,
      payee: r.payee, category: r.category || 'Recurrente', amount: r.amount, status: 'paid', note: tag, created_by: currentUser?.id || null });
  });
  if (rows.length) await sb.from('fin_expenses').insert(rows);
}

/* ── Por pagar ─────────────────────────────────────────────────────────────── */
async function renderPayables(root) {
  const { data, error } = await sb.from('fin_payables').select('*')
    .order('status').order('due_on', { ascending: true, nullsFirst: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.payables = data || [];
  const open = (data || []).filter(p => p.status === 'open');
  root.innerHTML = `
    ${addBtn('Agregar cuenta por pagar')}
    <div class="trez-total">Total abierto: <strong class="neg">${fmt(sum(open))}</strong></div>
    ${table(['Se le debe a', 'Monto', 'Vence', 'Ministerio', 'Estado', ''], (data || []).map(r => `
      <tr class="${r.status === 'paid' ? 'is-paid' : ''}"><td>${esc(r.creditor)}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td class="num neg">${fmt(r.amount)}</td><td>${fmtDate(r.due_on)}</td><td>${esc(minName(r.ministry_id))}</td>
        <td>${r.status === 'paid' ? statusPill('paid') : '<span class="trez-pill trez-pill--owe">Abierto</span>'}</td>${kebabCell(r.id)}</tr>`).join(''), 'No hay cuentas por pagar.')}`;
  bindList(root, 'payables', 'fin_payables', WIZ.payables(), {
    title: r => r?.creditor,
    extra: r => r?.status === 'open' ? [{ label: 'Marcar pagado', icon: 'fa-check', onClick: () => markPaid(r) }] : [],
    // Deleting a payable also removes its mirrored gasto (auto:payable:<id>).
    onDelete: (id) => sb.from('fin_expenses').delete().eq('note', `auto:payable:${id}`),
  });
}
// Marking a payable paid mirrors it into fin_expenses (the single source of
// truth for Gastos/Resumen/Reporte) so the money shows up as a real gasto.
// Idempotent via the auto:payable:<id> tag, which cleanNote() hides.
async function markPaid(p) {
  const paid_at = new Date().toISOString();
  const { error } = await sb.from('fin_payables').update({ status: 'paid', paid_at }).eq('id', p.id);
  if (error) { toast(error.message, 'error'); return; }
  const tag = `auto:payable:${p.id}`;
  await sb.from('fin_expenses').delete().eq('note', tag);
  await sb.from('fin_expenses').insert({
    occurred_on: paid_at.slice(0, 10),
    ministry_id: p.ministry_id || null, label: null,
    payee: p.creditor, category: 'Cuenta pagada', amount: p.amount,
    status: 'paid', note: tag, created_by: currentUser?.id || null,
  });
  toast('Marcado como pagado', 'success'); render();
}

/* ── Reportes (yearly, click a month to drill into dated entries) ──────────── */
async function renderReports(root) {
  const [inc, exp] = await Promise.all([
    sb.from('fin_income').select('occurred_on,source,fund,amount').gte('occurred_on', yStart()).lte('occurred_on', yEnd()).order('occurred_on'),
    sb.from('fin_expenses').select('occurred_on,payee,ministry_id,label,amount').gte('occurred_on', yStart()).lte('occurred_on', yEnd()).order('occurred_on'),
  ]);
  if (inc.error || exp.error) { root.innerHTML = errBox(inc.error || exp.error); return; }
  const months = Array.from({ length: 12 }, () => ({ in: 0, out: 0, income: [], expense: [] }));
  (inc.data || []).forEach(r => { const i = Number(r.occurred_on.slice(5,7)) - 1; months[i].in += Number(r.amount || 0); months[i].income.push(r); });
  (exp.data || []).forEach(r => { const i = Number(r.occurred_on.slice(5,7)) - 1; months[i].out += Number(r.amount || 0); months[i].expense.push(r); });

  let ytd = 0;
  const body = months.map((m, i) => {
    const bal = m.in - m.out; ytd += bal; const has = m.in || m.out;
    const detail = has ? `
      <tr class="trez-report__detail" id="rep-${i}" hidden><td colspan="5"><div class="trez-report__cols">
        <div><h4 class="pos"><i class="fas fa-arrow-down"></i> Ingresos</h4>
          ${m.income.length ? m.income.map(r => `<div class="trez-report__line"><span>${fmtDate(r.occurred_on)} · ${esc(r.source)}${r.fund?` · ${esc(r.fund)}`:''}</span><span class="pos">${fmt(r.amount)}</span></div>`).join('') : '<p class="muted">—</p>'}</div>
        <div><h4 class="neg"><i class="fas fa-arrow-up"></i> Gastos</h4>
          ${m.expense.length ? m.expense.map(r => `<div class="trez-report__line"><span>${fmtDate(r.occurred_on)} · ${esc(r.payee || allocName(r))}</span><span class="neg">${fmt(r.amount)}</span></div>`).join('') : '<p class="muted">—</p>'}</div>
      </div></td></tr>` : '';
    return `<tr class="trez-report__row${has ? '' : ' is-muted'}" ${has ? `data-rep="${i}"` : ''}>
        <td>${has ? '<i class="fas fa-chevron-right trez-report__chev"></i> ' : ''}${MONTHS[i]}</td>
        <td class="num pos">${m.in ? fmt(m.in) : '—'}</td><td class="num neg">${m.out ? fmt(m.out) : '—'}</td>
        <td class="num ${bal < 0 ? 'neg' : 'pos'}">${has ? fmt(bal) : '—'}</td>
        <td class="num ${ytd < 0 ? 'neg' : ''}">${fmt(ytd)}</td></tr>${detail}`;
  }).join('');
  const totIn = sum(inc.data), totOut = sum(exp.data);

  const chartMax = Math.max(1, ...months.map(m => Math.max(m.in, m.out)));
  const chart = `<div class="trez-rchart">${months.map((m, i) => `
    <div class="trez-rchart__col">
      <div class="trez-rchart__bars">
        <div class="trez-rchart__bar in"  style="height:${Math.round((m.in  / chartMax) * 100)}%" title="Ingresos ${fmt(m.in)}"></div>
        <div class="trez-rchart__bar out" style="height:${Math.round((m.out / chartMax) * 100)}%" title="Gastos ${fmt(m.out)}"></div>
      </div>
      <span class="trez-rchart__lbl">${MONTHS[i].slice(0,3)}</span>
    </div>`).join('')}</div>
    <div class="trez-rchart__legend"><span><i class="dot in"></i> Ingresos</span><span><i class="dot out"></i> Gastos</span></div>`;

  root.innerHTML = `
    <div class="trez-rtoolbar">
      <p class="trez-lead" style="margin:0">Reporte de ${year()} — toca un mes para ver las entradas con fechas.</p>
      <button class="btn btn--ghost btn--sm" id="trezPdf"><i class="fas fa-file-pdf"></i> Descargar PDF</button>
    </div>
    <div class="trez-card">${chart}</div>
    <div class="trez-tablewrap"><table class="trez-table trez-report">
      <thead><tr><th>Mes</th><th class="num">Ingresos</th><th class="num">Gastos</th><th class="num">Balance</th><th class="num">Acumulado</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th>Total ${year()}</th><th class="num pos">${fmt(totIn)}</th><th class="num neg">${fmt(totOut)}</th>
        <th class="num ${totIn-totOut<0?'neg':'pos'}">${fmt(totIn - totOut)}</th><th></th></tr></tfoot>
    </table></div>`;
  root.querySelectorAll('[data-rep]').forEach(row => row.addEventListener('click', () => {
    const det = document.getElementById(`rep-${row.dataset.rep}`);
    if (det) det.hidden = !det.hidden;
    row.classList.toggle('open', det && !det.hidden);
  }));
  document.getElementById('trezPdf')?.addEventListener('click', () => printReport(months, totIn, totOut, year()));
}

// Open a clean print window → the browser's "Guardar como PDF" does the rest.
function printReport(months, totIn, totOut, yr) {
  let ytd = 0;
  const rows = months.map((m, i) => {
    const bal = m.in - m.out; ytd += bal; const has = m.in || m.out;
    const detail = has ? `
      <tr class="sub"><td colspan="5">
        ${m.income.map(r => `<div class="ln"><span>+ ${fmtDate(r.occurred_on)} · ${esc(r.source)}</span><span class="p">${fmt(r.amount)}</span></div>`).join('')}
        ${m.expense.map(r => `<div class="ln"><span>− ${fmtDate(r.occurred_on)} · ${esc(r.payee || allocName(r))}</span><span class="n">${fmt(r.amount)}</span></div>`).join('')}
      </td></tr>` : '';
    return `<tr><td><b>${MONTHS[i]}</b></td><td class="r p">${m.in?fmt(m.in):'—'}</td><td class="r n">${m.out?fmt(m.out):'—'}</td>
      <td class="r">${has?fmt(bal):'—'}</td><td class="r">${fmt(ytd)}</td></tr>${detail}`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tesorería ${yr}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#222;margin:32px;}
      h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;font-weight:500;color:#666;margin:0 0 18px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
      th.r,td.r{text-align:right;font-variant-numeric:tabular-nums}
      tfoot th{border-top:2px solid #444}
      .p{color:#1e6b61}.n{color:#b02030}
      .sub td{background:#fafafa;padding:4px 16px}
      .ln{display:flex;justify-content:space-between;font-size:11px;color:#555;padding:2px 0}
      @media print{ .noprint{display:none} }
    </style></head><body>
    <h1>Iglesia Restauración Divina — Tesorería</h1>
    <h2>Reporte anual ${yr}</h2>
    <table><thead><tr><th>Mes</th><th class="r">Ingresos</th><th class="r">Gastos</th><th class="r">Balance</th><th class="r">Acumulado</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Total ${yr}</th><th class="r p">${fmt(totIn)}</th><th class="r n">${fmt(totOut)}</th><th class="r">${fmt(totIn-totOut)}</th><th></th></tr></tfoot>
    </table>
    <p class="noprint" style="margin-top:18px"><button onclick="window.print()" style="padding:8px 16px;font-size:14px">Imprimir / Guardar PDF</button></p>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Permite las ventanas emergentes para descargar el PDF.', 'error'); return; }
  w.document.write(html); w.document.close();
}

/* ── Notas ─────────────────────────────────────────────────────────────────── */
async function renderNotes(root) {
  const { data, error } = await sb.from('fin_notes').select('*')
    .order('pinned', { ascending: false }).order('created_at', { ascending: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.notes = data || [];
  root.innerHTML = `
    ${addBtn('Agregar nota')}
    <div class="trez-notes">
      ${(data || []).length ? (data || []).map(n => `
        <div class="trez-note${n.pinned ? ' pinned' : ''}">
          ${n.pinned ? '<i class="fas fa-thumbtack trez-note__pin"></i>' : ''}
          <div class="trez-note__body">${esc(n.body)}</div>
          <div class="trez-note__meta">${esc(minName(n.ministry_id))} · ${fmtDate((n.created_at || '').slice(0,10))}</div>
          <button class="adm-icon-btn trez-note__del" data-kebab="${n.id}" title="Acciones"><i class="fas fa-ellipsis-vertical"></i></button>
        </div>`).join('') : '<div class="empty-state"><i class="fas fa-note-sticky"></i><p>Sin notas todavía.</p></div>'}
    </div>`;
  bindList(root, 'notes', 'fin_notes', WIZ.notes(), { title: r => r?.body });
}

/* ── shared building blocks ────────────────────────────────────────────────── */
function errBox(e) { return `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(e?.message || 'Error')}</p></div>`; }
function addBtn(label) { return `<div class="trez-addbar"><button class="btn btn--primary" data-add-btn><i class="fas fa-plus"></i> ${esc(label)}</button></div>`; }
function kebabCell(id) { return `<td class="row-act"><button class="adm-icon-btn" data-kebab="${id}" title="Acciones" aria-label="Acciones"><i class="fas fa-ellipsis-vertical"></i></button></td>`; }
function table(heads, rowsHtml, emptyMsg) {
  if (!rowsHtml) return `<div class="empty-state"><i class="fas fa-inbox"></i><p>${emptyMsg}</p></div>`;
  const heading = h => `<th${/^(monto|ingresos|gastos|balance|acumulado)$/i.test(h) ? ' class="num"' : ''}>${h}</th>`;
  return `<div class="trez-tablewrap"><table class="trez-table">
    <thead><tr>${heads.map(heading).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}
function statusPill(s) {
  return s === 'paid' ? '<span class="trez-pill trez-pill--paid">Pagado</span>' : '<span class="trez-pill trez-pill--pending">Pendiente</span>';
}
// Wire the "Agregar" button (opens wizard) + each row's ⋮ menu (Editar via
// wizard · [extra] · Eliminar).
function bindList(root, key, tableName, wiz, opts = {}) {
  const openWiz = (row) => openFormWizard({
    title: row ? (wiz.editTitle || wiz.title) : wiz.title,
    icon: wiz.icon,
    submitLabel: row ? 'Guardar cambios' : (wiz.submitLabel || 'Agregar'),
    data: row ? wiz.toData(row) : {},
    steps: wiz.steps,
    onSubmit: (d) => { const p = wiz.toPayload(d); return row ? sb.from(tableName).update(p).eq('id', row.id) : sb.from(tableName).insert(p); },
    onDone: render,
  });
  const scope = opts.scope || root;
  scope.querySelector('[data-add-btn]')?.addEventListener('click', () => openWiz(null));
  scope.querySelectorAll('[data-kebab]').forEach(btn => btn.addEventListener('click', () => {
    const row = (cache[key] || []).find(r => r.id === btn.dataset.kebab);
    const actions = [
      { label: 'Editar', icon: 'fa-pen', onClick: () => openWiz(row) },
      ...((opts.extra && row) ? opts.extra(row) : []),
      { label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: async () => {
          if (!await confirm('Eliminar', '¿Eliminar este registro? No se puede deshacer.')) return;
          const { error } = await sb.from(tableName).delete().eq('id', btn.dataset.kebab);
          if (error) { toast(error.message, 'error'); return; }
          if (opts.onDelete) await opts.onDelete(btn.dataset.kebab);
          toast('Eliminado', 'success'); render();
        } },
    ];
    showActionSheet({ trigger: btn, title: (opts.title && row) ? opts.title(row) : undefined, actions });
  }));
}
