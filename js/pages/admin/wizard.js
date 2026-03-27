// js/pages/admin/wizard.js
// Step-by-step event creation wizard — designed for non-technical users.
//
// Flow:
//   Step 1 → Choose type: Evento Especial or Actividad Regular
//   Step 2 → (Special) Pick a preset card / (Regular) Pick a category
//   Step 3 → Date, time, optional details
//   Step 4 → Review & create

import { sb, pad2, currentUser, currentProfile } from './state.js';
import { toast, closeModal } from './ui.js';
import { loadUpcoming } from './events-tab.js';
import { loadCalendario } from './calendar-tab.js';
import { EVENT_PRESETS, DEFAULT_LOC_ADDR } from './event-form.js';

const IMG_BASE = import.meta.env?.VITE_STORAGE_EVENT_IMAGES
  ? import.meta.env.VITE_STORAGE_EVENT_IMAGES + '/'
  : 'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/event-images/';

const CAT_OPTIONS = [
  { id: 'servicio',       label: 'Servicio Dominical',  color: '#1e6b61', desc: 'Culto principal del domingo' },
  { id: 'estudio',        label: 'Estudio Bíblico',     color: '#2a4a9e', desc: 'Enseñanza y estudio de la Palabra' },
  { id: 'oracion',        label: 'Servicio de Oración', color: '#5c3d9c', desc: 'Reunión de oración y clamor' },
  { id: 'evangelizacion', label: 'Evangelización',       color: '#a05a10', desc: 'Alcance a la comunidad' },
  { id: 'otro',           label: 'Otro',                 color: '#888',    desc: 'Reunión o actividad general' },
];

// ─── State ──────────────────────────────────────────────────────────────────
let step    = 1;
let evType  = null;  // 'special' | 'regular'
let preset  = null;  // index into EVENT_PRESETS or null for custom
let cat     = null;  // category id for regular events
let customTitle = '';

