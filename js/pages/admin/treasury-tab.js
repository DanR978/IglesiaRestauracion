// js/pages/admin/treasury-tab.js
// "Tesorería" — church-wide treasury + per-ministry MONTHLY budgets.
// Every add/edit is a step-by-step wizard (one question per screen, big
// choices, a review, then save) — same intuitive flow as event/group creation.
// Row actions live behind a ⋮ menu.

import { sb, ministries, currentUser } from './state.js';
import { toast, confirm } from './ui.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { openFormWizard } from './form-wizard.js';

/* ── helpers ──────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
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

const PASTOR = 'Pastor';
function allocChoice() {
  return [{ value: '', label: 'General', icon: 'fa-church' },
    ...ministries.map(m => ({ value: m.id, label: m.name, icon: 'fa-people-group' })),
    { value: 'pastor', label: 'Pastor', icon: 'fa-user-tie' }];
}
function allocDecode(v) {
  if (v === 'pastor') return { ministry_id: null, label: PASTOR };
  if (v) return { ministry_id: v, label: null };
  return { ministry_id: null, label: null };
}
function allocEncode(row) { return row?.label === PASTOR ? 'pastor' : (row?.ministry_id || ''); }
function allocName(row) { return row?.label === PASTOR ? 'Pastor' : (row?.ministry_id ? minName(row.ministry_id) : 'General'); }
function ministrySelectOpts() { return [{ value: '', label: 'General' }, ...ministries.map(m => ({ value: m.id, label: m.name }))]; }

const SUBS = [
  { k: 'resumen',   label: 'Resumen',      icon: 'fa-chart-pie' },
  { k: 'income',    label: 'Ingresos',     icon: 'fa-arrow-down' },
  { k: 'expenses',  label: 'Gastos',       icon: 'fa-arrow-up' },
  { k: 'recurring', label: 'Recurrentes',  icon: 'fa-rotate' },
  { k: 'budgets',   label: 'Presupuestos', icon: 'fa-scale-balanced' },
  { k: 'payables',  label: 'Por pagar',    icon: 'fa-file-invoice-dollar' },
  { k: 'reports',   label: 'Reportes',     icon: 'fa-calendar-days' },
  { k: 'notes',     label: 'Notas',        icon: 'fa-note-sticky' },
];

let sub = 'resumen';
let monthKey = thisMonth();
const cache = {};

const year   = () => monthKey.slice(0, 4);
const mStart = () => `${monthKey}-01`;
const mEnd   = () => { const [y, m] = monthKey.split('-').map(Number); return `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`; };
const yStart = () => `${year()}-01-01`;
const yEnd   = () => `${year()}-12-31`;
const monthLbl = () => { const [y, m] = monthKey.split('-').map(Number); return `${MONTHS[m-1]} ${y}`; };

export async function loadTreasury() {
  const inp = document.getElementById('trezMonth');
  if (inp && !inp.value) {
    inp.value = monthKey;
    inp.addEventListener('change', () => { monthKey = inp.value || thisMonth(); render(); });
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
  ({ resumen: renderResumen, income: renderIncome, expenses: renderExpenses, recurring: renderRecurring,
     budgets: renderBudgets, payables: renderPayables, reports: renderReports, notes: renderNotes }[sub] || renderResumen)(root);
}

/* ── Resumen (selected month) ──────────────────────────────────────────────── */
async function renderResumen(root) {
  const [inc, exp, bud, pay] = await Promise.all([
    sb.from('fin_income').select('amount').gte('occurred_on', mStart()).lte('occurred_on', mEnd()),
    sb.from('fin_expenses').select('amount,ministry_id,label').gte('occurred_on', mStart()).lte('occurred_on', mEnd()),
    sb.from('fin_budgets').select('line_key,amount').eq('period', monthKey),
    sb.from('fin_payables').select('amount').eq('status', 'open'),
  ]);
  if (inc.error || exp.error) { root.innerHTML = errBox(inc.error || exp.error); return; }

  const income = sum(inc.data), expenses = sum(exp.data), owed = sum(pay.data), balance = income - expenses;
  const spentByMin = {}; let spentPastor = 0;
  (exp.data || []).forEach(e => {
    if (e.label === PASTOR) spentPastor += Number(e.amount || 0);
    else spentByMin[e.ministry_id] = (spentByMin[e.ministry_id] || 0) + Number(e.amount || 0);
  });
  const budByKey = {}; (bud.data || []).forEach(b => budByKey[b.line_key] = Number(b.amount || 0));

  const lines = ministries.map(m => ({ name: m.name, budget: budByKey[m.id] || 0, spent: spentByMin[m.id] || 0 }));
  lines.push({ name: 'Pastor (estipendio)', budget: budByKey['pastor'] || 0, spent: spentPastor });
  const rows = lines.filter(r => r.budget || r.spent);

  const tiles = [
    { icon: 'fa-arrow-down', cls: 'in',  num: fmt(income),   label: `Ingresos · ${monthLbl()}` },
    { icon: 'fa-arrow-up',   cls: 'out', num: fmt(expenses), label: `Gastos · ${monthLbl()}` },
    { icon: 'fa-scale-balanced', cls: balance >= 0 ? 'in' : 'out', num: fmt(balance), label: 'Balance del mes' },
    { icon: 'fa-file-invoice-dollar', cls: 'owe', num: fmt(owed), label: 'Por pagar' },
  ];

  root.innerHTML = `
    <p class="trez-lead">Tesorería de toda la iglesia — entrada de dinero y su asignación por línea, para ${monthLbl()}.</p>
    <div class="trez-tiles">
      ${tiles.map(t => `<div class="trez-tile trez-tile--${t.cls}">
        <span class="trez-tile__icon"><i class="fas ${t.icon}"></i></span>
        <span class="trez-tile__num">${t.num}</span><span class="trez-tile__label">${t.label}</span></div>`).join('')}
    </div>
    <div class="trez-card">
      <h3 class="trez-card__title"><i class="fas fa-scale-balanced"></i> Presupuesto por línea · ${monthLbl()}</h3>
      ${rows.length ? `<div class="trez-budtable">${rows.map(r => {
        const rem = r.budget - r.spent, pct = r.budget ? Math.min(100, Math.round((r.spent / r.budget) * 100)) : 0, over = r.budget && r.spent > r.budget;
        return `<div class="trez-budrow">
          <div class="trez-budrow__head"><span class="trez-budrow__name">${esc(r.name)}</span>
            <span class="trez-budrow__nums">${fmt(r.spent)} <span class="muted">/ ${fmt(r.budget)}</span></span></div>
          <div class="trez-budbar"><div class="trez-budbar__fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
          <div class="trez-budrow__rem ${rem < 0 ? 'neg' : ''}">${rem < 0 ? 'Excedido ' : 'Restante '}${fmt(Math.abs(rem))}</div>
        </div>`; }).join('')}</div>`
        : `<div class="empty-state"><i class="fas fa-scale-balanced"></i><p>Aún no hay presupuestos ni gastos para ${monthLbl()}.</p></div>`}
    </div>`;
}

