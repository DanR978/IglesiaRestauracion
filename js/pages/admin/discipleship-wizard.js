import { escapeHtml, escapeAttr } from '/js/utils/escape.js';
// js/pages/admin/discipleship-wizard.js
// ─────────────────────────────────────────────────────────────────────────────
// Step-by-step wizard for creating a discipleship group.
// Mirrors the event wizard's pattern (4 steps + progress dots + Back/Next).
//
//   Step 1 → Pick level (Nivel 1–5)
//   Step 2 → Basics: name, leader, capacity, status
//   Step 3 → Schedule: day, time, start, end (all optional — pastor may not know yet)
//   Step 4 → Optional details (description, location) + review + create
//
// Required: name, level, status, capacity, leader_name.
// Optional: meeting_day, meeting_time, starts_on, ends_on, description,
//           location_name, location_address, is_published.
// ─────────────────────────────────────────────────────────────────────────────

import { upsertGroup, LEVELS } from '/js/lib/discipleship.js';
import { toast } from './ui.js';

/* ── Level cards (visual picker for step 1) ─────────────────────────── */
const LEVEL_CARDS = [
  { id: 1, label: 'Nivel 1', sub: 'Fundamentos',     color: '#394548' },
  { id: 2, label: 'Nivel 2', sub: 'Crecimiento',     color: '#1e6b61' },
  { id: 3, label: 'Nivel 3', sub: 'Discípulo',       color: '#2a4a9e' },
  { id: 4, label: 'Nivel 4', sub: 'Servidor',        color: '#5c3d9c' },
  { id: 5, label: 'Nivel 5', sub: 'Multiplicador',   color: '#a05a10' },
];

const STATUS_OPTIONS = [
  { id: 'open',      label: 'Abierto',     desc: 'Acepta inscripciones nuevas' },
  { id: 'active',    label: 'En curso',    desc: 'Ya empezó, cerrado' },
  { id: 'completed', label: 'Finalizado',  desc: 'Terminó el ciclo' },
  { id: 'cancelled', label: 'Cancelado',   desc: 'No se llevará a cabo' },
];

const DAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

/* ── State ──────────────────────────────────────────────────────────── */
let step = 1;
let data = blankData();
let onCreated = null;  // callback when a group is saved

function blankData() {
  return {
    level: null,
    name: '',
    leader: '',
    capacity: '',
    status: 'open',
    day: '',
    time: '',
    start: '',
    end: '',
    description: '',
    locName: '',
    locAddr: '',
    published: true,
  };
}

/* ── DOM helpers ────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Public API ─────────────────────────────────────────────────────── */
export function openDscpWizard(opts = {}) {
  step = 1;
  data = blankData();
  onCreated = opts.onCreated || null;
  renderStep();
  $('dwizBackdrop')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeDscpWizard() {
  $('dwizBackdrop')?.classList.remove('open');
  document.body.style.overflow = '';
}

export function initDscpWizard() {
  $('dwizClose')?.addEventListener('click', closeDscpWizard);
  $('dwizBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDscpWizard();
  });
  window.__dwizBack = () => { if (step > 1) { step--; renderStep(); } };
}

/* ── Renderer ───────────────────────────────────────────────────────── */
function renderStep() {
  // Progress dots
  document.querySelectorAll('#dwizBackdrop .wizard__progress-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === step);
    dot.classList.toggle('done',   i + 1 < step);
  });

  // Show only the active step
  document.querySelectorAll('#dwizBackdrop .wiz-step').forEach(s => s.classList.remove('active'));
  $(`dwizStep${step}`)?.classList.add('active');

  const titles = {
    1: 'Elige el nivel',
    2: 'Datos del grupo',
    3: 'Cuándo se reúne',
    4: 'Detalles finales',
  };
  $('dwizTitle').textContent = titles[step] || 'Crear grupo de discipulado';

  if (step === 1) renderStep1();
  if (step === 2) renderStep2();
  if (step === 3) renderStep3();
  if (step === 4) renderStep4();
}

/* ── Step 1: Level picker ───────────────────────────────────────────── */
function renderStep1() {
  const c = $('dwizStep1');
  c.innerHTML = `
    <div class="wiz-step-label">¿Qué nivel es este grupo?</div>
    <div class="wiz-cat-grid dwiz-level-grid">
      ${LEVEL_CARDS.map(l => `
        <div class="wiz-cat-card dwiz-level-card${data.level === l.id ? ' selected' : ''}" data-level="${l.id}">
          <div class="wiz-cat-card__dot" style="background:${l.color}"></div>
          <div class="wiz-cat-card__title">${l.label}</div>
          <div class="wiz-cat-card__desc">${l.sub}</div>
        </div>
      `).join('')}
    </div>
    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__dwizClose()">Cancelar</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="dwizStep1Next" ${data.level === null ? 'disabled' : ''}>Siguiente →</button>
    </div>
  `;

  window.__dwizClose = closeDscpWizard;

  c.querySelectorAll('.dwiz-level-card').forEach(card => {
    card.addEventListener('click', () => {
      data.level = Number(card.dataset.level);
      renderStep1();
    });
  });
  $('dwizStep1Next')?.addEventListener('click', () => {
    if (!data.level) { toast('Escoge un nivel primero', 'error'); return; }
    step = 2; renderStep();
  });
}