// ─── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Open / Close ───────────────────────────────────────────────────────────
export function openWizard() {
  step = 1; evType = null; preset = null; cat = null; customTitle = '';
  renderStep();
  $('wizardBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeWizard() {
  $('wizardBackdrop').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Render current step ────────────────────────────────────────────────────
function renderStep() {
  // Update progress dots
  document.querySelectorAll('.wizard__progress-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === step);
    dot.classList.toggle('done',   i + 1 < step);
  });

  // Hide all steps, show current
  document.querySelectorAll('.wiz-step').forEach(s => s.classList.remove('active'));
  $(`wizStep${step}`)?.classList.add('active');

  // Update header title
  const titles = {
    1: 'Crear Evento',
    2: evType === 'special' ? 'Elige el evento' : 'Tipo de actividad',
    3: 'Fecha y detalles',
    4: 'Confirmar y crear',
  };
  $('wizardTitle').textContent = titles[step] || 'Crear Evento';

  if (step === 2) renderStep2();
  if (step === 3) renderStep3();
  if (step === 4) renderStep4();
}

// ─── Step 2: Preset picker / Category picker ────────────────────────────────
function renderStep2() {
  const container = $('wizStep2');
  if (evType === 'special') {
    container.innerHTML = `
      <div class="wiz-step-label">Elige un evento o crea uno personalizado</div>
      <div class="wiz-preset-grid" id="wizPresetGrid">
        ${EVENT_PRESETS.map((p, i) => `
          <div class="wiz-preset-card${preset === i ? ' selected' : ''}" data-idx="${i}">
            ${p.img ? `<img class="wiz-preset-card__img" src="${IMG_BASE}${p.img}" alt="${p.title}" loading="lazy">` : `<div class="wiz-preset-card__img" style="display:flex;align-items:center;justify-content:center;color:var(--color-muted)"><i class="fas fa-image" style="font-size:1.5rem;opacity:.3"></i></div>`}
            <div class="wiz-preset-card__name">${p.title}</div>
          </div>`).join('')}
        <div class="wiz-preset-card${preset === -1 ? ' selected' : ''}" data-idx="-1">
          <div class="wiz-preset-card__img" style="display:flex;align-items:center;justify-content:center;background:rgba(52,90,101,.06)">
            <i class="fas fa-plus" style="font-size:1.5rem;color:var(--color-primary);opacity:.5"></i>
          </div>
          <div class="wiz-preset-card__name">Personalizado</div>
        </div>
      </div>
      ${preset === -1 ? `
        <div class="wiz-custom-name">
          <div class="wiz-field">
            <label>Nombre del evento *</label>
            <input type="text" id="wizCustomTitle" placeholder="ej. Retiro de jóvenes" value="${customTitle}">
          </div>
        </div>` : ''}
      <div class="wiz-nav">
        <button class="btn btn--ghost" onclick="window.__wizBack()">← Atrás</button>
        <div class="wiz-nav__spacer"></div>
        <button class="btn btn--primary" id="wizStep2Next" ${preset === null ? 'disabled' : ''}>Siguiente →</button>
      </div>`;

    // Wire preset clicks
    container.querySelectorAll('.wiz-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.idx);
        preset = idx;
        if (idx >= 0) customTitle = '';
        renderStep2();
      });
    });
    $('wizStep2Next')?.addEventListener('click', () => {
      if (preset === -1) {
        const input = $('wizCustomTitle');
        customTitle = input?.value?.trim() || '';
        if (!customTitle) { input?.focus(); toast('Escribe el nombre del evento', 'error'); return; }
      }
      step = 3; renderStep();
    });
    $('wizCustomTitle')?.addEventListener('input', e => { customTitle = e.target.value; });
  } else {
    // Regular: category picker
    container.innerHTML = `
      <div class="wiz-step-label">¿Qué tipo de actividad es?</div>
      <div class="wiz-cat-grid">
        ${CAT_OPTIONS.map(c => `
          <div class="wiz-cat-card${cat === c.id ? ' selected' : ''}" data-cat="${c.id}">
            <div class="wiz-cat-card__dot" style="background:${c.color}"></div>
            <div class="wiz-cat-card__title">${c.label}</div>
            <div class="wiz-cat-card__desc">${c.desc}</div>
          </div>`).join('')}
      </div>
      ${cat === 'otro' ? `
        <div class="wiz-custom-name">
          <div class="wiz-field">
            <label>Nombre de la actividad *</label>
            <input type="text" id="wizRegularTitle" placeholder="ej. Reunión de líderes" value="${customTitle}">
          </div>
        </div>` : ''}
      <div class="wiz-nav">
        <button class="btn btn--ghost" onclick="window.__wizBack()">← Atrás</button>
        <div class="wiz-nav__spacer"></div>
        <button class="btn btn--primary" id="wizStep2Next" ${cat === null ? 'disabled' : ''}>Siguiente →</button>
      </div>`;

    container.querySelectorAll('.wiz-cat-card').forEach(card => {
      card.addEventListener('click', () => {
        cat = card.dataset.cat;
        // Pre-fill title for non-otro categories
        if (cat !== 'otro') {
          customTitle = CAT_OPTIONS.find(c => c.id === cat)?.label || '';
        }
        renderStep2();
      });
    });
    $('wizStep2Next')?.addEventListener('click', () => {
      if (cat === 'otro') {
        const input = $('wizRegularTitle');
        customTitle = input?.value?.trim() || '';
        if (!customTitle) { input?.focus(); toast('Escribe el nombre de la actividad', 'error'); return; }
      }
      step = 3; renderStep();
    });
    $('wizRegularTitle')?.addEventListener('input', e => { customTitle = e.target.value; });
  }
}

