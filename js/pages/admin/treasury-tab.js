// js/pages/admin/treasury-tab.js
// "Tesorería" — church-wide treasury + per-ministry MONTHLY budgets.
//   Church level: total inflow (income) and allocation (expenses), balance,
//   payables, recurring stipends, monthly reports.
//   Budget lines: each ministry + the pastor's allowance, set per month.
// Full control for admins/treasurer (RLS). Ministry leaders read-only on
// their own ministry's budget/spend.
// Every row's actions live behind a ⋮ menu (shared action-sheet component).

import { sb, ministries, currentUser } from './state.js';
import { toast, confirm } from './ui.js';
import { showActionSheet } from '/js/components/action-sheet.js';

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

const PASTOR = 'Pastor';   // canonical allocation label for the pastor's allowance

// "Assign to" — General · ministries · Pastor
function allocOptions(val) {
  return `<option value=""${val === '' ? ' selected' : ''}>— General —</option>` +
    ministries.map(m => `<option value="${m.id}"${val === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('') +
    `<option value="pastor"${val === 'pastor' ? ' selected' : ''}>Pastor (estipendio)</option>`;
}
function allocDecode(v) {
  if (v === 'pastor') return { ministry_id: null, label: PASTOR };
  if (v) return { ministry_id: v, label: null };
  return { ministry_id: null, label: null };
}
function allocEncode(row) { return row?.label === PASTOR ? 'pastor' : (row?.ministry_id || ''); }
function allocName(row) { return row?.label === PASTOR ? 'Pastor' : (row?.ministry_id ? minName(row.ministry_id) : 'General'); }

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
let editing = {};
const cache = {};

const year     = () => monthKey.slice(0, 4);
const mStart   = () => `${monthKey}-01`;
const mEnd     = () => { const [y, m] = monthKey.split('-').map(Number); return `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`; };
const yStart   = () => `${year()}-01-01`;
const yEnd     = () => `${year()}-12-31`;
const monthLbl = () => { const [y, m] = monthKey.split('-').map(Number); return `${MONTHS[m-1]} ${y}`; };

export async function loadTreasury() {
  const inp = document.getElementById('trezMonth');
  if (inp && !inp.value) {
    inp.value = monthKey;
    inp.addEventListener('change', () => { monthKey = inp.value || thisMonth(); editing = {}; render(); });
  }
  const nav = document.getElementById('trezSubnav');
  if (nav) {
    nav.innerHTML = SUBS.map(s =>
      `<button class="trez-subnav__btn${s.k === sub ? ' active' : ''}" data-sub="${s.k}"><i class="fas ${s.icon}"></i> ${s.label}</button>`).join('');
    nav.querySelectorAll('[data-sub]').forEach(b =>
      b.addEventListener('click', () => { sub = b.dataset.sub; editing = {}; syncNav(); render(); }));
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

/* ── Ingresos (money gathered ledger, this month) ──────────────────────────── */
async function renderIncome(root) {
  const { data, error } = await sb.from('fin_income').select('*')
    .gte('occurred_on', mStart()).lte('occurred_on', mEnd()).order('occurred_on', { ascending: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.income = data || [];
  const ed = editRow('income');

  root.innerHTML = `
    ${addForm('income', ed, `
      ${field('inDate', 'Fecha', `<input type="date" id="inDate" value="${ed?.occurred_on || todayISO()}">`)}
      ${field('inSource', 'Fuente', `<input type="text" id="inSource" value="${esc(ed?.source || '')}" placeholder="Ofrenda dominical">`)}
      ${field('inFund', 'Fondo (opcional)', `<input type="text" id="inFund" value="${esc(ed?.fund || '')}" placeholder="General / Misiones">`)}
      ${field('inAmount', 'Monto', `<input type="number" id="inAmount" min="0" step="0.01" value="${ed?.amount ?? ''}" placeholder="0.00">`)}
      ${field('inNote', 'Nota', `<input type="text" id="inNote" value="${esc(ed?.note || '')}" placeholder="Opcional">`, true)}
    `)}
    <div class="trez-total">Total recaudado · ${monthLbl()}: <strong class="pos">${fmt(sum(data))}</strong></div>
    ${table(['Fecha', 'Fuente', 'Fondo', 'Monto', ''], (data || []).map(r => `
      <tr>
        <td>${fmtDate(r.occurred_on)}</td>
        <td>${esc(r.source)}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td>${esc(r.fund || '—')}</td>
        <td class="num pos">${fmt(r.amount)}</td>${kebabCell(r.id)}
      </tr>`).join(''), 'No hay ingresos este mes.')}`;

  bindForm(root, 'income', 'fin_income', () => {
    const amount = parseFloat(document.getElementById('inAmount').value);
    const source = document.getElementById('inSource').value.trim();
    if (!source) return 'Escribe la fuente del ingreso.';
    if (!(amount >= 0)) return 'Escribe un monto válido.';
    return { payload: {
      occurred_on: document.getElementById('inDate').value || todayISO(),
      source, fund: document.getElementById('inFund').value.trim() || null,
      amount, note: document.getElementById('inNote').value.trim() || null, created_by: currentUser?.id || null,
    } };
  }, { title: r => r?.source });
}

/* ── Gastos (this month) ───────────────────────────────────────────────────── */
async function renderExpenses(root) {
  const { data, error } = await sb.from('fin_expenses').select('*')
    .gte('occurred_on', mStart()).lte('occurred_on', mEnd()).order('occurred_on', { ascending: false });
  if (error) { root.innerHTML = errBox(error); return; }
  cache.expenses = data || [];
  const ed = editRow('expenses');

  root.innerHTML = `
    ${addForm('expenses', ed, `
      ${field('exDate', 'Fecha', `<input type="date" id="exDate" value="${ed?.occurred_on || todayISO()}">`)}
      ${field('exAlloc', 'Asignar a', `<select id="exAlloc">${allocOptions(allocEncode(ed))}</select>`)}
      ${field('exPayee', 'Pagado a', `<input type="text" id="exPayee" value="${esc(ed?.payee || '')}" placeholder="Proveedor / persona">`)}
      ${field('exCat', 'Categoría', `<input type="text" id="exCat" value="${esc(ed?.category || '')}" placeholder="Renta / Materiales">`)}
      ${field('exAmount', 'Monto', `<input type="number" id="exAmount" min="0" step="0.01" value="${ed?.amount ?? ''}" placeholder="0.00">`)}
      ${field('exStatus', 'Estado', `<select id="exStatus"><option value="paid"${ed?.status==='paid'?' selected':''}>Pagado</option><option value="pending"${ed?.status==='pending'?' selected':''}>Pendiente</option></select>`)}
      ${field('exNote', 'Nota', `<input type="text" id="exNote" value="${esc(ed?.note || '')}" placeholder="Opcional">`, true)}
    `)}
    <div class="trez-total">Total gastado · ${monthLbl()}: <strong class="neg">${fmt(sum(data))}</strong></div>
    ${table(['Fecha', 'Asignado a', 'Pagado a', 'Monto', 'Estado', ''], (data || []).map(r => `
      <tr>
        <td>${fmtDate(r.occurred_on)}</td>
        <td>${esc(allocName(r))}${r.category ? `<span class="trez-sub">${esc(r.category)}</span>` : ''}</td>
        <td>${esc(r.payee || '—')}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td class="num neg">${fmt(r.amount)}</td>
        <td>${statusPill(r.status)}</td>${kebabCell(r.id)}
      </tr>`).join(''), 'No hay gastos este mes.')}`;

  bindForm(root, 'expenses', 'fin_expenses', () => {
    const amount = parseFloat(document.getElementById('exAmount').value);
    if (!(amount >= 0)) return 'Escribe un monto válido.';
    const alloc = allocDecode(document.getElementById('exAlloc').value);
    return { payload: {
      occurred_on: document.getElementById('exDate').value || todayISO(),
      ministry_id: alloc.ministry_id, label: alloc.label,
      payee: document.getElementById('exPayee').value.trim() || null,
      category: document.getElementById('exCat').value.trim() || null,
      amount, status: document.getElementById('exStatus').value,
      note: document.getElementById('exNote').value.trim() || null, created_by: currentUser?.id || null,
    } };
  }, { title: r => r?.payee || allocName(r) });
}

/* ── Recurrentes (stipends / monthly) ──────────────────────────────────────── */
async function renderRecurring(root) {
  const { data, error } = await sb.from('fin_recurring').select('*').order('active', { ascending: false }).order('payee');
  if (error) { root.innerHTML = errBox(error); return; }
  cache.recurring = data || [];
  const ed = editRow('recurring');
  const FREQ = { monthly: 'Mensual', weekly: 'Semanal', yearly: 'Anual' };

  root.innerHTML = `
    <p class="trez-lead">Pagos que se repiten — estipendios (ej. el del pastor), renta, suscripciones. Usa “Registrar este mes” para llevarlo al libro de gastos.</p>
    ${addForm('recurring', ed, `
      ${field('rcPayee', 'Pagado a', `<input type="text" id="rcPayee" value="${esc(ed?.payee || '')}" placeholder="Pastor — estipendio">`)}
      ${field('rcAlloc', 'Asignar a', `<select id="rcAlloc">${allocOptions(allocEncode(ed))}</select>`)}
      ${field('rcCat', 'Categoría', `<input type="text" id="rcCat" value="${esc(ed?.category || '')}" placeholder="Personal / Servicios">`)}
      ${field('rcAmount', 'Monto', `<input type="number" id="rcAmount" min="0" step="0.01" value="${ed?.amount ?? ''}" placeholder="0.00">`)}
      ${field('rcFreq', 'Frecuencia', `<select id="rcFreq"><option value="monthly"${(ed?.frequency||'monthly')==='monthly'?' selected':''}>Mensual</option><option value="weekly"${ed?.frequency==='weekly'?' selected':''}>Semanal</option><option value="yearly"${ed?.frequency==='yearly'?' selected':''}>Anual</option></select>`)}
      ${field('rcDay', 'Día del mes', `<input type="number" id="rcDay" min="1" max="31" value="${ed?.day_of_month ?? ''}" placeholder="1–31">`)}
      ${field('rcNote', 'Nota', `<input type="text" id="rcNote" value="${esc(ed?.note || '')}" placeholder="Opcional">`, true)}
    `)}
    ${table(['Pagado a', 'Asignado a', 'Monto', 'Frecuencia', 'Activo', ''], (data || []).map(r => `
      <tr class="${r.active ? '' : 'is-paid'}">
        <td>${esc(r.payee)}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td>${esc(allocName(r))}</td>
        <td class="num neg">${fmt(r.amount)}</td>
        <td>${FREQ[r.frequency] || r.frequency}${r.day_of_month ? ` · día ${r.day_of_month}` : ''}</td>
        <td>${r.active ? '<span class="trez-pill trez-pill--paid">Sí</span>' : '<span class="trez-pill trez-pill--pending">No</span>'}</td>${kebabCell(r.id)}
      </tr>`).join(''), 'No hay pagos recurrentes.')}`;

  bindForm(root, 'recurring', 'fin_recurring', () => {
    const payee = document.getElementById('rcPayee').value.trim();
    const amount = parseFloat(document.getElementById('rcAmount').value);
    const day = parseInt(document.getElementById('rcDay').value, 10);
    if (!payee) return 'Escribe a quién se paga.';
    if (!(amount >= 0)) return 'Escribe un monto válido.';
    const alloc = allocDecode(document.getElementById('rcAlloc').value);
    return { payload: {
      payee, ministry_id: alloc.ministry_id, label: alloc.label,
      category: document.getElementById('rcCat').value.trim() || null,
      amount, frequency: document.getElementById('rcFreq').value,
      day_of_month: (day >= 1 && day <= 31) ? day : null,
      note: document.getElementById('rcNote').value.trim() || null, created_by: currentUser?.id || null,
    } };
  }, {
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
    note: 'Generado de pago recurrente', created_by: currentUser?.id || null,
  });
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
              <input type="number" min="0" step="0.01" data-bud="${l.key}" value="${byKey[l.key] ?? ''}" placeholder="0.00"></div>
            <button class="btn btn--ghost btn--sm" data-budsave="${l.key}">Guardar</button>
          </div>`).join('')}
      </div>
    </div>`;

  root.querySelectorAll('[data-budsave]').forEach(btn => btn.addEventListener('click', async () => {
    const key = btn.dataset.budsave;
    const line = lines.find(l => l.key === key);
    const amount = parseFloat(root.querySelector(`[data-bud="${CSS.escape(key)}"]`).value);
    if (!(amount >= 0)) { toast('Monto inválido', 'error'); return; }
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
  const ed = editRow('payables');
  const open = (data || []).filter(p => p.status === 'open');

  root.innerHTML = `
    ${addForm('payables', ed, `
      ${field('pyWho', 'Se le debe a', `<input type="text" id="pyWho" value="${esc(ed?.creditor || '')}" placeholder="Proveedor / persona">`)}
      ${field('pyAmount', 'Monto', `<input type="number" id="pyAmount" min="0" step="0.01" value="${ed?.amount ?? ''}" placeholder="0.00">`)}
      ${field('pyDue', 'Vence', `<input type="date" id="pyDue" value="${ed?.due_on || ''}">`)}
      ${field('pyMin', 'Ministerio', `<select id="pyMin"><option value="">— General —</option>${ministries.map(m => `<option value="${m.id}"${ed?.ministry_id===m.id?' selected':''}>${esc(m.name)}</option>`).join('')}</select>`)}
      ${field('pyNote', 'Nota', `<input type="text" id="pyNote" value="${esc(ed?.note || '')}" placeholder="Opcional">`, true)}
    `)}
    <div class="trez-total">Total abierto: <strong class="neg">${fmt(sum(open))}</strong></div>
    ${table(['Se le debe a', 'Monto', 'Vence', 'Ministerio', 'Estado', ''], (data || []).map(r => `
      <tr class="${r.status === 'paid' ? 'is-paid' : ''}">
        <td>${esc(r.creditor)}${r.note ? `<span class="trez-sub">${esc(r.note)}</span>` : ''}</td>
        <td class="num neg">${fmt(r.amount)}</td>
        <td>${fmtDate(r.due_on)}</td>
        <td>${esc(minName(r.ministry_id))}</td>
        <td>${r.status === 'paid' ? statusPill('paid') : '<span class="trez-pill trez-pill--owe">Abierto</span>'}</td>${kebabCell(r.id)}
      </tr>`).join(''), 'No hay cuentas por pagar.')}`;

  bindForm(root, 'payables', 'fin_payables', () => {
    const creditor = document.getElementById('pyWho').value.trim();
    const amount = parseFloat(document.getElementById('pyAmount').value);
    if (!creditor) return 'Escribe a quién se le debe.';
    if (!(amount >= 0)) return 'Escribe un monto válido.';
    return { payload: {
      creditor, amount, due_on: document.getElementById('pyDue').value || null,
      ministry_id: document.getElementById('pyMin').value || null,
      note: document.getElementById('pyNote').value.trim() || null, created_by: currentUser?.id || null,
    } };
  }, {
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
    const bal = m.in - m.out; ytd += bal;
    const has = m.in || m.out;
    const detail = has ? `
      <tr class="trez-report__detail" id="rep-${i}" hidden><td colspan="5">
        <div class="trez-report__cols">
          <div><h4 class="pos"><i class="fas fa-arrow-down"></i> Ingresos</h4>
            ${m.income.length ? m.income.map(r => `<div class="trez-report__line"><span>${fmtDate(r.occurred_on)} · ${esc(r.source)}${r.fund?` · ${esc(r.fund)}`:''}</span><span class="pos">${fmt(r.amount)}</span></div>`).join('') : '<p class="muted">—</p>'}</div>
          <div><h4 class="neg"><i class="fas fa-arrow-up"></i> Gastos</h4>
            ${m.expense.length ? m.expense.map(r => `<div class="trez-report__line"><span>${fmtDate(r.occurred_on)} · ${esc(r.payee || allocName(r))}</span><span class="neg">${fmt(r.amount)}</span></div>`).join('') : '<p class="muted">—</p>'}</div>
        </div>
      </td></tr>` : '';
    return `
      <tr class="trez-report__row${has ? '' : ' is-muted'}" ${has ? `data-rep="${i}"` : ''}>
        <td>${has ? '<i class="fas fa-chevron-right trez-report__chev"></i> ' : ''}${MONTHS[i]}</td>
        <td class="num pos">${m.in ? fmt(m.in) : '—'}</td>
        <td class="num neg">${m.out ? fmt(m.out) : '—'}</td>
        <td class="num ${bal < 0 ? 'neg' : 'pos'}">${has ? fmt(bal) : '—'}</td>
        <td class="num ${ytd < 0 ? 'neg' : ''}">${fmt(ytd)}</td>
      </tr>${detail}`;
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
    const i = row.dataset.rep;
    const det = document.getElementById(`rep-${i}`);
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
  const ed = editRow('notes');

  root.innerHTML = `
    ${addForm('notes', ed, `
      ${field('ntBody', 'Nota o recordatorio', `<input type="text" id="ntBody" value="${esc(ed?.body || '')}" placeholder="Ej. Pagar al músico el viernes">`, true)}
      ${field('ntMin', 'Ministerio', `<select id="ntMin"><option value="">— General —</option>${ministries.map(m => `<option value="${m.id}"${ed?.ministry_id===m.id?' selected':''}>${esc(m.name)}</option>`).join('')}</select>`)}
      ${field('ntPin', 'Fijar', `<label class="trez-check"><input type="checkbox" id="ntPin"${ed?.pinned?' checked':''}> Mantener arriba</label>`)}
    `)}
    <div class="trez-notes">
      ${(data || []).length ? (data || []).map(n => `
        <div class="trez-note${n.pinned ? ' pinned' : ''}">
          ${n.pinned ? '<i class="fas fa-thumbtack trez-note__pin"></i>' : ''}
          <div class="trez-note__body">${esc(n.body)}</div>
          <div class="trez-note__meta">${esc(minName(n.ministry_id))} · ${fmtDate((n.created_at || '').slice(0,10))}</div>
          <button class="adm-icon-btn trez-note__del" data-kebab="${n.id}" title="Acciones"><i class="fas fa-ellipsis-vertical"></i></button>
        </div>`).join('') : '<div class="empty-state"><i class="fas fa-note-sticky"></i><p>Sin notas todavía.</p></div>'}
    </div>`;

  bindForm(root, 'notes', 'fin_notes', () => {
    const body = document.getElementById('ntBody').value.trim();
    if (!body) return 'Escribe la nota.';
    return { payload: {
      body, ministry_id: document.getElementById('ntMin').value || null,
      pinned: document.getElementById('ntPin').checked, created_by: currentUser?.id || null,
    } };
  }, { title: r => r?.body });
}

/* ── shared building blocks ────────────────────────────────────────────────── */
function errBox(e) { return `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(e?.message || 'Error')}</p></div>`; }
function editRow(key) { return editing[key] ? (cache[key] || []).find(r => r.id === editing[key]) : null; }
function field(id, label, control, full) { return `<div class="trez-field${full ? ' trez-field--full' : ''}"><label for="${id}">${label}</label>${control}</div>`; }
function kebabCell(id) { return `<td class="row-act"><button class="adm-icon-btn" data-kebab="${id}" title="Acciones" aria-label="Acciones"><i class="fas fa-ellipsis-vertical"></i></button></td>`; }
function addForm(key, ed, fields) {
  return `<form class="trez-add${ed ? ' editing' : ''}" data-add="${key}">
    <div class="trez-add__grid">${fields}</div>
    <div class="trez-add__err" id="trezErr_${key}"></div>
    <div class="trez-add__actions">
      <button type="submit" class="btn btn--primary btn--sm"><i class="fas fa-${ed ? 'check' : 'plus'}"></i> ${ed ? 'Guardar cambios' : 'Agregar'}</button>
      ${ed ? `<button type="button" class="btn btn--ghost btn--sm" data-canceledit="${key}">Cancelar</button>` : ''}
    </div></form>`;
}
function table(heads, rowsHtml, emptyMsg) {
  if (!rowsHtml) return `<div class="empty-state"><i class="fas fa-inbox"></i><p>${emptyMsg}</p></div>`;
  return `<div class="trez-tablewrap"><table class="trez-table">
    <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}
