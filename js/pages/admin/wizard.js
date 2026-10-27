// js/pages/admin/wizard.js
// Step-by-step event creation wizard — designed for non-technical users.
//
// Flow:
//   Step 1 → Choose type: Evento Especial or Actividad Regular
//   Step 2 → (Special) Pick a preset card / (Regular) Pick a category
//   Step 3 → Date, time, optional details
//   Step 4 → Review & create
// A special event's preset (event_presets) pre-fills every step-3 field; a
// preset with a repeat rule can instead be scheduled over several months
// ("Repetir en varios meses" → the Programar dialog in event-presets.js).

import { sb, pad2, currentUser, currentProfile } from './state.js';
import { toast, closeModal } from './ui.js';
import { loadUpcoming } from './events-tab.js';
import { loadCalendario } from './calendar-tab.js';
import { DEFAULT_LOC_ADDR } from './event-form.js';
import { openDeploy } from './event-presets.js';
import { fetchEventPresets, createEventsOn, ruleLabel, formatTime12 } from '/js/lib/event-presets.js';
import { nextOccurrence, isRepeating } from '/js/utils/recurrence.js';
import { enhanceTextarea } from '/js/lib/rich-text.js';
import { richToPlain } from '/js/lib/sanitize-html.js';
import { isValidEmail } from '/js/lib/validators.js';
import { esc } from '/js/utils/escape.js';
import { loadingHtml } from '/js/components/states.js';
import { $ } from '/js/utils/dom.js';

const CAT_OPTIONS = [
  { id: 'servicio',       label: 'Servicio Dominical',  color: '#1e6b61', desc: 'Culto principal del domingo' },
  { id: 'estudio',        label: 'Estudio Bíblico',     color: '#2a4a9e', desc: 'Enseñanza y estudio de la Palabra' },
  { id: 'oracion',        label: 'Servicio de Oración', color: '#5c3d9c', desc: 'Reunión de oración y clamor' },
  { id: 'evangelizacion', label: 'Evangelización',       color: '#a05a10', desc: 'Alcance a la comunidad' },
  { id: 'otro',           label: 'Otro',                 color: '#888',    desc: 'Reunión o actividad general' },
];
const CUSTOM = 'custom';   // the "Personalizado" card

// ─── State ──────────────────────────────────────────────────────────────────
let step    = 1;
let evType  = null;  // 'special' | 'regular'
let preset  = null;  // an event_presets row, CUSTOM, or null (nothing picked)
let cat     = null;  // category id for regular events
let customTitle = '';
let presetList  = null;  // loaded when step 2 first shows (special)
let presetError = '';
let draft   = null;  // step-3 values, kept so "← Atrás" from step 4 doesn't lose them