// ─── Step 3: Date / time / optional details ─────────────────────────────────
function renderStep3() {
  const container = $('wizStep3');
  const isSpecial = evType === 'special';
  const title = getTitle();

  // Smart default time
  const defTime = isSpecial ? '' : (cat === 'servicio' ? '14:00' : '19:00');
  const defLoc  = DEFAULT_LOC_ADDR;

  container.innerHTML = `
    <div class="wiz-step-label">Creando: ${title}</div>
    <div class="wiz-row">
      <div class="wiz-field">
        <label><i class="fas fa-calendar-day" style="margin-right:4px;opacity:.5"></i> Fecha *</label>
        <input type="date" id="wizDate" required>
        <div class="wiz-hint">Obligatorio</div>
      </div>
      <div class="wiz-field">
        <label><i class="far fa-clock" style="margin-right:4px;opacity:.5"></i> Hora</label>
        <input type="time" id="wizTime" value="${defTime}">
      </div>
    </div>
    ${isSpecial ? `
      <div class="wiz-field">
        <label><i class="fas fa-align-left" style="margin-right:4px;opacity:.5"></i> Descripción</label>
        <textarea id="wizDesc" rows="2" placeholder="Opcional...">${preset >= 0 ? (EVENT_PRESETS[preset]?.desc || '') : ''}</textarea>
      </div>` : ''}
    <div class="wiz-field">
      <label><i class="fas fa-map-marker-alt" style="margin-right:4px;opacity:.5"></i> Ubicación</label>
      <input type="text" id="wizLoc" value="${defLoc}">
      <div class="wiz-hint">Ya tiene la dirección de la iglesia</div>
    </div>
    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__wizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="wizStep3Next">Revisar →</button>
    </div>`;

  // Set min date to today
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;
  const dateInput = $('wizDate');
  if (dateInput) dateInput.min = todayStr;

  $('wizStep3Next')?.addEventListener('click', () => {
    if (!$('wizDate').value) { toast('La fecha es obligatoria', 'error'); $('wizDate').focus(); return; }
    step = 4; renderStep();
  });
}