function statusPill(s) {
  return s === 'paid' ? '<span class="trez-pill trez-pill--paid">Pagado</span>' : '<span class="trez-pill trez-pill--pending">Pendiente</span>';
}
// Add/edit form + ⋮ row menu (Editar · [extra] · Eliminar).
function bindForm(root, key, tableName, build, opts = {}) {
  const form = root.querySelector(`[data-add="${key}"]`);
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById(`trezErr_${key}`);
    if (errEl) errEl.textContent = '';
    const res = build();
    if (typeof res === 'string') { if (errEl) errEl.textContent = res; return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const q = editing[key] ? sb.from(tableName).update(res.payload).eq('id', editing[key]) : sb.from(tableName).insert(res.payload);
    const { error } = await q;
    btn.disabled = false;
    if (error) { if (errEl) errEl.textContent = error.message; return; }
    toast(editing[key] ? 'Actualizado' : 'Agregado', 'success');
    editing[key] = null;
    render();
  });
  root.querySelector(`[data-canceledit="${key}"]`)?.addEventListener('click', () => { editing[key] = null; render(); });

  root.querySelectorAll('[data-kebab]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.kebab;
    const row = (cache[key] || []).find(r => r.id === id);
    const actions = [
      { label: 'Editar', icon: 'fa-pen', onClick: () => { editing[key] = id; render(); window.scrollTo(0, 0); } },
      ...((opts.extra && row) ? opts.extra(row) : []),
      { label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: async () => {
          if (!await confirm('Eliminar', '¿Eliminar este registro? No se puede deshacer.')) return;
          const { error } = await sb.from(tableName).delete().eq('id', id);
          if (error) { toast(error.message, 'error'); return; }
          toast('Eliminado', 'success'); render();
        } },
    ];
    showActionSheet({ trigger: btn, title: (opts.title && row) ? opts.title(row) : undefined, actions });
  }));
}
