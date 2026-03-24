// /js/pages/admin.js
// Admin panel — Iglesia Restauración Divina
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://snqwxgyhfiinouewxgiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXd4Z3loZmlpbm91ZXd4Z2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjMxNzAsImV4cCI6MjA3MTM5OTE3MH0.LgxKa56FGiHRZB24s8ikfg5epV5QXdG3aVkgPIRMneo';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
auth: { persistSession: true, autoRefreshToken: true }
});
// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let ministries = [];
let editingEventId = null;
let confirmResolve = null;
let selectedMinistries = new Set();
let _upcomingSpecial = [];
let _upcomingRegular = [];
let _pastSpecial = [];
let _pastRegular = [];
// Calendar state
let calEventsList = [];
let admCalYear = new Date().getFullYear();
let admCalMonth = new Date().getMonth();
// Form state
let fTagPicker, bTagPicker;
let selPresetIdx = null;
let galleryImages = null;
let selPresetIdxs = new Set();
// ─── Helpers ──────────────────────────────────────────────────────────────────
const isAdmin = () => currentProfile?.role === 'admin';
const pad2 = n => String(n).padStart(2, '0');
const todayISO = () => {
const t = new Date();
return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
};
const MONTHS = [
'Enero','Febrero','Marzo','Abril','Mayo','Junio',
'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
const MONTHS_SHORT = [
'Ene','Feb','Mar','Abr','May','Jun',
'Jul','Ago','Sep','Oct','Nov','Dic'
];
const ADM_MONTHS = MONTHS;
const ADM_DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const ADM_DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const CAT_COLORS = {
servicio: '#1e6b61',
estudio: '#2a4a9e',
oracion: '#5c3d9c',
evangelizacion: '#a05a10',
especial: '#b02030',
otro: '#888',
};
// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
const el = document.createElement('div');
el.className = `toast-item toast-item--${type}`;
const icon = type === 'success' ? 'check-circle'
: type === 'error' ? 'exclamation-circle'
: 'info-circle';
el.innerHTML = `<i class="fas fa-${icon}"></i> ${msg}`;
document.getElementById('toast').appendChild(el);
setTimeout(() => el.remove(), 4000);
}
// ─── Confirm ──────────────────────────────────────────────────────────────────
function confirm(title, msg) {
return new Promise(r => {
confirmResolve = r;
document.getElementById('confirmTitle').textContent = title;
document.getElementById('confirmMsg').textContent = msg;
openModal('confirmModal');
});
}
// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(id) {
document.getElementById(id).classList.add('open');
document.body.style.overflow = 'hidden';
}
function closeModal(id) {
document.getElementById(id).classList.remove('open');
document.body.style.overflow = '';
}
// ─── Auth ─────────────────────────────────────────────────────────────────────
async function tryLogin() {
const email = document.getElementById('loginEmail').value.trim();
const password = document.getElementById('loginPassword').value;
const errEl = document.getElementById('authError');
const btn = document.getElementById('loginBtn');
errEl.style.display = 'none';
btn.disabled = true;
btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
try {
const { data, error } = await sb.auth.signInWithPassword({ email, password });
btn.disabled = false;
btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
if (error) { errEl.textContent = `Error: ${error.message}`; errEl.style.display = ''; return; }
await bootApp(data.user);
} catch (e) {
btn.disabled = false;
btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
errEl.textContent = `Error inesperado: ${e.message}`;
errEl.style.display = '';
}
}
// Unified helper — reads checked months from the smart-panel dropdown
function getSelectedMonths() {
const menu = document.getElementById('monthDropdownMenu');
if (!menu) return [];
const checkedBoxes = menu.querySelectorAll('input[type=checkbox]:checked');
return Array.from(checkedBoxes).map(cb => parseInt(cb.value));
}
// ─── Boot ─────────────────────────────────────────────────────────────────────
async function bootApp(user) {
currentUser = user;
const { data: profile, error: profileErr } = await sb
.from('profiles').select('*,ministries(name,color)').eq('id', user.id).single();
if (profileErr) console.error('[admin] Profile load FAILED:', profileErr.message);
currentProfile = profile || { role: 'ministry', display_name: user.email, ministry_id: null };
document.getElementById('topbarUser').textContent = currentProfile.display_name || user.email;
if (isAdmin()) {
document.body.classList.add('is-admin');
document.getElementById('topbarMinistry').textContent = '— Admin';
document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
} else {
document.getElementById('topbarMinistry').textContent =
`— ${profile?.ministries?.name || 'Ministerio'}`;
}
document.getElementById('authScreen').style.display = 'none';
document.getElementById('app').style.display = 'block';
await loadMinistries();
await loadUpcoming();
initForms();
}
// ─── Ministries ───────────────────────────────────────────────────────────────
async function loadMinistries() {
const { data } = await sb.from('ministries').select('*').order('name');
ministries = data || [];
const opts = ministries.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
['filterMinistry', 'evMinistry', 'uMinistry'].forEach(id => {
const el = document.getElementById(id);
if (!el) return;
el.innerHTML = id === 'filterMinistry'
? `<option value="">Todos</option>` + opts
: opts;
});
if (!isAdmin() && currentProfile?.ministry_id) {
['evMinistry', 'uMinistry'].forEach(id => {
const el = document.getElementById(id);
if (el) el.value = currentProfile.ministry_id;
});
}
renderMinistriesTab();
buildFilterChecks();
}
function renderMinistriesTab() {
const el = document.getElementById('ministriesList');
if (!ministries.length) {
el.innerHTML = '<p style="color:var(--color-muted)">No hay ministerios.</p>';
return;
}
el.innerHTML = ministries.map(m => `
<div class="ministry-card">
<div class="ministry-card__dot" style="background:${m.color}"></div>
<div>
<div class="ministry-card__name">${m.name}</div>
<div class="ministry-card__id">${m.id}</div>
</div>
</div>`).join('');
}
// ─── Normalize events table row ───────────────────────────────────────────────
function normalizeEventsRow(row) {
if (!row?.starts_at) return null;
const d = new Date(row.starts_at);
const dateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const h = d.getHours();
const m = d.getMinutes();
const mid = row.ministry_id || null;
const mObj = mid ? (ministries.find(x => x.id === mid) || null) : null;
return {
id: `evt-${row.id}`,
title: row.title || 'Evento',
date: dateStr,
time: `${(h % 12) || 12}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`,
location: row.location || '',
description: row.description || '',
category: 'especial',
cancelled: false,
ministry_id: mid,
image_url: row.image_url || null,
ministries: mObj ? { name: mObj.name, color: mObj.color } : null,
tag: row.tag || null,
fromEventsTable: true,
};
}
// ─── Load upcoming ────────────────────────────────────────────────────────────
async function loadUpcoming() {
const el = document.getElementById('upcomingList');
el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
try {
const today = todayISO();
let specialData = [];
if (isAdmin()) {
const { data: evRows } = await sb
.from('events')
.select('id,title,starts_at,location,description,tag,image_url,ministry_id')
.gte('starts_at', new Date().toISOString())
.order('starts_at', { ascending: true });
specialData = (evRows || []).map(normalizeEventsRow).filter(Boolean);
}
let calQ = sb.from('calendar_events')
.select('*,ministries(name,color)')
.gte('date', today)
.order('date', { ascending: true });
if (!isAdmin() && currentProfile?.ministry_id)
calQ = calQ.eq('ministry_id', currentProfile.ministry_id);
const { data: calData, error: calErr } = await calQ;
if (calErr) throw calErr;
_upcomingSpecial = specialData;
_upcomingRegular = calData || [];
renderUpcomingFiltered();
} catch (e) {
el.innerHTML = `<div class="empty-state">
<i class="fas fa-exclamation-triangle"></i><p>Error: ${e.message}</p>
</div>`;
}
}
function renderUpcomingFiltered() {
const el = document.getElementById('upcomingList');
if (!el) return;
const sp = filterEventsByMinistry(_upcomingSpecial);
const rg = filterEventsByMinistry(_upcomingRegular);
if (!sp.length && !rg.length) {
el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No hay eventos con estos filtros.</p></div>';
return;
}
let html = '';
if (sp.length) html += '<div class="section-divider"><i class="fas fa-star"></i> Eventos Especiales</div>' + buildEventsTableHtml(sp, false);
if (rg.length) html += '<div class="section-divider"><i class="fas fa-calendar-check"></i> Actividades Regulares</div>' + buildEventsTableHtml(rg, false);
el.innerHTML = html;
}
function renderPastFiltered() {
const el = document.getElementById('pastList');
if (!el) return;
const sp = filterEventsByMinistry(_pastSpecial);
const rg = filterEventsByMinistry(_pastRegular);
if (!sp.length && !rg.length) {
el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No hay eventos con estos filtros.</p></div>';
return;
}
let html = '';
if (sp.length) html += '<div class="section-divider"><i class="fas fa-star"></i> Eventos Especiales</div>' + buildEventsTableHtml(sp, true);
if (rg.length) html += '<div class="section-divider"><i class="fas fa-calendar-check"></i> Actividades Regulares</div>' + buildEventsTableHtml(rg, true);
el.innerHTML = html;
}
async function loadPast() {
const el = document.getElementById('pastList');
el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
try {
const today = todayISO();
let specialData = [];
if (isAdmin()) {
const { data: evRows } = await sb
.from('events')
.select('id,title,starts_at,location,description,tag,image_url,ministry_id')
.lt('starts_at', new Date().toISOString())
.order('starts_at', { ascending: false });
specialData = (evRows || []).map(normalizeEventsRow).filter(Boolean);
}
let calQ = sb.from('calendar_events')
.select('*,ministries(name,color)')
.lt('date', today)
.order('date', { ascending: false });
if (!isAdmin() && currentProfile?.ministry_id)
calQ = calQ.eq('ministry_id', currentProfile.ministry_id);
const { data: calData, error: calErr } = await calQ;
if (calErr) throw calErr;
_pastSpecial = specialData;
_pastRegular = calData || [];
renderPastFiltered();
} catch (e) {
el.innerHTML = `<div class="empty-state">
<i class="fas fa-exclamation-triangle"></i><p>Error: ${e.message}</p>
</div>`;
}
}
// ─── Events table ─────────────────────────────────────────────────────────────
function fmtDate(d) {
if (!d) return '—';
const [y, m, day] = d.split('-').map(Number);
return new Date(y, m - 1, day).toLocaleDateString('es', {
weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
});
}
function fmtTime(t) {
if (!t) return '—';
if (/[AP]M$/i.test(t)) return t;
const [h, m] = t.split(':').map(Number);
if (isNaN(h)) return t;
return `${((h % 12) || 12)}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}
function catLabel(c) {
return {
servicio: 'Servicio', estudio: 'Estudio Bíblico', oracion: 'Oración',
evangelizacion: 'Evangelización', especial: 'Especial', otro: 'Otro'
}[c] || c;
}
function buildEventsTableHtml(events, isPastTab) {
if (!events.length) return '';
const today = todayISO();
const groups = new Map();
for (const ev of events) {
if (!ev.date) continue;
const [y, m] = ev.date.split('-').map(Number);
const k = `${y}-${String(m).padStart(2, '0')}`;
if (!groups.has(k)) groups.set(k, []);
groups.get(k).push(ev);
}
function fmtCompact(dateStr, time) {
if (!dateStr) return '—';
const [y, m, d] = dateStr.split('-').map(Number);
return `${m}/${d}/${String(y).slice(-2)}${time ? ' ' + time : ''}`;
}
let html = '';
for (const [k, evs] of groups) {
const [y, m] = k.split('-').map(Number);
const monthLabel = `${MONTHS[m - 1]} ${y}`;
const rows = evs.map(ev => {
const isPast = ev.date < today;
const rowClass = ev.cancelled ? 'row--cancelled' : isPast ? 'row--past' : '';
const minName = ev.ministries?.name || '—';
const minDot = ev.ministries?.color
? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ev.ministries.color};margin-right:5px"></span>`
: '';
const imgCell = ev.image_url
? `<img src="${ev.image_url}" alt="" style="width:44px;height:32px;object-fit:cover;border-radius:4px;display:block">`
: `<div style="width:44px;height:32px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:#aaa">—</div>`;
const editBtn = ev.fromEventsTable
? `<button class="icon-btn__admin" title="Editar" onclick="openEditEventFromTable('${ev.id.replace('evt-', '')}')"><i class="fas fa-pen"></i></button>`
: `<button class="icon-btn__admin" title="Editar" onclick="openEditEvent('${ev.id}')"><i class="fas fa-pen"></i></button>`;
return `
<tr class="${rowClass}" data-id="${ev.id}">
<td>${imgCell}</td>
<td><div class="event-title">${ev.title}</div></td>
<td style="white-space:nowrap">${fmtCompact(ev.date, ev.time)}</td>
<td><span class="cat-badge cat--${ev.category || 'otro'}">${catLabel(ev.category || 'otro')}</span></td>
<td>${minDot}${minName}</td>
<td>
<div class="row-actions">
${!isPastTab ? `
${editBtn}
<button class="icon-btn__admin ${ev.cancelled ? 'success' : 'warn'}"
title="${ev.cancelled ? 'Reactivar' : 'Cancelar'}"
onclick="toggleCancel('${ev.id}', ${ev.cancelled})">
<i class="fas fa-${ev.cancelled ? 'undo' : 'ban'}"></i>
</button>` : ''}
<button class="icon-btn__admin danger" title="Eliminar"
onclick="deleteEvent('${ev.id}', '${(ev.title || '').replace(/'/g, "\\'")}', ${!!ev.fromEventsTable})">
<i class="fas fa-trash"></i>
</button>
</div>
</td>
</tr>`;
}).join('');
html += `
<div class="month-group-label">${monthLabel}</div>
<table class="events-table" style="width:100%;margin-bottom:.75rem">
<thead>
<tr>
<th style="width:52px"></th>
<th>Evento</th>
<th style="width:110px">Cuándo</th>
<th style="width:120px">Categoría</th>
<th>Ministerio</th>
<th style="width:100px">Acciones</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>`;
}
return html;
}
function renderEventsTable(container, events, isPastTab) {
container.innerHTML = buildEventsTableHtml(events, isPastTab)
|| `<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No hay eventos aquí todavía.</p></div>`;
}
// ─── Edit / Save calendar_events ──────────────────────────────────────────────
window.openEditEvent = async (id) => {
const { data: ev } = await sb.from('calendar_events').select('*').eq('id', id).single();
if (!ev) return;
editingEventId = id;
document.getElementById('eventModalTitle').textContent = 'Editar Evento';
document.getElementById('evTitle').value = ev.title;
document.getElementById('evDate').value = ev.date;
let t24 = '';
if (ev.time) {
if (/[AP]M$/i.test(ev.time)) {
const [tm, ap] = ev.time.split(' ');
const [h, m] = tm.split(':').map(Number);
const h2 = ap === 'PM' && h !== 12 ? h + 12 : ap === 'AM' && h === 12 ? 0 : h;
t24 = `${pad2(h2)}:${pad2(m)}`;
} else {
t24 = ev.time;
}
}
document.getElementById('evTime').value = t24;
document.getElementById('evLocation').value = ev.location || '';
document.getElementById('evDescription').value = ev.description || '';
document.getElementById('evCategory').value = ev.category || 'otro';
document.getElementById('evCancelled').checked = ev.cancelled || false;
document.getElementById('evMinistry').value = ev.ministry_id || '';
document.getElementById('eventModalError').style.display = 'none';
openModal('eventModal');
};
// ─── Toggle cancel / Delete ───────────────────────────────────────────────────
window.toggleCancel = async (id, wasCancelled) => {
const ok = await confirm(
wasCancelled ? '¿Reactivar evento?' : '¿Cancelar evento?',
`El evento aparecerá como ${wasCancelled ? 'activo' : 'cancelado'} en el calendario.`
);
if (!ok) return;
const { error } = await sb.from('calendar_events').update({ cancelled: !wasCancelled }).eq('id', id);
if (error) { toast(error.message, 'error'); return; }
toast(wasCancelled ? 'Evento reactivado' : 'Evento cancelado', 'success');
loadUpcoming();
};
window.deleteEvent = async (id, title, fromEventsTable) => {
const ok = await confirm('¿Eliminar evento?', `"${title}" se eliminará permanentemente.`);
if (!ok) return;
let error;
if (fromEventsTable) {
const rawId = id.replace('evt-', '');
({ error } = await sb.from('events').delete().eq('id', rawId));
} else {
({ error } = await sb.from('calendar_events').delete().eq('id', id));
}
if (error) { toast(error.message, 'error'); return; }
toast('Evento eliminado', 'success');
loadUpcoming();
loadPast();
};
// ─── Calendar tab ─────────────────────────────────────────────────────────────
async function loadCalendario() {
const { data: calData, error: calErr } = await sb
.from('calendar_events')
.select('*,ministries(name,color)')
.order('date', { ascending: true });
if (calErr) { toast('Error cargando calendario: ' + calErr.message, 'error'); return; }
const { data: evRows, error: evErr } = await sb
.from('events')
.select('id,title,starts_at,location,description,tag,image_url,ministry_id')
.order('starts_at', { ascending: true });
if (evErr) console.warn('[cal] events load error:', evErr.message);
function resolveMinistry(mid) {
if (!mid) return null;
const m = ministries.find(x => x.id === mid);
return m ? { name: m.name, color: m.color } : null;
}
const lp = n => String(n).padStart(2, '0');
const evMapped = (evRows || []).map(row => {
if (!row?.starts_at) return null;
const d = new Date(row.starts_at);
const dateStr = `${d.getFullYear()}-${lp(d.getMonth() + 1)}-${lp(d.getDate())}`;
const h = d.getHours(), m = d.getMinutes();
return {
id: `evt-${row.id}`,
title: row.title || 'Evento',
date: dateStr,
time: `${(h % 12) || 12}:${lp(m)} ${h >= 12 ? 'PM' : 'AM'}`,
location: row.location || '',
description: row.description || '',
category: 'especial',
cancelled: false,
ministry_id: row.ministry_id || null,
ministries: resolveMinistry(row.ministry_id),
image_url: row.image_url || null,
fromEventsTable: true,
};
}).filter(Boolean);
const calMapped = (calData || []).map(row => ({
...row,
ministries: row.ministries || resolveMinistry(row.ministry_id),
}));
calEventsList = [...calMapped, ...evMapped].sort((a, b) => a.date > b.date ? 1 : -1);
renderAdmCal();
}
function renderAdmCal() {
const y = admCalYear, m = admCalMonth;
document.getElementById('admCalLabel').textContent = `${ADM_MONTHS[m]} ${y}`;
document.getElementById('admCalWeekdays').innerHTML =
ADM_DAYS.map(d => `<div class="adm-cal-wd">${d}</div>`).join('');
const filteredCalEvents = filterEventsByMinistry(calEventsList);
const idx = {};
for (const ev of filteredCalEvents) {
if (!ev.date) continue;
const [ey, em] = ev.date.split('-').map(Number);
if (ey === y && em - 1 === m) {
(idx[ev.date] = idx[ev.date] || []).push(ev);
}
}
const today = todayISO();
const firstDow = new Date(y, m, 1).getDay();
const daysInMonth = new Date(y, m + 1, 0).getDate();
const lp = n => String(n).padStart(2, '0');
const ds = d => `${y}-${lp(m + 1)}-${lp(d)}`;
let html = '';
for (let i = 0; i < firstDow; i++) html += `<div class="adm-cal-cell adm-cal-cell--empty"></div>`;
for (let d = 1; d <= daysInMonth; d++) {
const dateStr = ds(d);
const evs = idx[dateStr] || [];
const isToday = dateStr === today;
const isCellPast = dateStr < today && !isToday;
const cellCls = isToday ? 'adm-cal-cell--today' : isCellPast ? 'adm-cal-cell--past' : '';
const dots = evs.slice(0, 5).map(ev =>
`<span class="adm-cal-dot adm-cal-dot--${ev.category || 'otro'}"></span>`
).join('');
const chips = evs.slice(0, 3).map(ev => {
const cat = ev.category || 'otro';
const cc = ev.cancelled ? ' adm-cal-ev--cancelled' : '';
const st = (ev.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
return `
<div class="adm-cal-ev adm-cal-ev--${cat}${cc}">
<span class="adm-cal-ev__label">${ev.title}</span>
<span class="adm-cal-ev__actions">
<button class="adm-cal-ev__btn adm-cal-ev__btn--edit"
onclick="event.stopPropagation();calEdit('${ev.id}')" title="Editar">✏</button>
<button class="adm-cal-ev__btn ${ev.cancelled ? 'adm-cal-ev__btn--undo' : 'adm-cal-ev__btn--cancel'}"
onclick="event.stopPropagation();calToggle('${ev.id}',${ev.cancelled})"
title="${ev.cancelled ? 'Reactivar' : 'Cancelar'}">${ev.cancelled ? '↩' : '⊘'}</button>
<button class="adm-cal-ev__btn adm-cal-ev__btn--delete"
onclick="event.stopPropagation();calDelete('${ev.id}','${st}')" title="Eliminar">✕</button>
</span>
</div>`;
}).join('');
const more = evs.length > 3 ? `<div class="adm-cal-more">+${evs.length - 3}</div>` : '';
html += `
<div class="adm-cal-cell${cellCls ? ' ' + cellCls : ''}" data-date="${dateStr}" data-has="${evs.length ? 1 : 0}">
<div class="adm-cal-num">${d}</div>
<div class="adm-cal-dots">${dots}</div>
${chips}${more}
</div>`;
}
const daysEl = document.getElementById('admCalDays');
daysEl.innerHTML = html;
daysEl.querySelectorAll('.adm-cal-cell[data-has="1"]').forEach(cell => {
cell.addEventListener('click', () => {
const evs = idx[cell.dataset.date] || [];
if (evs.length) openDaySheet(cell.dataset.date, evs);
});
});
renderAdmUpcoming();
}
// ─── Upcoming tabs below calendar ─────────────────────────────────────────────
function renderAdmUpcoming() {
document.querySelectorAll('[data-adm-target]').forEach(btn => {
if (btn.dataset.admWired) return;
btn.dataset.admWired = '1';
btn.addEventListener('click', () => {
document.querySelectorAll('[data-adm-target]').forEach(b => b.classList.remove('active'));
document.querySelectorAll('#admCalUpcoming .cal-tab-panel').forEach(p => p.hidden = true);
btn.classList.add('active');
const t = document.getElementById(btn.dataset.admTarget);
if (t) t.hidden = false;
});
});
const lp = n => String(n).padStart(2, '0');
const today = todayISO();
const monthStart = `${admCalYear}-${lp(admCalMonth + 1)}-01`;
const lastDay = new Date(admCalYear, admCalMonth + 1, 0).getDate();
const monthEnd = `${admCalYear}-${lp(admCalMonth + 1)}-${lp(lastDay)}`;
const allFiltered = filterEventsByMinistry(calEventsList)
.filter(ev => ev.date >= monthStart && ev.date <= monthEnd);
const specialEvs = allFiltered.filter(ev => ev.fromEventsTable && ev.date >= today);
const regularEvs = allFiltered.filter(ev => !ev.fromEventsTable && ev.date >= today);
renderAdmTab(document.getElementById('admTabSpecial'), specialEvs, true);
renderAdmTab(document.getElementById('admTabRegular'), regularEvs, false);
}
function renderAdmTab(container, evs, isSpecial) {
if (!container) return;
if (!evs.length) {
container.innerHTML = `<p class="cal-list__empty">${
isSpecial ? 'No hay eventos especiales este mes.' : 'Sin actividades este mes.'
}</p>`;
return;
}
const today = todayISO();
const groups = new Map();
for (const ev of evs) {
if (!groups.has(ev.date)) groups.set(ev.date, []);
groups.get(ev.date).push(ev);
}
let html = '';
for (const [date, dayEvs] of groups) {
const [y, mo, d] = date.split('-').map(Number);
const label = `${ADM_DAY_NAMES[new Date(y, mo - 1, d).getDay()]}, ${d} de ${MONTHS[mo - 1]}`;
html += `<div class="adm-list__day-group"><div class="adm-list__day-label">${label}</div>`;
for (const ev of dayEvs) {
const color = CAT_COLORS[ev.category || 'otro'] || '#888';
const isCancelled = ev.cancelled;
const minName = ev.ministries?.name || '';
const safeTitle = (ev.title || '').replace(/'/g, "\\'");
const imgHtml = isSpecial && ev.image_url
? `<img class="adm-list__thumb" src="${ev.image_url}" alt="" loading="lazy">`
: `<span class="adm-list__dot" style="background:${color}"></span>`;
const editAction = isSpecial
? `openEditEventFromTable('${ev.id.replace('evt-', '')}')`
: `calEdit('${ev.id}')`;
const cancelAction = isSpecial
? `toggleCancel('${ev.id}', ${isCancelled})`
: `calToggle('${ev.id}', ${isCancelled})`;
const deleteAction = isSpecial
? `deleteEvent('${ev.id}', '${safeTitle}', true)`
: `calDelete('${ev.id}', '${safeTitle}')`;
html += `
<div class="adm-list__item${isCancelled ? ' cancelled' : ''}">
${imgHtml}
<div class="adm-list__info">
<div class="adm-list__name">
${ev.title}
${isCancelled ? '<span class="adm-list__cancelled-badge">Cancelado</span>' : ''}
</div>
<div class="adm-list__meta">
${ev.time ? `<span><i class="far fa-clock" style="margin-right:3px;opacity:.6"></i>${ev.time}</span>` : ''}
${minName ? `<span>· ${minName}</span>` : ''}
</div>
</div>
<div class="adm-list__actions">
<button class="icon-btn__admin " title="Editar"
onclick="event.stopPropagation();${editAction}">
<i class="fas fa-pen"></i>
</button>
<button class="icon-btn__admin ${isCancelled ? 'success' : 'warn'}"
title="${isCancelled ? 'Reactivar' : 'Cancelar'}"
onclick="event.stopPropagation();${cancelAction}">
<i class="fas fa-${isCancelled ? 'undo' : 'ban'}"></i>
</button>
<button class="icon-btn__admin danger" title="Eliminar"
onclick="event.stopPropagation();${deleteAction}">
<i class="fas fa-trash"></i>
</button>
</div>
</div>`;
}
html += '</div>';
}
container.innerHTML = html;
}
// ─── Day sheet (mobile) ───────────────────────────────────────────────────────
function openDaySheet(dateStr, evs) {
const [y, m, d] = dateStr.split('-').map(Number);
const dow = ADM_DAY_NAMES[new Date(y, m - 1, d).getDay()];
document.getElementById('daySheetDate').textContent = `${dow}, ${d} de ${ADM_MONTHS[m - 1]} ${y}`;
document.getElementById('daySheetEvents').innerHTML = evs.map(ev => {
const color = CAT_COLORS[ev.category || 'otro'];
const cc = ev.cancelled ? ' cancelled' : '';
const st = (ev.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
return `
<div class="day-sheet__ev${cc}">
<span class="day-sheet__ev-dot" style="background:${color}"></span>
<div class="day-sheet__ev-info">
<div class="day-sheet__ev-title">
${ev.title}
${ev.cancelled ? '<span style="font-size:.65rem;color:#b02030;margin-left:4px">(Cancelado)</span>' : ''}
</div>
<div class="day-sheet__ev-time">${ev.time || ''}</div>
</div>
<div class="day-sheet__ev-actions">
<button class="icon-btn__admin " title="Editar"
onclick="closeDaySheet();calEdit('${ev.id}')">
<i class="fas fa-pen"></i>
</button>
<button class="icon-btn__admin ${ev.cancelled ? 'success' : 'warn'}"
title="${ev.cancelled ? 'Reactivar' : 'Cancelar'}"
onclick="closeDaySheet();calToggle('${ev.id}',${ev.cancelled})">
<i class="fas fa-${ev.cancelled ? 'undo' : 'ban'}"></i>
</button>
<button class="icon-btn__admin danger" title="Eliminar"
onclick="closeDaySheet();calDelete('${ev.id}','${st}')">
<i class="fas fa-trash"></i>
</button>
</div>
</div>`;
}).join('');
document.getElementById('daySheetBackdrop').classList.add('open');
document.body.style.overflow = 'hidden';
}
function closeDaySheet() {
document.getElementById('daySheetBackdrop').classList.remove('open');
document.body.style.overflow = '';
}
window.closeDaySheet = closeDaySheet;
// ─── Calendar event CRUD ──────────────────────────────────────────────────────
window.calEdit = async (id) => {
const ev = calEventsList.find(e => e.id === id);
if (!ev) return;
editingEventId = id;
document.getElementById('eventModalTitle').textContent = 'Editar Actividad';
document.getElementById('evTitle').value = ev.title;
document.getElementById('evDate').value = ev.date;
let t24 = '';
if (ev.time) {
if (/[AP]M$/i.test(ev.time)) {
const [tm, ap] = ev.time.split(' ');
const [h, m] = tm.split(':').map(Number);
const h2 = ap === 'PM' && h !== 12 ? h + 12 : ap === 'AM' && h === 12 ? 0 : h;
t24 = `${String(h2).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
} else {
t24 = ev.time;
}
}
document.getElementById('evTime').value = t24;
document.getElementById('evLocation').value = ev.location || '';
document.getElementById('evDescription').value = ev.description || '';
document.getElementById('evCategory').value = ev.category || 'otro';
document.getElementById('evCancelled').checked = ev.cancelled || false;
document.getElementById('evMinistry').value = ev.ministry_id || '';
document.getElementById('eventModalError').style.display = 'none';
openModal('eventModal');
};
window.calToggle = async (id, wasCancelled) => {
const ok = await confirm(
wasCancelled ? '¿Reactivar?' : '¿Cancelar evento?',
`El evento aparecerá como ${wasCancelled ? 'activo' : 'cancelado'}.`
);
if (!ok) return;
const { error } = await sb.from('calendar_events').update({ cancelled: !wasCancelled }).eq('id', id);
if (error) { toast(error.message, 'error'); return; }
toast(wasCancelled ? 'Reactivado' : 'Cancelado', 'success');
loadCalendario();
};
window.calDelete = async (id, title) => {
const ok = await confirm('¿Eliminar actividad?', `"${title}" se eliminará permanentemente.`);
if (!ok) return;
const { error } = await sb.from('calendar_events').delete().eq('id', id);
if (error) { toast(error.message, 'error'); return; }
toast('Eliminado', 'success');
loadCalendario();
};
// ─── Smart presets ────────────────────────────────────────────────────────────
const CAL_PRESETS = [
{ title: 'Estudio Bíblico', sub: 'Todos los martes · 7:00 PM', category: 'estudio', time: '7:00 PM', location: '2601 Clays Mill Rd, Lexington, KY 40503', description: 'Estudio profundo de la Palabra de Dios cada martes. ¡Trae tu Biblia!', pattern: { type: 'weekly', dow: 2 } },
{ title: 'Servicio de Oración', sub: 'Todos los viernes · 7:00 PM', category: 'oracion', time: '7:00 PM', location: '2601 Clays Mill Rd, Lexington, KY 40503', description: 'Reunión semanal de oración e intercesión cada viernes.', pattern: { type: 'weekly', dow: 5 } },
{ title: 'Servicio Dominical', sub: 'Todos los domingos · 2:00 PM', category: 'servicio', time: '2:00 PM', location: '2601 Clays Mill Rd, Lexington, KY 40503', description: 'Únete a nosotros cada domingo para adorar a Dios en comunidad.', pattern: { type: 'weekly', dow: 0 } },
{ title: 'Evangelización', sub: 'Todos los sábados · 10:00 AM', category: 'evangelizacion', time: '10:00 AM', location: 'Punto de salida: 2601 Clays Mill Rd', description: 'Salida de evangelización cada sábado. Contacta a Javier para más info.', pattern: { type: 'weekly', dow: 6 } },
{ title: 'Noche de Caballeros',sub: 'Último sábado · 7:00 PM', category: 'especial', time: '7:00 PM', location: '2601 Clays Mill Rd, Lexington, KY 40503', description: 'Una noche de compañerismo entre hombres de fe.', pattern: { type: 'lastWeekday', dow: 6 } },
{ title: 'Noche de Damas', sub: '3er viernes · 7:00 PM', category: 'especial', time: '7:00 PM', location: '2601 Clays Mill Rd, Lexington, KY 40503', description: 'Una noche especial para las mujeres de la iglesia.', pattern: { type: 'nthWeekday', n: 3, dow: 5 } },
];
const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
function getDates(pattern, year, month) {
const days = new Date(year, month + 1, 0).getDate();
const result = [];
if (pattern.type === 'weekly') {
for (let d = 1; d <= days; d++) {
if (new Date(year, month, d).getDay() === pattern.dow) result.push(ymd(year, month, d));
}
} else if (pattern.type === 'lastWeekday') {
for (let d = days; d >= 1; d--) {
if (new Date(year, month, d).getDay() === pattern.dow) { result.push(ymd(year, month, d)); break; }
}
} else if (pattern.type === 'nthWeekday') {
let c = 0;
for (let d = 1; d <= days; d++) {
if (new Date(year, month, d).getDay() === pattern.dow) {
c++;
if (c === pattern.n) { result.push(ymd(year, month, d)); break; }
}
}
}
return result;
}
function buildPresetGrid() {
const g = document.getElementById('presetGrid');
g.innerHTML = CAL_PRESETS.map((p, i) => `
<div class="preset-card" data-idx="${i}">
<div class="preset-card__title">${p.title}</div>
<div class="preset-card__sub">${p.sub}</div>
</div>`).join('');
g.querySelectorAll('.preset-card').forEach(c => {
c.onclick = () => {
const idx = Number(c.dataset.idx);
if (selPresetIdxs.has(idx)) {
selPresetIdxs.delete(idx);
c.classList.remove('selected');
} else {
selPresetIdxs.add(idx);
c.classList.add('selected');
}
updateSmartPreview();
};
});
}
function updateSmartPreview() {
const year = Number(document.getElementById('smartYear').value);
const selectedMonths = getSelectedMonths();
let allDates = [];
selPresetIdxs.forEach(idx => {
const p = CAL_PRESETS[idx];
selectedMonths.forEach(month => {
const dates = getDates(p.pattern, year, month);
dates.forEach(d => {
allDates.push({
date: d,
preset: p
});
});
});
});
allDates.sort((a, b) => a.date.localeCompare(b.date));
document.getElementById('smartCount').textContent = allDates.length;
document.getElementById('previewPills').innerHTML = allDates.map(({ date, preset }) => {
const [y, mo, day] = date.split('-').map(Number);
return `
<span class="preview-pill">
${preset.title} · ${new Date(y, mo - 1, day).toLocaleDateString('es', {
weekday: 'short',
day: 'numeric',
month: 'short'
})}
</span>`;
}).join('');
document.getElementById('smartPreview').style.display =
allDates.length ? 'block' : 'none';
}
function closeSmartPanel() { document.getElementById('smartPanel').classList.remove('open'); }
// ─── Users ────────────────────────────────────────────────────────────────────
async function loadUsers() {
const el = document.getElementById('usersList');
el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
const { data, error } = await sb.from('profiles').select('*').order('created_at');
if (error) { el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${error.message}</p></div>`; return; }
if (!data?.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios todavía.</p></div>'; return; }
el.innerHTML = data.map(u => {
const initials = (u.display_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
const mObj = ministries.find(x => x.id === u.ministry_id) || null;
const minName = mObj?.name || '—';
const minDot = mObj?.color
? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${mObj.color};margin-right:4px"></span>`
: '';
return `
<div class="user-row">
<div class="user-row__avatar">${initials}</div>
<div class="user-row__info">
<div class="user-row__name">${u.display_name || '—'}</div>
<div class="user-row__meta">${minDot}${minName}</div>
</div>
<span class="role-badge role--${u.role}">${u.role === 'admin' ? 'Admin' : 'Ministerio'}</span>
</div>`;
}).join('');
}
// ─── Ministry filter ──────────────────────────────────────────────────────────
function buildFilterChecks() {
if (!isAdmin()) return;
['filterBarWrap', 'filterPanel', 'calFilterBarWrap', 'calFilterPanel'].forEach(id => {
const el = document.getElementById(id);
if (el) el.style.display = '';
});
const checkHtml = ministries.map(m => `
<label class="filter-check" data-id="${m.id}">
<input type="checkbox" value="${m.id}" checked>
<span class="filter-check__dot" style="background:${m.color}"></span>
<span>${m.name}</span>
</label>`).join('');
document.getElementById('filterChecks').innerHTML = checkHtml;
document.getElementById('calFilterChecks').innerHTML = checkHtml;
selectedMinistries = new Set(ministries.map(m => m.id));
document.querySelectorAll('#filterChecks input[type=checkbox], #calFilterChecks input[type=checkbox]')
.forEach(cb => cb.addEventListener('change', onFilterChange));
}
function syncFilterUIs() {
const allSelected = selectedMinistries.size === ministries.length;
['filterChecks', 'calFilterChecks'].forEach(id => {
document.querySelectorAll(`#${id} input[type=checkbox]`).forEach(cb => {
cb.checked = selectedMinistries.has(cb.value);
});
});
[['filterBadge', 'filterToggleBtn'], ['calFilterBadge', 'calFilterToggleBtn']].forEach(([badgeId, btnId]) => {
const badge = document.getElementById(badgeId);
const btn = document.getElementById(btnId);
if (!badge || !btn) return;
badge.textContent = allSelected ? '' : selectedMinistries.size;
badge.classList.toggle('hidden', allSelected);
btn.classList.toggle('active', !allSelected);
});
}
function onFilterChange(e) {
const val = e.target.value;
const checked = e.target.checked;
document.querySelectorAll(`#filterChecks input[value="${val}"], #calFilterChecks input[value="${val}"]`)
.forEach(cb => cb.checked = checked);
selectedMinistries = new Set(
[...document.querySelectorAll('#filterChecks input[type=checkbox]')]
.filter(ch => ch.checked).map(ch => ch.value)
);
syncFilterUIs();
renderUpcomingFiltered();
renderPastFiltered();
if (document.getElementById('tab-calendario').classList.contains('active')) {
renderAdmCal();
}
}
function filterEventsByMinistry(events) {
if (!selectedMinistries.size) return [];
return events.filter(ev => !ev.ministry_id || selectedMinistries.has(ev.ministry_id));
}
// ─── View switcher ────────────────────────────────────────────────────────────
function showView(name) {
['list', 'form', 'bulk'].forEach(v => {
const el = document.getElementById(`view-${v}`);
if (el) el.classList.toggle('active', v === name);
});
window.scrollTo(0, 0);
}
// ─── Event presets ────────────────────────────────────────────────────────────
const EVENT_PRESETS = [
{ title: 'Noche de Caballeros', tags: ['Servicio','Convivio'], img: 'caballeros.png', desc: 'Una noche de compañerismo entre hombres de fe. Tiempo de oración, estudio bíblico, comida y edificación mutua. Ven a crecer espiritualmente junto a tus hermanos en Cristo.' },
{ title: 'Noche de Damas', tags: ['Servicio','Convivio'], img: 'damas.png', desc: 'Una noche especial para las mujeres de la iglesia. Alabanza, oración, comunión y compañerismo. Habrá comida y un tiempo de fortalecimiento espiritual entre hermanas en Cristo.' },
{ title: 'Vigilia', tags: ['Servicio','Oración'], img: 'vigilia.png', desc: 'Una noche especial de oración, adoración y comunión. Ven a buscar la presencia de Dios junto a tus hermanos en Cristo. Habrá café, comida, alabanza y un tiempo inolvidable de fe.' },
{ title: 'Devocional', tags: ['Servicio','Oración'], img: 'devocional.png', desc: 'Un tiempo dedicado a la reflexión bíblica, oración y crecimiento espiritual. Acompáñanos para profundizar en la Palabra de Dios.' },
{ title: 'Noche de Jóvenes', tags: ['Servicio','Convivio'], img: '', desc: 'Una noche de comunión entre jóvenes. Palabra, comida y actividades. ¡Ven a conectar con tu generación en Cristo!' },
{ title: 'Día de las Madres', tags: ['Celebración','Servicio'], img: 'madres.png', desc: 'Un servicio especial para honrar y celebrar a las madres de nuestra comunidad.' },
{ title: 'Día del Padre', tags: ['Celebración','Servicio'], img: 'padre.png', desc: 'Celebramos a los padres de nuestra iglesia con un servicio especial lleno de gratitud.' },
{ title: 'Día del Niño', tags: ['Celebración','Niños'], img: 'nino.png', desc: 'Celebración para los más pequeños. Juegos, actividades, comida y un mensaje especial.' },
{ title: 'Thanksgiving', tags: ['Celebración','Convivio'], img: 'thanksgivings.png', desc: 'Servicio de acción de gracias. Cena especial, alabanza y testimonios de gratitud.' },
{ title: 'Comida Navideña', tags: ['Celebración','Convivio'], img: 'cenanavidena.png', desc: 'Celebramos el nacimiento de Cristo con cena, villancicos y compañerismo.' },
{ title: 'Campaña Evangelística',tags:['Evangelismo','Servicio'], img: 'campanaEvangelistica.png', desc: 'Servicios enfocados en compartir las buenas nuevas de Cristo con la comunidad.' },
{ title: 'Aniversario', tags: ['Celebración','Servicio'], img: 'aniversario.png', desc: 'Celebración del aniversario de nuestra iglesia. Alabanza, testimonios y compañerismo.' },
];
const TAG_OPTIONS = ['Servicio','Convivio','Celebración','Evangelismo','Ministerio','Oración','Adoración','Jóvenes','Niños'];
const IMG_BASE = 'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/event-images/';
const DEFAULT_LOC = '2601 Clays Mill Road';
function populateTypeSelect(selId) {
const s = document.getElementById(selId);
s.innerHTML = '<option value="">— Seleccionar tipo —</option>';
EVENT_PRESETS.forEach((p, i) => {
const o = document.createElement('option');
o.value = i; o.textContent = p.title;
s.appendChild(o);
});
const c = document.createElement('option');
c.value = '__custom__'; c.textContent = 'Otro / Personalizado';
s.appendChild(c);
}
function wireTypeSelect(selId, customId, noteId, tagPicker, descId, descGroupId, imgUrlId, previewId, pwrapId) {
document.getElementById(selId).onchange = () => {
const v = document.getElementById(selId).value;
const isPreset = v !== '' && v !== '__custom__';
const isCustom = v === '__custom__';
document.getElementById(customId).classList.toggle('show', isCustom);
if (isCustom) document.getElementById(customId).focus();
const note = document.getElementById(noteId);
if (isPreset) {
note.textContent = `✓ Preset: ${EVENT_PRESETS[Number(v)].title}`;
note.classList.add('show');
} else {
note.classList.remove('show');
}
if (isPreset) {
const p = EVENT_PRESETS[Number(v)];
tagPicker.setTags(p.tags);
tagPicker.setDisabled(true);
document.getElementById(descId).value = p.desc;
document.getElementById(descId).readOnly = true;
document.getElementById(descGroupId).classList.add('fg-locked');
let n = document.getElementById(descGroupId).querySelector('.fg-locked-note');
if (!n) {
n = document.createElement('p');
n.className = 'fg-locked-note';
n.style.cssText = 'font-size:.7rem;color:var(--color-primary);font-weight:600;margin-top:.2rem';
document.getElementById(descGroupId).appendChild(n);
}
n.textContent = 'Auto-completado por preset.';
if (p.img) {
const url = IMG_BASE + p.img;
document.getElementById(imgUrlId).value = url;
document.getElementById(previewId).src = url;
document.getElementById(pwrapId).style.display = 'inline-block';
}
} else {
tagPicker.setDisabled(false);
document.getElementById(descId).readOnly = false;
document.getElementById(descGroupId).classList.remove('fg-locked');
const n = document.getElementById(descGroupId).querySelector('.fg-locked-note');
if (n) n.remove();
if (!isPreset) document.getElementById(descId).value = '';
}
};
}
function getTitle(selId, customId) {
const v = document.getElementById(selId).value;
if (v === '__custom__') return document.getElementById(customId).value.trim();
if (v === '') return '';
return EVENT_PRESETS[Number(v)]?.title || '';
}
// ─── Tag picker ───────────────────────────────────────────────────────────────
function mountTagPicker(containerId, hiddenId) {
const container = document.getElementById(containerId);
const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'tag-picker-btn';
btn.id = `${hiddenId}-btn`;
btn.innerHTML = `<span class="tag-pills" id="${hiddenId}-pills"><span style="color:var(--color-muted)">Seleccionar...</span></span><span style="font-size:9px">▼</span>`;
container.appendChild(btn);
const dd = document.createElement('div');
dd.className = 'tag-dropdown';
dd.id = `${hiddenId}-dd`;
TAG_OPTIONS.forEach(tag => {
const l = document.createElement('label');
l.className = 'tag-opt';
l.innerHTML = `<input type="checkbox" value="${tag}"><span>${tag}</span>`;
dd.appendChild(l);
});
const cw = document.createElement('div');
cw.className = 'tag-custom-wrap';
cw.innerHTML = `<input type="text" placeholder="Categoría personalizada..." id="${hiddenId}-custom">`;
dd.appendChild(cw);
container.appendChild(dd);
container.classList.add('tag-picker');
const upd = () => {
const checks = [...dd.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
const cv = document.getElementById(`${hiddenId}-custom`).value.trim();
if (cv && checks.length < 2) checks.push(cv);
document.getElementById(hiddenId).value = checks.join('/');
const pills = document.getElementById(`${hiddenId}-pills`);
pills.innerHTML = checks.length
? checks.map(t => `<span class="tag-pill">${t}</span>`).join('')
: `<span style="color:var(--color-muted)">Seleccionar...</span>`;
dd.querySelectorAll('.tag-opt').forEach(o => {
const cb = o.querySelector('input[type=checkbox]');
if (cb && !cb.checked && checks.length >= 2) o.classList.add('disabled');
else if (cb) o.classList.remove('disabled');
});
};
dd.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', upd));
document.getElementById(`${hiddenId}-custom`).addEventListener('input', upd);
btn.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('open'); });
document.addEventListener('click', e => { if (!container.contains(e.target)) dd.classList.remove('open'); });
return {
setTags(tags) {
dd.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = tags.includes(cb.value); });
document.getElementById(`${hiddenId}-custom`).value = '';
const cu = tags.filter(t => !TAG_OPTIONS.includes(t));
if (cu.length) document.getElementById(`${hiddenId}-custom`).value = cu[0];
upd();
},
setDisabled(d) { document.getElementById(`${hiddenId}-btn`).classList.toggle('disabled', d); },
reset() {
dd.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
document.getElementById(`${hiddenId}-custom`).value = '';
upd();
}
};
}
// ─── Location override ────────────────────────────────────────────────────────
function wireLocOverride(inputId, btnId) {
const input = document.getElementById(inputId);
const btn = document.getElementById(btnId);
btn.onclick = () => {
if (input.readOnly) {
input.readOnly = false; input.value = ''; input.focus();
btn.textContent = 'Restaurar'; btn.classList.add('active');
} else {
input.readOnly = true; input.value = DEFAULT_LOC;
btn.textContent = 'Cambiar'; btn.classList.remove('active');
}
};
}
function resetLoc(inputId, btnId) {
document.getElementById(inputId).value = DEFAULT_LOC;
document.getElementById(inputId).readOnly = true;
document.getElementById(btnId).textContent = 'Cambiar';
document.getElementById(btnId).classList.remove('active');
}
// ─── Image picker ─────────────────────────────────────────────────────────────
function mountImgPicker(sectionEl, prefix) {
sectionEl.innerHTML = `
<div class="img-grid">
<div class="img-opt" id="${prefix}-opt-upload">
<i class="fas fa-upload" style="font-size:1.4rem;margin-bottom:.3rem;color:var(--color-muted)"></i>
<div style="font-size:.78rem;font-weight:600">Subir nueva</div>
<div style="font-size:.68rem;color:var(--color-muted)">JPG, PNG, WebP</div>
<input type="file" accept="image/*" id="${prefix}-file">
</div>
<div class="img-opt" id="${prefix}-opt-gallery">
<i class="fas fa-images" style="font-size:1.4rem;margin-bottom:.3rem;color:var(--color-muted)"></i>
<div style="font-size:.78rem;font-weight:600">Usar existente</div>
<div style="font-size:.68rem;color:var(--color-muted)">Del almacén</div>
</div>
</div>
<div class="img-gallery" id="${prefix}-gallery" style="display:none"></div>
<div class="img-preview-wrap" id="${prefix}-preview-wrap" style="display:none">
<img class="img-preview" id="${prefix}-preview" alt="">
<button type="button" class="img-del-btn" id="${prefix}-del"><i class="fas fa-trash"></i></button>
</div>
<input type="hidden" id="${prefix}-url">
<div style="font-size:.7rem;color:var(--color-muted);margin-top:.3rem" id="${prefix}-status"></div>`;
document.getElementById(`${prefix}-opt-gallery`).onclick = () => toggleGallery(prefix);
document.getElementById(`${prefix}-file`).onchange = e => handleImgUpload(e, prefix);
document.getElementById(`${prefix}-del`).onclick = () => clearImg(prefix);
}
function clearImg(p) {
document.getElementById(`${p}-url`).value = '';
document.getElementById(`${p}-preview`).src = '';
document.getElementById(`${p}-preview-wrap`).style.display = 'none';
document.getElementById(`${p}-status`).textContent = '';
const f = document.getElementById(`${p}-file`);
if (f) f.value = '';
document.getElementById(`${p}-opt-upload`).classList.remove('active');
document.getElementById(`${p}-opt-gallery`).classList.remove('active');
const g = document.getElementById(`${p}-gallery`);
if (g) { g.style.display = 'none'; g.querySelectorAll('.img-gal-item').forEach(i => i.classList.remove('selected')); }
}
async function loadGallery(prefix) {
const g = document.getElementById(`${prefix}-gallery`);
g.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-muted)">Cargando...</div>';
const { data, error } = await sb.storage.from('event-images').list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
if (error || !data) { g.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--danger)">Error al cargar.</div>'; return; }
const imgs = data.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
galleryImages = imgs;
if (!imgs.length) { g.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-muted)">No hay imágenes.</div>'; return; }
g.innerHTML = imgs.map(img => {
const { data: u } = sb.storage.from('event-images').getPublicUrl(img.name);
return `<div class="img-gal-item" data-url="${u.publicUrl}"><img src="${u.publicUrl}" alt="" loading="lazy"></div>`;
}).join('');
g.querySelectorAll('.img-gal-item').forEach(el => el.onclick = () => {
g.querySelectorAll('.img-gal-item').forEach(i => i.classList.remove('selected'));
el.classList.add('selected');
document.getElementById(`${prefix}-url`).value = el.dataset.url;
document.getElementById(`${prefix}-preview`).src = el.dataset.url;
document.getElementById(`${prefix}-preview-wrap`).style.display = 'inline-block';
document.getElementById(`${prefix}-status`).textContent = 'Seleccionada ✓';
});
}
function toggleGallery(prefix) {
const g = document.getElementById(`${prefix}-gallery`);
const show = g.style.display === 'none';
g.style.display = show ? 'grid' : 'none';
document.getElementById(`${prefix}-opt-gallery`).classList.toggle('active', show);
if (show && !galleryImages) loadGallery(prefix);
}
async function handleImgUpload(e, prefix) {
const file = e.target.files?.[0];
if (!file) return;
document.getElementById(`${prefix}-opt-upload`).classList.add('active');
document.getElementById(`${prefix}-preview`).src = URL.createObjectURL(file);
document.getElementById(`${prefix}-preview-wrap`).style.display = 'inline-block';
document.getElementById(`${prefix}-status`).textContent = 'Subiendo...';
const fn = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${file.name.split('.').pop()}`;
const { error } = await sb.storage.from('event-images').upload(fn, file, { cacheControl: '3600', upsert: false });
if (error) { document.getElementById(`${prefix}-status`).textContent = 'Error al subir.'; return; }
const { data: u } = sb.storage.from('event-images').getPublicUrl(fn);
document.getElementById(`${prefix}-url`).value = u.publicUrl;
document.getElementById(`${prefix}-status`).textContent = 'Subida ✓';
galleryImages = null;
}
function toLocalDT(iso) {
try {
const d = new Date(iso);
const p = n => String(n).padStart(2, '0');
return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
} catch { return ''; }
}
// ─── Init forms ───────────────────────────────────────────────────────────────
function initForms() {
populateTypeSelect('fType');
populateTypeSelect('bType');
fTagPicker = mountTagPicker('fTagPicker', 'fTag');
bTagPicker = mountTagPicker('bTagPicker', 'bTag');
mountImgPicker(document.getElementById('fImgSection'), 'f');
mountImgPicker(document.getElementById('bImgSection'), 'b');
wireTypeSelect('fType', 'fTitleCustom', 'fPresetNote', fTagPicker, 'fDesc', 'fDescGroup', 'f-url', 'f-preview', 'f-preview-wrap');
wireTypeSelect('bType', 'bTitleCustom', 'bPresetNote', bTagPicker, 'bDesc', 'bDescGroup', 'b-url', 'b-preview', 'b-preview-wrap');
wireLocOverride('fLoc', 'fLocBtn');
wireLocOverride('bLoc', 'bLocBtn');
}
// ─── Edit from events table ───────────────────────────────────────────────────
window.openEditEventFromTable = async (rawId) => {
const { data: ev } = await sb.from('events').select('*').eq('id', rawId).single();
if (!ev) return;
document.getElementById('formTitle').textContent = 'Editar Evento';
document.getElementById('fId').value = ev.id;
const idx = EVENT_PRESETS.findIndex(p => p.title === ev.title);
if (idx >= 0) {
document.getElementById('fType').value = String(idx);
document.getElementById('fTitleCustom').classList.remove('show');
} else if (ev.title) {
document.getElementById('fType').value = '__custom__';
document.getElementById('fTitleCustom').classList.add('show');
document.getElementById('fTitleCustom').value = ev.title;
} else {
document.getElementById('fType').value = '';
}
document.getElementById('fType').dispatchEvent(new Event('change'));
if (ev.tag) fTagPicker.setTags(ev.tag.split('/').map(t => t.trim()));
if (ev.description) document.getElementById('fDesc').value = ev.description;
if (ev.starts_at) document.getElementById('fStarts').value = toLocalDT(ev.starts_at);
if (ev.ends_at) document.getElementById('fEnds').value = toLocalDT(ev.ends_at);
resetLoc('fLoc', 'fLocBtn');
if (ev.location && ev.location !== DEFAULT_LOC) {
document.getElementById('fLoc').value = ev.location;
document.getElementById('fLoc').readOnly = false;
document.getElementById('fLocBtn').textContent = 'Restaurar';
document.getElementById('fLocBtn').classList.add('active');
}
document.getElementById('fOrgName').value = ev.organizer_name || '';
document.getElementById('fOrgEmail').value = ev.organizer_email || '';
clearImg('f');
if (ev.image_url) {
document.getElementById('f-url').value = ev.image_url;
document.getElementById('f-preview').src = ev.image_url;
document.getElementById('f-preview-wrap').style.display = 'inline-block';
}
document.getElementById('fError').style.display = 'none';
showView('form');
};
function addBulkDate() {
const c = document.getElementById('bulkDates');
const r = document.createElement('div');
r.className = 'bulk-date-row';
r.innerHTML = `<input type="date" required><button type="button" class="bulk-date-remove">✕</button>`;
r.querySelector('.bulk-date-remove').onclick = () => { if (c.children.length > 1) { r.remove(); updateBulkSummary(); } };
r.querySelector('input').onchange = updateBulkSummary;
c.appendChild(r);
updateBulkSummary();
}
function updateBulkSummary() {
const n = [...document.getElementById('bulkDates').querySelectorAll('input[type=date]')]
.map(i => i.value).filter(Boolean).length;
document.getElementById('bulkSummary').textContent = n ? `${n} evento${n > 1 ? 's' : ''} serán creados` : '';
}
// ─── Boot on DOMContentLoaded ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
// Confirm modal
document.getElementById('confirmYes').addEventListener('click', () => { closeModal('confirmModal'); confirmResolve?.(true); });
document.getElementById('confirmNo').addEventListener('click', () => { closeModal('confirmModal'); confirmResolve?.(false); });
document.getElementById('confirmClose').addEventListener('click', () => { closeModal('confirmModal'); confirmResolve?.(false); });
// Auth
document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
document.getElementById('logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); window.location.reload(); });
// Event modal
document.getElementById('eventModalSave').addEventListener('click', async () => {
const title = (document.getElementById('evTitle').value || '').trim();
const date = document.getElementById('evDate').value;
const errEl = document.getElementById('eventModalError');
if (!title || !date) { errEl.textContent = 'El título y la fecha son obligatorios.'; errEl.style.display = ''; return; }
errEl.style.display = 'none';
const btn = document.getElementById('eventModalSave');
btn.disabled = true;
const timeRaw = document.getElementById('evTime').value;
let fmtT = null;
if (timeRaw) { const [h, m] = timeRaw.split(':').map(Number); fmtT = `${(h % 12) || 12}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`; }
const payload = {
title, date, time: fmtT,
location: document.getElementById('evLocation').value.trim() || null,
description: document.getElementById('evDescription').value.trim() || null,
category: document.getElementById('evCategory').value,
cancelled: document.getElementById('evCancelled').checked,
ministry_id: document.getElementById('evMinistry').value || currentProfile?.ministry_id || null,
created_by: currentUser.id,
};
const { error } = editingEventId
? await sb.from('calendar_events').update(payload).eq('id', editingEventId)
: await sb.from('calendar_events').insert(payload);
btn.disabled = false;
if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }
closeModal('eventModal');
toast(editingEventId ? 'Evento actualizado' : 'Evento agregado', 'success');
loadUpcoming();
if (document.getElementById('tab-calendario').classList.contains('active')) loadCalendario();
});
document.getElementById('eventModalClose').addEventListener('click', () => closeModal('eventModal'));
document.getElementById('eventModalCancel').addEventListener('click', () => closeModal('eventModal'));
// Day sheet
document.getElementById('daySheetBackdrop').addEventListener('click', e => {
if (e.target === e.currentTarget) closeDaySheet();
});
// Calendar nav
document.getElementById('admCalPrev').onclick = () => { if (--admCalMonth < 0) { admCalMonth = 11; admCalYear--; } loadCalendario(); };
document.getElementById('admCalNext').onclick = () => { if (++admCalMonth > 11) { admCalMonth = 0; admCalYear++; } loadCalendario(); };
document.getElementById('calAddBtn').onclick = () => {
editingEventId = null;
document.getElementById('eventModalTitle').textContent = 'Agregar Actividad';
document.getElementById('evTitle').value = '';
const lp = n => String(n).padStart(2, '0');
document.getElementById('evDate').value = `${admCalYear}-${lp(admCalMonth + 1)}-${lp(new Date().getDate())}`;
document.getElementById('evTime').value = '19:00';
document.getElementById('evLocation').value = '2601 Clays Mill Rd, Lexington, KY 40503';
document.getElementById('evDescription').value = '';
document.getElementById('evCategory').value = 'otro';
document.getElementById('evCancelled').checked = false;
document.getElementById('eventModalError').style.display = 'none';
openModal('eventModal');
};
// ── Smart preset panel ──────────────────────────────────────────────────────
// References
const monthDropdown = document.getElementById('monthDropdown');
const monthDropdownBtn = document.getElementById('monthDropdownBtn');
const monthDropdownMenu = document.getElementById('monthDropdownMenu');
const monthDropdownBadge = document.getElementById('monthDropdownBadge');
const monthClearAll = document.getElementById('monthClearAll');
const monthChecks = monthDropdownMenu.querySelectorAll('.smart-month-opt input[type="checkbox"]');
// Toggle dropdown open/close — only the button toggles
monthDropdownBtn.addEventListener('click', (e) => {
e.stopPropagation();
monthDropdown.classList.toggle('open');
});
// Prevent clicks inside the menu from closing it
monthDropdownMenu.addEventListener('click', (e) => {
e.stopPropagation();
});
// Close when clicking outside
document.addEventListener('click', (e) => {
if (!monthDropdown.contains(e.target)) {
monthDropdown.classList.remove('open');
}
});
// Update badge and button label on checkbox change
function updateMonthBadge() {
const checked = [...monthChecks].filter(c => c.checked);
const count = checked.length;
// Badge
monthDropdownBadge.textContent = count;
monthDropdownBadge.classList.toggle('visible', count > 0);
// Button label
const label = monthDropdownBtn.querySelector('.smart-month-btn__label');
if (count === 0) {
label.innerHTML = '<i class="fas fa-calendar-alt"></i> Seleccionar meses';
} else if (count <= 3) {
const names = checked.map(c => MONTHS_SHORT[+c.value]);
label.innerHTML = `<i class="fas fa-calendar-alt"></i> ${names.join(', ')}`;
} else {
const first3 = checked.slice(0, 3).map(c => MONTHS_SHORT[+c.value]);
label.innerHTML = `<i class="fas fa-calendar-alt"></i> ${first3.join(', ')} +${count - 3}`;
}
// Also update smart preview if presets are selected
if (selPresetIdxs.size) updateSmartPreview();
}
monthChecks.forEach(cb => cb.addEventListener('change', updateMonthBadge));
// Clear all months
monthClearAll.addEventListener('click', () => {
monthChecks.forEach(cb => { cb.checked = false; });
updateMonthBadge();
});
// Smart panel open
document.getElementById('calSmartBtn').onclick = () => {
const now = new Date();
document.getElementById('smartYear').value = now.getFullYear();
// Clear all month checkboxes on open
monthChecks.forEach(cb => { cb.checked = false; });
updateMonthBadge();
selPresetIdxs.clear();
document.getElementById('smartPreview').style.display = 'none';
document.getElementById('presetGrid').querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
document.getElementById('smartPanel').classList.add('open');
document.getElementById('smartPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
document.getElementById('smartClose').onclick = closeSmartPanel;
// Smart clear
document.getElementById('smartClear').onclick = () => {
selPresetIdxs.clear();
document.querySelectorAll('#presetGrid .preset-card')
.forEach(c => c.classList.remove('selected'));
document.getElementById('smartPreview').style.display = 'none';
};
// Year change triggers preview update
document.getElementById('smartYear').onchange = () => {
if (selPresetIdxs.size) updateSmartPreview();
};
// Smart create
document.getElementById('smartCreate').onclick = async () => {
if (!selPresetIdxs.size) return;
const year = Number(document.getElementById('smartYear').value);
const selectedMonths = getSelectedMonths();
if (!selectedMonths.length) {
toast('Selecciona al menos un mes', 'error');
return;
}
const btn = document.getElementById('smartCreate');
btn.disabled = true;
btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
let rows = [];
selPresetIdxs.forEach(idx => {
const p = CAL_PRESETS[idx];
selectedMonths.forEach(month => {
const dates = getDates(p.pattern, year, month);
dates.forEach(date => {
rows.push({
title: p.title,
date,
time: p.time,
location: p.location,
description: p.description,
category: p.category,
cancelled: false,
ministry_id: null,
created_by: currentUser?.id,
});
});
});
});
// Prevent duplicates
const { data: existing } = await sb
.from('calendar_events')
.select('date,title')
.in('date', rows.map(r => r.date));
const existingSet = new Set(
(existing || []).map(e => `${e.date}-${e.title}`)
);
rows = rows.filter(r =>
!existingSet.has(`${r.date}-${r.title}`)
);
if (!rows.length) {
toast('Todos los eventos ya existen', 'info');
btn.disabled = false;
btn.innerHTML = '<i class="fas fa-check"></i> Crear todos';
return;
}
const { error } = await sb.from('calendar_events').insert(rows);
btn.disabled = false;
btn.innerHTML = '<i class="fas fa-check"></i> Crear todos';
if (error) {
toast(error.message, 'error');
return;
}
toast(`${rows.length} actividades creadas`, 'success');
closeSmartPanel();
loadCalendario();
};
// Users
document.getElementById('addUserBtn').addEventListener('click', () => {
document.getElementById('uName').value = '';
document.getElementById('uEmail').value = '';
document.getElementById('uPassword').value = '';
document.getElementById('uRole').value = 'ministry';
document.getElementById('userModalError').style.display = 'none';
openModal('userModal');
});
document.getElementById('userModalSave').addEventListener('click', async () => {
const name = document.getElementById('uName').value.trim();
const email = document.getElementById('uEmail').value.trim();
const password = document.getElementById('uPassword').value;
const role = document.getElementById('uRole').value;
const minId = document.getElementById('uMinistry').value;
const errEl = document.getElementById('userModalError');
if (!name || !email || !password) { errEl.textContent = 'Nombre, correo y contraseña son obligatorios.'; errEl.style.display = ''; return; }
errEl.style.display = 'none';
const btn = document.getElementById('userModalSave');
btn.disabled = true;
const { error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name, role, ministry_id: minId || null } } });
btn.disabled = false;
if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }
closeModal('userModal');
toast(`Usuario creado: ${name}`, 'success');
loadUsers();
});
document.getElementById('userModalClose').addEventListener('click', () => closeModal('userModal'));
document.getElementById('userModalCancel').addEventListener('click', () => closeModal('userModal'));
// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
btn.addEventListener('click', () => {
document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
btn.classList.add('active');
const panel = document.getElementById(`tab-${btn.dataset.tab}`);
if (panel) panel.classList.add('active');
if (btn.dataset.tab === 'past') loadPast();
if (btn.dataset.tab === 'calendario') loadCalendario();
if (btn.dataset.tab === 'ministries') renderMinistriesTab();
if (btn.dataset.tab === 'users') loadUsers();
});
});
// Filter toggle buttons
document.getElementById('filterToggleBtn').addEventListener('click', () => {
document.getElementById('filterPanel').classList.toggle('open');
});
document.getElementById('calFilterToggleBtn').addEventListener('click', () => {
document.getElementById('calFilterPanel').classList.toggle('open');
});
// New event button
document.getElementById('newEventBtn').onclick = () => {
document.getElementById('formTitle').textContent = 'Nuevo Evento';
document.getElementById('fId').value = '';
document.getElementById('fType').value = '';
document.getElementById('fTitleCustom').value = '';
document.getElementById('fTitleCustom').classList.remove('show');
document.getElementById('fPresetNote').classList.remove('show');
fTagPicker.reset(); fTagPicker.setDisabled(false);
document.getElementById('fDesc').value = '';
document.getElementById('fDesc').readOnly = false;
document.getElementById('fDescGroup').classList.remove('fg-locked');
const n = document.getElementById('fDescGroup').querySelector('.fg-locked-note');
if (n) n.remove();
document.getElementById('fStarts').value = '';
document.getElementById('fEnds').value = '';
document.getElementById('fOrgName').value = '';
document.getElementById('fOrgEmail').value = '';
clearImg('f');
resetLoc('fLoc', 'fLocBtn');
document.getElementById('fError').style.display = 'none';
showView('form');
};
document.getElementById('formBack').onclick = () => showView('list');
document.getElementById('formCancel').onclick = () => showView('list');
document.getElementById('fSaveBtn').onclick = async () => {
const title = getTitle('fType', 'fTitleCustom');
if (!title) { toast('Selecciona o escribe un título', 'error'); return; }
const starts = document.getElementById('fStarts').value;
if (!starts) { toast('La fecha de inicio es obligatoria', 'error'); return; }
const errEl = document.getElementById('fError');
errEl.style.display = 'none';
const payload = {
title,
tag: document.getElementById('fTag').value || null,
location: document.getElementById('fLoc').value.trim() || null,
starts_at: new Date(starts).toISOString(),
ends_at: document.getElementById('fEnds').value ? new Date(document.getElementById('fEnds').value).toISOString() : null,
description: document.getElementById('fDesc').value.trim() || null,
organizer_name: document.getElementById('fOrgName').value.trim() || null,
organizer_email:document.getElementById('fOrgEmail').value.trim() || null,
image_url: document.getElementById('f-url').value || null,
};
const btn = document.getElementById('fSaveBtn');
btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
const id = document.getElementById('fId').value;
let error;
if (id) ({ error } = await sb.from('events').update(payload).eq('id', id));
else ({ error } = await sb.from('events').insert(payload));
btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Evento';
if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }
toast(id ? 'Evento actualizado' : 'Evento creado', 'success');
showView('list');
loadUpcoming();
};
// Bulk form
document.getElementById('bulkEventBtn').onclick = () => {
document.getElementById('bType').value = '';
document.getElementById('bTitleCustom').value = '';
document.getElementById('bTitleCustom').classList.remove('show');
document.getElementById('bPresetNote').classList.remove('show');
bTagPicker.reset(); bTagPicker.setDisabled(false);
document.getElementById('bDesc').value = '';
document.getElementById('bDesc').readOnly = false;
document.getElementById('bDescGroup').classList.remove('fg-locked');
const n = document.getElementById('bDescGroup').querySelector('.fg-locked-note');
if (n) n.remove();
clearImg('b');
resetLoc('bLoc', 'bLocBtn');
document.getElementById('bulkDates').innerHTML = '';
addBulkDate(); addBulkDate();
updateBulkSummary();
document.getElementById('bError').style.display = 'none';
showView('bulk');
};
document.getElementById('bulkBack').onclick = () => showView('list');
document.getElementById('bulkCancel').onclick = () => showView('list');
document.getElementById('bulkAddDate').onclick = addBulkDate;
document.getElementById('bSaveBtn').onclick = async () => {
const title = getTitle('bType', 'bTitleCustom');
if (!title) { toast('Selecciona un título', 'error'); return; }
const ts = document.getElementById('bTimeStart').value;
if (!ts) { toast('La hora es obligatoria', 'error'); return; }
const dates = [...document.getElementById('bulkDates').querySelectorAll('input[type=date]')]
.map(i => i.value).filter(Boolean);
if (!dates.length) { toast('Agrega al menos una fecha', 'error'); return; }
const te = document.getElementById('bTimeEnd').value;
const base = {
tag: document.getElementById('bTag').value || null,
location: document.getElementById('bLoc').value.trim() || null,
description: document.getElementById('bDesc').value.trim() || null,
organizer_name: document.getElementById('bOrgName').value.trim() || null,
organizer_email:document.getElementById('bOrgEmail').value.trim() || null,
image_url: document.getElementById('b-url').value || null,
};
const events = dates.map(d => ({
...base, title,
starts_at: new Date(`${d}T${ts}`).toISOString(),
ends_at: te ? new Date(`${d}T${te}`).toISOString() : null,
}));
const btn = document.getElementById('bSaveBtn');
btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Creando ${events.length}...`;
const { error } = await sb.from('events').insert(events);
btn.disabled = false; btn.innerHTML = '<i class="fas fa-layer-group"></i> Crear eventos';
if (error) { document.getElementById('bError').textContent = error.message; document.getElementById('bError').style.display = ''; return; }
toast(`${events.length} eventos creados`, 'success');
showView('list');
loadUpcoming();
};
// Initialize preset grid
buildPresetGrid();
// Session restore
(async () => {
try {
const { data, error } = await sb.auth.getSession();
if (error) { console.error('[admin] getSession error:', error); return; }
if (data?.session?.user) { await bootApp(data.session.user); }
} catch (e) { console.error('[admin] Session check threw:', e); }
})();
});