// ─── Step 4: Review & create ────────────────────────────────────────────────
function renderStep4() {
  const container = $('wizStep4');
  const isSpecial = evType === 'special';
  const title     = getTitle();
  const dateVal   = $('wizDate')?.value || '';
  const timeVal   = $('wizTime')?.value || '';
  const locVal    = $('wizLoc')?.value || '';
  const descVal   = $('wizDesc')?.value || '';
  const imgUrl    = (isSpecial && preset >= 0 && EVENT_PRESETS[preset]?.img)
    ? IMG_BASE + EVENT_PRESETS[preset].img : null;

  // Format date for display
  let dateDisplay = '';
  if (dateVal) {
    const [y, m, d] = dateVal.split('-').map(Number);
    dateDisplay = new Date(y, m-1, d).toLocaleDateString('es', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }

  // Format time
  let timeDisplay = '';
  if (timeVal) {
    const [h, m] = timeVal.split(':').map(Number);
    timeDisplay = `${(h%12)||12}:${pad2(m)} ${h>=12?'PM':'AM'}`;
  }

  container.innerHTML = `
    <div class="wiz-step-label">Todo listo — revisa los datos</div>
    <div class="wiz-review">
      ${imgUrl ? `<img class="wiz-review__img" src="${imgUrl}" alt="">` : ''}
      <div class="wiz-review__body">
        <div class="wiz-review__title">${title}</div>
        <div class="wiz-review__row"><i class="fas fa-calendar-day"></i> ${dateDisplay}</div>
        ${timeDisplay ? `<div class="wiz-review__row"><i class="far fa-clock"></i> ${timeDisplay}</div>` : ''}
        ${locVal ? `<div class="wiz-review__row"><i class="fas fa-map-marker-alt"></i> ${locVal}</div>` : ''}
        ${descVal ? `<div class="wiz-review__row" style="margin-top:.3rem;opacity:.7"><i class="fas fa-align-left"></i> ${descVal.slice(0, 80)}${descVal.length > 80 ? '...' : ''}</div>` : ''}
        <div class="wiz-review__row" style="margin-top:.3rem">
          <i class="fas fa-tag"></i>
          <span style="background:${isSpecial ? '#b02030' : (CAT_OPTIONS.find(c=>c.id===cat)?.color || '#888')};color:#fff;padding:2px 8px;border-radius:4px;font-size:.72rem;font-weight:600">
            ${isSpecial ? 'Evento Especial' : (CAT_OPTIONS.find(c=>c.id===cat)?.label || 'Otro')}
          </span>
        </div>
      </div>
    </div>
    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__wizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="wizCreateBtn" style="min-width:140px">
        <i class="fas fa-check"></i> Crear Evento
      </button>
    </div>`;

  $('wizCreateBtn')?.addEventListener('click', createEvent);
}

// ─── Create the event ───────────────────────────────────────────────────────
async function createEvent() {
  const btn = $('wizCreateBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

  const isSpecial = evType === 'special';
  const title     = getTitle();
  const dateVal   = $('wizDate')?.value || '';
  const timeVal   = $('wizTime')?.value || '';
  const locVal    = $('wizLoc')?.value?.trim() || null;
  const descVal   = $('wizDesc')?.value?.trim() || null;

  try {
    if (isSpecial) {
      // Insert into events table
      const startsAt = timeVal
        ? new Date(`${dateVal}T${timeVal}`).toISOString()
        : new Date(`${dateVal}T09:00`).toISOString();
      const presetData = preset >= 0 ? EVENT_PRESETS[preset] : null;
      const imgUrl = presetData?.img ? IMG_BASE + presetData.img : null;
      const tags   = presetData?.tags?.join(' / ') || null;

      const payload = {
        title,
        starts_at:   startsAt,
        location:    locVal,
        description: descVal || presetData?.desc || null,
        image_url:   imgUrl,
        tag:         tags,
      };

      const { error } = await sb.from('events').insert(payload);
      if (error) throw error;
    } else {
      // Insert into calendar_events table
      let fmtTime = null;
      if (timeVal) {
        const [h, m] = timeVal.split(':').map(Number);
        fmtTime = `${(h%12)||12}:${pad2(m)} ${h>=12?'PM':'AM'}`;
      }

      const payload = {
        title,
        date:        dateVal,
        time:        fmtTime,
        location:    locVal,
        description: descVal,
        category:    cat || 'otro',
        cancelled:   false,
        ministry_id: currentProfile?.ministry_id || null,
        created_by:  currentUser?.id,
      };

      const { error } = await sb.from('calendar_events').insert(payload);
      if (error) throw error;
    }

    toast('Evento creado', 'success');
    closeWizard();
    loadUpcoming();
    loadCalendario();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Crear Evento';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getTitle() {
  if (evType === 'special') {
    return preset >= 0 ? EVENT_PRESETS[preset].title : customTitle;
  }
  return cat !== 'otro' ? (CAT_OPTIONS.find(c => c.id === cat)?.label || customTitle) : customTitle;
}

// ─── Init ───────────────────────────────────────────────────────────────────
export function initWizard() {
  // Wire the "Agregar" button
  $('calAddBtn')?.addEventListener('click', openWizard);

  // Close button + backdrop click
  $('wizardClose')?.addEventListener('click', closeWizard);
  $('wizardBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeWizard();
  });

  // Step 1: type selection
  document.querySelector('.type-special')?.addEventListener('click', () => {
    evType = 'special'; preset = null; step = 2; renderStep();
  });
  document.querySelector('.type-regular')?.addEventListener('click', () => {
    evType = 'regular'; cat = null; step = 2; renderStep();
  });

  // Global back handler
  window.__wizBack = () => {
    if (step > 1) { step--; renderStep(); }
  };
}