/* ── Step 2: Basics ─────────────────────────────────────────────────── */
function renderStep2() {
  const c = $('dwizStep2');
  c.innerHTML = `
    <div class="wiz-step-label">Datos básicos del grupo</div>

    <div class="wiz-field">
      <label><i class="fas fa-tag" style="margin-right:4px;opacity:.5"></i> Nombre del grupo *</label>
      <input type="text" id="dwizName" placeholder="ej. Discipulado Nivel ${data.level || ''} — Familias Lopez" value="${escapeAttr(data.name)}">
      <div class="wiz-hint">Nombre que verán los miembros</div>
    </div>

    <div class="wiz-field">
      <label><i class="fas fa-user" style="margin-right:4px;opacity:.5"></i> Líder del grupo *</label>
      <input type="text" id="dwizLeader" placeholder="ej. Hermano Juan Martínez" value="${escapeAttr(data.leader)}">
    </div>

    <div class="wiz-row">
      <div class="wiz-field">
        <label><i class="fas fa-users" style="margin-right:4px;opacity:.5"></i> Cupo *</label>
        <input type="number" id="dwizCapacity" min="1" max="50" placeholder="ej. 12" value="${escapeAttr(data.capacity)}">
        <div class="wiz-hint">Máximo de personas</div>
      </div>
      <div class="wiz-field">
        <label><i class="fas fa-flag" style="margin-right:4px;opacity:.5"></i> Estado *</label>
        <select id="dwizStatus">
          ${STATUS_OPTIONS.map(s => `<option value="${s.id}"${data.status === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__dwizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="dwizStep2Next">Siguiente →</button>
    </div>
  `;

  $('dwizStep2Next')?.addEventListener('click', () => {
    const name = $('dwizName').value.trim();
    const leader = $('dwizLeader').value.trim();
    const capacity = Number($('dwizCapacity').value);
    const status = $('dwizStatus').value;

    if (!name)    { toast('El nombre es obligatorio', 'error'); $('dwizName').focus(); return; }
    if (!leader)  { toast('El nombre del líder es obligatorio', 'error'); $('dwizLeader').focus(); return; }
    if (!capacity || capacity < 1) { toast('Define el cupo (cuántas personas caben)', 'error'); $('dwizCapacity').focus(); return; }

    data.name = name;
    data.leader = leader;
    data.capacity = capacity;
    data.status = status;
    step = 3; renderStep();
  });
}

/* ── Step 3: Schedule ───────────────────────────────────────────────── */
function renderStep3() {
  const c = $('dwizStep3');
  c.innerHTML = `
    <div class="wiz-step-label">¿Cuándo se reúne el grupo?</div>
    <div class="wiz-hint" style="margin:-.4rem 0 1rem">Todo esto es opcional — déjalo en blanco si aún no lo sabes.</div>

    <div class="wiz-row">
      <div class="wiz-field">
        <label><i class="fas fa-calendar-week" style="margin-right:4px;opacity:.5"></i> Día de reunión</label>
        <select id="dwizDay">
          <option value="">— Escoge un día —</option>
          ${DAYS.map(d => `<option value="${d}"${data.day === d ? ' selected' : ''}>${cap(d)}</option>`).join('')}
        </select>
      </div>
      <div class="wiz-field">
        <label><i class="far fa-clock" style="margin-right:4px;opacity:.5"></i> Hora</label>
        <input type="time" id="dwizTime" value="${escapeAttr(data.time)}">
      </div>
    </div>

    <div class="wiz-row">
      <div class="wiz-field">
        <label><i class="fas fa-play" style="margin-right:4px;opacity:.5"></i> Inicio</label>
        <input type="date" id="dwizStart" value="${escapeAttr(data.start)}">
        <div class="wiz-hint">Primera reunión</div>
      </div>
      <div class="wiz-field">
        <label><i class="fas fa-flag-checkered" style="margin-right:4px;opacity:.5"></i> Fin</label>
        <input type="date" id="dwizEnd" value="${escapeAttr(data.end)}">
        <div class="wiz-hint">Última reunión</div>
      </div>
    </div>

    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__dwizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="dwizStep3Next">Siguiente →</button>
    </div>
  `;

  $('dwizStep3Next')?.addEventListener('click', () => {
    const day = $('dwizDay').value;
    const time = $('dwizTime').value;
    const start = $('dwizStart').value;
    const end = $('dwizEnd').value;

    // Schedule is optional (the pastor may not know it yet). The only rule:
    // if both dates are given, the end can't precede the start.
    if (start && end && end < start) {
      toast('La fecha de fin no puede ser antes del inicio', 'error'); $('dwizEnd').focus(); return;
    }

    data.day = day; data.time = time; data.start = start; data.end = end;
    step = 4; renderStep();
  });
}

/* ── Step 4: Optional details + review + create ─────────────────────── */
function renderStep4() {
  const c = $('dwizStep4');
  const levelLabel = LEVEL_CARDS.find(l => l.id === data.level)?.label || `Nivel ${data.level}`;
  const statusLabel = STATUS_OPTIONS.find(s => s.id === data.status)?.label || data.status;

  c.innerHTML = `
    <div class="wiz-step-label">Detalles opcionales — puedes dejarlos en blanco</div>

    <div class="wiz-field">
      <label><i class="fas fa-align-left" style="margin-right:4px;opacity:.5"></i> Descripción</label>
      <textarea id="dwizDesc" rows="2" placeholder="Énfasis del grupo, materiales, etc. (opcional)">${escapeText(data.description)}</textarea>
    </div>

    <div class="wiz-row">
      <div class="wiz-field">
        <label><i class="fas fa-house" style="margin-right:4px;opacity:.5"></i> Casa / lugar</label>
        <input type="text" id="dwizLocName" placeholder="ej. Casa de los Rodríguez" value="${escapeAttr(data.locName)}">
      </div>
      <div class="wiz-field">
        <label><i class="fas fa-map-marker-alt" style="margin-right:4px;opacity:.5"></i> Dirección</label>
        <input type="text" id="dwizLocAddr" placeholder="ej. 1234 Maple St" value="${escapeAttr(data.locAddr)}">
      </div>
    </div>

    <div class="wiz-field">
      <label style="display:flex;align-items:center;gap:.5rem;text-transform:none;font-size:.88rem;font-weight:500;letter-spacing:0;cursor:pointer">
        <input type="checkbox" id="dwizPublished" ${data.published ? 'checked' : ''} style="width:auto;accent-color:var(--color-dark)">
        Visible en la página pública de Discipulado
      </label>
    </div>

    <!-- ─── Review summary ─── -->
    <div class="dwiz-review">
      <div class="dwiz-review__title">Resumen del grupo</div>
      <div class="dwiz-review__row"><i class="fas fa-layer-group"></i> ${levelLabel}</div>
      <div class="dwiz-review__row"><i class="fas fa-tag"></i> ${escapeHtml(data.name)}</div>
      <div class="dwiz-review__row"><i class="fas fa-user"></i> Líder: ${escapeHtml(data.leader)}</div>
      <div class="dwiz-review__row"><i class="fas fa-users"></i> Cupo: ${data.capacity}</div>
      <div class="dwiz-review__row"><i class="fas fa-flag"></i> ${statusLabel}</div>
      <div class="dwiz-review__row"><i class="fas fa-calendar-week"></i> ${reviewSchedule(data.day, data.time)}</div>
      <div class="dwiz-review__row"><i class="fas fa-play"></i> ${reviewDates(data.start, data.end)}</div>
    </div>

    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__dwizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="dwizCreateBtn" style="min-width:160px">
        <i class="fas fa-check"></i> Crear grupo
      </button>
    </div>
  `;

  // Live-update optional fields into state so review reflects them on re-render (not strictly needed for save)
  $('dwizDesc')?.addEventListener('input',  e => data.description = e.target.value);
  $('dwizLocName')?.addEventListener('input', e => data.locName = e.target.value);
  $('dwizLocAddr')?.addEventListener('input', e => data.locAddr = e.target.value);
  $('dwizPublished')?.addEventListener('change', e => data.published = e.target.checked);

  $('dwizCreateBtn')?.addEventListener('click', createGroup);
}

/* ── Create the group ───────────────────────────────────────────────── */
async function createGroup() {
  const btn = $('dwizCreateBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

  const payload = {
    name:             data.name,
    level:            data.level,
    description:      data.description?.trim() || null,
    status:           data.status,
    capacity:         Number(data.capacity) || null,
    // Schedule is optional — send null (not '') so the DB CHECK / date / time
    // columns accept "not decided yet".
    meeting_day:      data.day   || null,
    meeting_time:     data.time  || null,
    starts_on:        data.start || null,
    ends_on:          data.end   || null,
    location_name:    data.locName?.trim() || null,
    location_address: data.locAddr?.trim() || null,
    leader_name:      data.leader,
    is_published:     !!data.published,
  };

  try {
    const { error } = await upsertGroup(payload);
    if (error) throw new Error(error);
    toast('Grupo creado', 'success');
    closeDscpWizard();
    if (typeof onCreated === 'function') onCreated();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Crear grupo';
  }
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }


function escapeText(s) { return escapeHtml(s); }
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${(h % 12) || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function formatDate(d) {
  if (!d) return '';
  const [y, mo, da] = d.split('-').map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}
function reviewSchedule(day, time) {
  if (day && time) return `${cap(day)} a las ${formatTime(time)}`;
  if (day)         return cap(day);
  if (time)        return `A las ${formatTime(time)}`;
  return 'Horario por definir';
}
function reviewDates(start, end) {
  if (start && end) return `Del ${formatDate(start)} al ${formatDate(end)}`;
  if (start)        return `Desde ${formatDate(start)}`;
  if (end)          return `Hasta ${formatDate(end)}`;
  return 'Fechas por definir';
}