// ─── Open / Close ───────────────────────────────────────────────────────────
export function openWizard() {
  step = 1; evType = null; preset = null; cat = null; customTitle = '';
  presetList = null; presetError = ''; draft = null;
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
    if (presetList === null) {
      container.innerHTML = loadingHtml('Cargando presets...');
      fetchEventPresets().then(({ data, error }) => {
        presetList = data || [];
        presetError = error || '';
        if (step === 2 && evType === 'special') renderStep2();
      });
      return;
    }
    container.innerHTML = `
      <div class="wiz-step-label">Elige un evento o crea uno personalizado</div>
      ${presetError ? `<div class="wiz-field"><div class="wiz-hint">${esc(presetError)}</div></div>` : ''}
      <div class="wiz-preset-grid" id="wizPresetGrid">
        ${presetList.map(p => `
          <div class="wiz-preset-card${preset?.id === p.id ? ' selected' : ''}" data-id="${esc(p.id)}">
            ${p.image_url ? `<img class="wiz-preset-card__img" src="${esc(p.image_url)}" alt="" loading="lazy">` : `<div class="wiz-preset-card__img" style="display:flex;align-items:center;justify-content:center;color:var(--color-muted)"><i class="fas fa-image" style="font-size:1.5rem;opacity:.3"></i></div>`}
            <div class="wiz-preset-card__name">${esc(p.title)}</div>
          </div>`).join('')}
        <div class="wiz-preset-card${preset === CUSTOM ? ' selected' : ''}" data-id="${CUSTOM}">
          <div class="wiz-preset-card__img" style="display:flex;align-items:center;justify-content:center;background:rgba(52,90,101,.06)">
            <i class="fas fa-plus" style="font-size:1.5rem;color:var(--color-dark);opacity:.5"></i>
          </div>
          <div class="wiz-preset-card__name">Personalizado</div>
        </div>
      </div>
      ${preset === CUSTOM ? `
        <div class="wiz-custom-name">
          <div class="wiz-field">
            <label>Nombre del evento *</label>
            <input type="text" id="wizCustomTitle" placeholder="ej. Retiro de jóvenes" value="${esc(customTitle)}">
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
        const id = card.dataset.id;
        preset = id === CUSTOM ? CUSTOM : (presetList.find(p => p.id === id) || null);
        if (preset !== CUSTOM) customTitle = '';
        draft = null;
        renderStep2();
      });
    });
    $('wizStep2Next')?.addEventListener('click', () => {
      if (preset === CUSTOM) {
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
            <input type="text" id="wizRegularTitle" placeholder="ej. Reunión de líderes" value="${esc(customTitle)}">
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
        draft = null;
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
// What step 3 opens with: the picked preset's values, else the fixed defaults.
function step3Defaults(p) {
  if (evType !== 'special') {
    return { date: '', start_time: cat === 'servicio' ? '14:00' : '19:00', location: DEFAULT_LOC_ADDR };
  }
  return {
    date:            p ? nextOccurrence(p) : '',
    start_time:      p?.start_time || '',
    end_time:        p?.end_time || '',
    description:     p?.description || '',
    location:        p?.location || DEFAULT_LOC_ADDR,
    organizer_name:  p?.organizer_name || '',
    organizer_email: p?.organizer_email || '',
  };
}

function readStep3() {
  const val = id => $(id)?.value?.trim() || '';
  return {
    date:            val('wizDate'),
    start_time:      val('wizTime'),
    end_time:        val('wizEnd'),
    description:     $('wizDesc')?.value || '',
    location:        val('wizLoc'),
    organizer_name:  val('wizOrgName'),
    organizer_email: val('wizOrgEmail'),
  };
}

function renderStep3() {
  const container = $('wizStep3');
  const isSpecial = evType === 'special';
  const title = getTitle();
  const p = presetRow();
  const v = draft || step3Defaults(p);
  const repeats = !!p && isRepeating(p);
  const locHint = v.location === DEFAULT_LOC_ADDR ? '<div class="wiz-hint">Ya tiene la dirección de la iglesia</div>' : '';

  container.innerHTML = `
    <div class="wiz-step-label">Creando: ${esc(title)}</div>
    ${isSpecial ? `
      <div class="wiz-field">
        <label><i class="fas fa-calendar-day" style="margin-right:4px;opacity:.5"></i> Fecha *</label>
        <input type="date" id="wizDate" required value="${esc(v.date)}">
        <div class="wiz-hint">${repeats ? `Se repite: ${esc(ruleLabel(p))}. Ya tiene la próxima fecha.` : 'Obligatorio'}</div>
      </div>
      ${repeats ? `
        <div class="wiz-field">
          <button type="button" class="btn btn--ghost" id="wizRepeatBtn">
            <i class="fas fa-calendar-plus"></i> Repetir en varios meses
          </button>
        </div>` : ''}
      <div class="wiz-row">
        <div class="wiz-field">
          <label><i class="far fa-clock" style="margin-right:4px;opacity:.5"></i> Hora inicio</label>
          <input type="time" id="wizTime" value="${esc(v.start_time)}">
        </div>
        <div class="wiz-field">
          <label>Hora fin</label>
          <input type="time" id="wizEnd" value="${esc(v.end_time)}">
        </div>
      </div>
      <div class="wiz-field">
        <label><i class="fas fa-align-left" style="margin-right:4px;opacity:.5"></i> Descripción</label>
        <textarea id="wizDesc" rows="2" placeholder="Opcional...">${esc(v.description)}</textarea>
      </div>
      <div class="wiz-field">
        <label><i class="fas fa-map-marker-alt" style="margin-right:4px;opacity:.5"></i> Ubicación</label>
        <input type="text" id="wizLoc" value="${esc(v.location)}">
        ${locHint}
      </div>
      <div class="wiz-row">
        <div class="wiz-field">
          <label><i class="fas fa-user" style="margin-right:4px;opacity:.5"></i> Organizador</label>
          <input type="text" id="wizOrgName" value="${esc(v.organizer_name)}" placeholder="Opcional">
        </div>
        <div class="wiz-field">
          <label>Email organizador</label>
          <input type="email" id="wizOrgEmail" value="${esc(v.organizer_email)}" placeholder="Opcional">
        </div>
      </div>` : `
      <div class="wiz-row">
        <div class="wiz-field">
          <label><i class="fas fa-calendar-day" style="margin-right:4px;opacity:.5"></i> Fecha *</label>
          <input type="date" id="wizDate" required value="${esc(v.date)}">
          <div class="wiz-hint">Obligatorio</div>
        </div>
        <div class="wiz-field">
          <label><i class="far fa-clock" style="margin-right:4px;opacity:.5"></i> Hora</label>
          <input type="time" id="wizTime" value="${esc(v.start_time)}">
        </div>
      </div>
      <div class="wiz-field">
        <label><i class="fas fa-map-marker-alt" style="margin-right:4px;opacity:.5"></i> Ubicación</label>
        <input type="text" id="wizLoc" value="${esc(v.location)}">
        ${locHint}
      </div>`}
    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__wizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="wizStep3Next">Revisar →</button>
    </div>`;

  if ($('wizDesc')) enhanceTextarea($('wizDesc'));

  // Set min date to today
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;
  const dateInput = $('wizDate');
  if (dateInput) dateInput.min = todayStr;

  // Same values, many months: hand over to the Programar dialog.
  $('wizRepeatBtn')?.addEventListener('click', () => {
    const values = { ...p, ...readStep3(), title };
    closeWizard();
    openDeploy(values);
  });

  $('wizStep3Next')?.addEventListener('click', () => {
    const next = readStep3();
    if (!next.date) { toast('La fecha es obligatoria', 'error'); $('wizDate').focus(); return; }
    if (next.organizer_email && !isValidEmail(next.organizer_email)) {
      toast('El email del organizador no es válido', 'error'); $('wizOrgEmail')?.focus(); return;
    }
    draft = next;
    step = 4; renderStep();
  });
}

// ─── Step 4: Review & create ────────────────────────────────────────────────
function renderStep4() {
  const container = $('wizStep4');
  const isSpecial = evType === 'special';
  const title     = getTitle();
  const v         = draft;
  const imgUrl    = isSpecial ? presetRow()?.image_url : null;
  const descText  = richToPlain(v.description);
  const org       = [v.organizer_name, v.organizer_email].filter(Boolean).join(' · ');

  // Format date for display
  let dateDisplay = '';
  if (v.date) {
    const [y, m, d] = v.date.split('-').map(Number);
    dateDisplay = new Date(y, m-1, d).toLocaleDateString('es', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }

  const timeDisplay = [formatTime12(v.start_time), formatTime12(v.end_time)].filter(Boolean).join(' – ');

  container.innerHTML = `
    <div class="wiz-step-label">Todo listo — revisa los datos</div>
    <div class="wiz-review">
      ${imgUrl ? `<img class="wiz-review__img" src="${esc(imgUrl)}" alt="">` : ''}
      <div class="wiz-review__body">
        <div class="wiz-review__title">${esc(title)}</div>
        <div class="wiz-review__row"><i class="fas fa-calendar-day"></i> ${esc(dateDisplay)}</div>
        ${timeDisplay ? `<div class="wiz-review__row"><i class="far fa-clock"></i> ${esc(timeDisplay)}</div>` : ''}
        ${v.location ? `<div class="wiz-review__row"><i class="fas fa-map-marker-alt"></i> ${esc(v.location)}</div>` : ''}
        ${org ? `<div class="wiz-review__row"><i class="fas fa-user"></i> ${esc(org)}</div>` : ''}
        ${descText ? `<div class="wiz-review__row" style="margin-top:.3rem;opacity:.7"><i class="fas fa-align-left"></i> ${esc(descText.slice(0, 80))}${descText.length > 80 ? '...' : ''}</div>` : ''}
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
  const v         = draft;

  try {
    if (isSpecial) {
      // Insert into events table — the preset's categories and image ride along.
      const p = presetRow();
      const res = await createEventsOn({
        ...v,
        title,
        tag:        p?.tag || null,
        image_url:  p?.image_url || null,
        start_time: v.start_time || '09:00',
      }, [v.date]);
      if (res.error) throw new Error(res.error);
    } else {
      // Insert into calendar_events table
      const payload = {
        title,
        date:        v.date,
        time:        formatTime12(v.start_time) || null,
        location:    v.location || null,
        description: null,
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
function presetRow() {
  return evType === 'special' && preset && preset !== CUSTOM ? preset : null;
}

function getTitle() {
  if (evType === 'special') {
    return preset === CUSTOM ? customTitle : (preset?.title || '');
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
    evType = 'special'; preset = null; draft = null; step = 2; renderStep();
  });
  document.querySelector('.type-regular')?.addEventListener('click', () => {
    evType = 'regular'; cat = null; draft = null; step = 2; renderStep();
  });

  // Global back handler
  window.__wizBack = () => {
    if (step > 1) { step--; renderStep(); }
  };
}