/* ── Wizard specs ──────────────────────────────────────────────────────────── */
const WIZ = {
  income: () => ({
    title: 'Nuevo ingreso', editTitle: 'Editar ingreso', icon: 'fa-arrow-down', submitLabel: 'Guardar ingreso',
    steps: [
      { label: '¿Cuánto dinero se recibió?', hint: 'Escribe la cantidad.', fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
      { label: '¿De dónde vino?', fields: [{ id: 'source', label: 'Fuente', type: 'text', required: true, placeholder: 'Ofrenda dominical' }] },
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
        { id: 'category', label: 'Categoría', type: 'text', placeholder: 'Renta / Materiales' },
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
      { label: '¿A quién se le paga?', hint: 'Por ejemplo, el estipendio del pastor.', fields: [{ id: 'payee', label: 'Pagado a', type: 'text', required: true, placeholder: 'Pastor — estipendio' }] },
      { label: '¿Cuánto se paga?', fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
      { label: '¿A qué pertenece?', fields: [{ id: 'alloc', type: 'choice', options: allocChoice(), default: '' }] },
      { label: '¿Cada cuánto?', fields: [{ id: 'frequency', type: 'choice', default: 'monthly', options: [
        { value: 'monthly', label: 'Cada mes', icon: 'fa-calendar-days' },
        { value: 'weekly', label: 'Cada semana', icon: 'fa-calendar-week' },
        { value: 'yearly', label: 'Cada año', icon: 'fa-calendar' }] }] },
      { label: 'Detalles (opcional)', fields: [
        { id: 'day_of_month', label: 'Día del mes (1–31)', type: 'number', placeholder: 'ej. 1' },
        { id: 'category', label: 'Categoría', type: 'text', placeholder: 'Personal / Servicios' },
        { id: 'note', label: 'Nota', type: 'textarea' }] },
    ],
    toData: r => ({ payee: r.payee, amount: r.amount, alloc: allocEncode(r), frequency: r.frequency, day_of_month: r.day_of_month, category: r.category, note: r.note }),
    toPayload: d => { const a = allocDecode(d.alloc || ''); const day = parseInt(d.day_of_month, 10); return {
      payee: (d.payee || '').trim(), ministry_id: a.ministry_id, label: a.label, category: (d.category || '').trim() || null,
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
};

/* ── Ingresos ──────────────────────────────────────────────────────────────── */
async function renderIncome(root) {
  const { data, error } = await sb.from('fin_income').select('*')
    .gte('occurred_on', mStart()).lte('occurred_on', mEnd()).order('occurred_on', { ascending: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.income = data || [];
  root.innerHTML = `
    ${addBtn('Agregar ingreso')}
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
    .gte('occurred_on', mStart()).lte('occurred_on', mEnd()).order('occurred_on', { ascending: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.expenses = data || [];
  root.innerHTML = `
    ${addBtn('Agregar gasto')}
    <div class="trez-total">Total gastado · ${monthLbl()}: <strong class="neg">${fmt(sum(data))}</strong></div>
    ${table(['Fecha', 'Asignado a', 'Pagado a', 'Monto', 'Estado', ''], (data || []).map(r => `
      <tr><td>${fmtDate(r.occurred_on)}</td>
        <td>${esc(allocName(r))}${r.category ? `<span class="trez-sub">${esc(r.category)}</span>` : ''}</td>
        <td>${esc(r.payee || '—')}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
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
    <p class="trez-lead">Pagos que se repiten — estipendios (ej. el del pastor), renta, suscripciones. Usa el menú ⋮ → “Registrar este mes” para llevarlo a Gastos.</p>
    ${addBtn('Agregar pago recurrente')}
    ${table(['Pagado a', 'Asignado a', 'Monto', 'Frecuencia', 'Activo', ''], (data || []).map(r => `
      <tr class="${r.active ? '' : 'is-paid'}"><td>${esc(r.payee)}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td>${esc(allocName(r))}</td><td class="num neg">${fmt(r.amount)}</td>
        <td>${FREQ[r.frequency] || r.frequency}${r.day_of_month ? ` · día ${r.day_of_month}` : ''}</td>
        <td>${r.active ? '<span class="trez-pill trez-pill--paid">Sí</span>' : '<span class="trez-pill trez-pill--pending">No</span>'}</td>${kebabCell(r.id)}</tr>`).join(''), 'No hay pagos recurrentes.')}`;
  bindList(root, 'recurring', 'fin_recurring', WIZ.recurring(), {
    title: r => r?.payee,
    extra: r => [{ label: 'Registrar este mes', icon: 'fa-file-circle-plus', onClick: () => postRecurring(r) }],
  });
}
async function postRecurring(r) {
  if (!r) return;
  const t = new Date();
  const day = Math.min(r.day_of_month || t.getDate(), 28);
  const occ = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const { error } = await sb.from('fin_expenses').insert({
    occurred_on: occ, ministry_id: r.ministry_id, label: r.label, payee: r.payee,
    category: r.category || 'Recurrente', amount: r.amount, status: 'paid',
    note: 'Generado de pago recurrente', created_by: currentUser?.id || null });
  if (error) { toast(error.message, 'error'); return; }
  toast(`Registrado en gastos: ${fmt(r.amount)} a ${r.payee}`, 'success');
}

/* ── Presupuestos (MONTHLY, lines = ministries + Pastor) ────────────────────── */
async function renderBudgets(root) {
  const { data, error } = await sb.from('fin_budgets').select('line_key,amount').eq('period', monthKey);
  if (error) { root.innerHTML = errBox(error); return; }
  const byKey = Object.fromEntries((data || []).map(b => [b.line_key, Number(b.amount)]));
  const lines = ministries.map(m => ({ key: m.id, name: m.name, ministry_id: m.id, label: null }));
  lines.push({ key: 'pastor', name: 'Pastor (estipendio)', ministry_id: null, label: PASTOR });

  root.innerHTML = `
    <div class="trez-card">
      <h3 class="trez-card__title"><i class="fas fa-scale-balanced"></i> Presupuesto mensual · ${monthLbl()}</h3>
      <p class="trez-hint">Cada ministerio —y el pastor— tiene su presupuesto de este mes. Cambia el mes arriba. Se guarda al instante.</p>
      <div class="trez-budset">
        ${lines.map(l => `
          <div class="trez-budset__row">
            <span class="trez-budset__name">${esc(l.name)}</span>
            <div class="trez-budset__input"><span>$</span>
              <input type="number" min="0" step="0.01" inputmode="decimal" data-bud="${l.key}" value="${byKey[l.key] ?? ''}" placeholder="0.00"></div>
            <button class="btn btn--ghost btn--sm" data-budsave="${l.key}">Guardar</button>
          </div>`).join('')}
      </div>
    </div>`;

  root.querySelectorAll('[data-budsave]').forEach(btn => btn.addEventListener('click', async () => {
    const key = btn.dataset.budsave;
    const line = lines.find(l => l.key === key);
    const amount = parseFloat(root.querySelector(`[data-bud="${CSS.escape(key)}"]`).value);
    if (!(amount >= 0)) { toast('Escribe un monto válido', 'error'); return; }
    btn.disabled = true;
    const { error: e } = await sb.from('fin_budgets').upsert(
      { line_key: key, label: line.label, ministry_id: line.ministry_id, period: monthKey, amount, updated_at: new Date().toISOString() },
      { onConflict: 'line_key,period' });
    btn.disabled = false;
    if (e) { toast(e.message, 'error'); return; }
    toast('Presupuesto guardado', 'success');
  }));
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
    extra: r => r?.status === 'open' ? [{ label: 'Marcar pagado', icon: 'fa-check', onClick: () => markPaid(r.id) }] : [],
  });
}
async function markPaid(id) {
  const { error } = await sb.from('fin_payables').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
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

  root.innerHTML = `
    <p class="trez-lead">Reporte mensual de ${year()} — toca un mes para ver las entradas con sus fechas. Cambia el mes arriba para otro año.</p>
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
  root.querySelector('[data-add-btn]')?.addEventListener('click', () => openWiz(null));
  root.querySelectorAll('[data-kebab]').forEach(btn => btn.addEventListener('click', () => {
    const row = (cache[key] || []).find(r => r.id === btn.dataset.kebab);
    const actions = [
      { label: 'Editar', icon: 'fa-pen', onClick: () => openWiz(row) },
      ...((opts.extra && row) ? opts.extra(row) : []),
      { label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: async () => {
          if (!await confirm('Eliminar', '¿Eliminar este registro? No se puede deshacer.')) return;
          const { error } = await sb.from(tableName).delete().eq('id', btn.dataset.kebab);
          if (error) { toast(error.message, 'error'); return; }
          toast('Eliminado', 'success'); render();
        } },
    ];
    showActionSheet({ trigger: btn, title: (opts.title && row) ? opts.title(row) : undefined, actions });
  }));
}
