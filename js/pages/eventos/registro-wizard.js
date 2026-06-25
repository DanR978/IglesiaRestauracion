// js/pages/eventos/registro-wizard.js
// ─────────────────────────────────────────────────────────────────────────────
// Public, step-by-step registration wizard for a special event. Same UX as the
// admin event-creation flow and the discipleship signup wizard — a friendly
// multi-step popup instead of one long form.
//
//   Step 1 → Asistente               (nombre, apellido, edad, sexo)
//   Step 2 → Contacto de emergencia  (contacto, parentesco, teléfono, email)
//   Step 3 → Salud                   (alergias, condiciones, notas — opcional)
//   Step 4 → Confirmar               (revisar + enviar)
//   → Success screen
//
// Reuses the public wizard styling (.sw-* in css/pages/discipulado-wizard.css)
// and posts via anon INSERT into `event_registrations` (RLS-gated on the event
// having registration open).
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';
import { escapeHtml } from '/js/utils/escape.js';
import { isValidEmail, isValidUSPhone } from '/js/lib/validators.js';

const TOTAL_STEPS = 4;

const SEX_OPTS = [
  { v: '',                  label: '— Prefiero no decir —' },
  { v: 'Femenino',          label: 'Femenino' },
  { v: 'Masculino',         label: 'Masculino' },
  { v: 'Prefiere no decir', label: 'Prefiere no decir' },
];

const STEP_TITLES = {
  1: 'Asistente',
  2: 'Contacto de emergencia',
  3: 'Información de salud',
  4: 'Confirmar y enviar',
};

// ─── State ──────────────────────────────────────────────────────────────────
let step = 1;
let eventCtx = null;        // { id, title }
let onSuccess = null;

const state = {
  first_name: '', last_name: '', age: '', sex: '',
  contact_name: '', relationship: '', contact_phone: '', contact_email: '',
  allergies: '', medical_conditions: '', notes: '',
};

function resetState() {
  Object.assign(state, {
    first_name: '', last_name: '', age: '', sex: '',
    contact_name: '', relationship: '', contact_phone: '', contact_email: '',
    allergies: '', medical_conditions: '', notes: '',
  });
}

// ─── DOM utility ────────────────────────────────────────────────────────────
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class')           n.className = v;
    else if (k === 'html')       n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else                         n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}

// ─── Modal scaffold (built once, reused) ────────────────────────────────────
let rootEl = null;

function ensureRoot() {
  if (rootEl) return rootEl;
  rootEl = el('div', { id: 'regWizardBackdrop', class: 'sw-backdrop', 'aria-hidden': 'true' }, [
    el('div', { class: 'sw-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rwTitle' }, [
      el('div', { class: 'sw-modal__header' }, [
        el('h3', { id: 'rwTitle', class: 'sw-modal__title' }, 'Inscripción'),
        el('button', { type: 'button', class: 'sw-modal__close', 'aria-label': 'Cerrar', onclick: close }, '×'),
      ]),
      el('div', { class: 'sw-modal__progress', id: 'rwProgress' }),
      el('div', { class: 'sw-modal__body', id: 'rwBody' }),
    ]),
  ]);
  rootEl.addEventListener('click', (e) => { if (e.target === rootEl) close(); });
  document.body.appendChild(rootEl);
  document.addEventListener('keydown', (e) => {
    if (rootEl?.classList.contains('open') && e.key === 'Escape') close();
  });
  return rootEl;
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function openRegistrationWizard({ eventId, eventTitle, eventSlug, onSubmitted } = {}) {
  if (!eventId) return;
  ensureRoot();
  step = 1;
  eventCtx = { id: eventId, title: eventTitle || '', slug: eventSlug || '' };
  onSuccess = onSubmitted || null;
  resetState();
  render();
  rootEl.classList.add('open');
  rootEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => rootEl.querySelector('input, select, textarea')?.focus());
}

export function close() {
  if (!rootEl) return;
  rootEl.classList.remove('open');
  rootEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ─── Renderer ───────────────────────────────────────────────────────────────
function render() {
  rootEl.querySelector('#rwTitle').textContent = eventCtx?.title
    ? `${STEP_TITLES[step]} · ${eventCtx.title}`
    : STEP_TITLES[step];

  const prog = rootEl.querySelector('#rwProgress');
  prog.innerHTML = '';
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    prog.appendChild(el('span', {
      class: 'sw-progress__dot' + (i === step ? ' active' : '') + (i < step ? ' done' : ''),
    }));
  }

  const body = rootEl.querySelector('#rwBody');
  body.innerHTML = '';
  if      (step === 1) renderStep1(body);
  else if (step === 2) renderStep2(body);
  else if (step === 3) renderStep3(body);
  else if (step === 4) renderStep4(body);
}

// ─── Step 1: Asistente ──────────────────────────────────────────────────────
function renderStep1(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' }, 'Datos de la persona que se inscribe.'));
  const grid = el('div', { class: 'sw-grid' });

  grid.appendChild(field({ id: 'rwFirst', label: 'Nombre *',
    input: el('input', { type: 'text', id: 'rwFirst', autocomplete: 'given-name', value: state.first_name,
      oninput: (e) => { state.first_name = e.target.value; } }) }));

  grid.appendChild(field({ id: 'rwLast', label: 'Apellido *',
    input: el('input', { type: 'text', id: 'rwLast', autocomplete: 'family-name', value: state.last_name,
      oninput: (e) => { state.last_name = e.target.value; } }) }));

  grid.appendChild(field({ id: 'rwAge', label: 'Edad *',
    input: el('input', { type: 'number', id: 'rwAge', inputmode: 'numeric', min: '0', max: '120', value: state.age,
      oninput: (e) => { state.age = e.target.value; } }) }));

  grid.appendChild(field({ id: 'rwSex', label: 'Sexo',
    input: selectEl('rwSex', SEX_OPTS, state.sex, v => { state.sex = v; }) }));

  host.appendChild(grid);
  host.appendChild(nav({
    next: 'Siguiente →',
    onNext: () => {
      if (!state.first_name.trim()) return flashError('Escribe el nombre.', 'rwFirst');
      if (!state.last_name.trim())  return flashError('Escribe el apellido.', 'rwLast');
      const age = Number(state.age);
      if (!state.age.trim() || !Number.isInteger(age) || age < 0 || age > 120)
        return flashError('Escribe una edad válida.', 'rwAge');
      step = 2; render();
    },
  }));
}

// ─── Step 2: Contacto de emergencia ─────────────────────────────────────────
function renderStep2(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' }, 'A quién contactar en caso de emergencia.'));
  const grid = el('div', { class: 'sw-grid' });

  grid.appendChild(field({ id: 'rwContact', label: 'Nombre del contacto *',
    input: el('input', { type: 'text', id: 'rwContact', autocomplete: 'name', value: state.contact_name,
      oninput: (e) => { state.contact_name = e.target.value; } }) }));

  grid.appendChild(field({ id: 'rwRel', label: 'Parentesco *',
    input: el('input', { type: 'text', id: 'rwRel', placeholder: 'ej. Madre, Padre, Tutor', value: state.relationship,
      oninput: (e) => { state.relationship = e.target.value; } }) }));

  grid.appendChild(field({ id: 'rwPhone', label: 'Teléfono *',
    input: el('input', { type: 'tel', id: 'rwPhone', autocomplete: 'tel', inputmode: 'tel', placeholder: '(859) 555-1234', value: state.contact_phone,
      oninput: (e) => { state.contact_phone = e.target.value; } }) }));

  grid.appendChild(field({ id: 'rwEmail', label: 'Correo electrónico (opcional)',
    input: el('input', { type: 'email', id: 'rwEmail', autocomplete: 'email', placeholder: 'correo@ejemplo.com', value: state.contact_email,
      oninput: (e) => { state.contact_email = e.target.value; } }) }));

  host.appendChild(grid);
  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 1; render(); },
    next: 'Siguiente →',
    onNext: () => {
      if (!state.contact_name.trim()) return flashError('Escribe el nombre del contacto.', 'rwContact');
      if (!state.relationship.trim()) return flashError('Indica el parentesco.', 'rwRel');
      if (!isValidUSPhone(state.contact_phone)) return flashError('Escribe un teléfono válido de 10 dígitos.', 'rwPhone');
      if (state.contact_email.trim() && !isValidEmail(state.contact_email)) return flashError('El correo no es válido.', 'rwEmail');
      step = 3; render();
    },
  }));
}

// ─── Step 3: Salud ──────────────────────────────────────────────────────────
function renderStep3(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' }, 'Todo lo de abajo es opcional, pero nos ayuda a cuidar mejor al asistente.'));

  host.appendChild(field({ id: 'rwAllergies', label: 'Alergias', full: true,
    input: el('textarea', { id: 'rwAllergies', rows: '2', maxlength: '600', placeholder: 'Indica cualquier alergia',
      oninput: (e) => { state.allergies = e.target.value; } }, state.allergies) }));

  host.appendChild(field({ id: 'rwMedical', label: 'Condiciones médicas', full: true,
    input: el('textarea', { id: 'rwMedical', rows: '2', maxlength: '600', placeholder: 'Indica cualquier condición médica',
      oninput: (e) => { state.medical_conditions = e.target.value; } }, state.medical_conditions) }));

  host.appendChild(field({ id: 'rwNotes', label: 'Notas adicionales', full: true,
    input: el('textarea', { id: 'rwNotes', rows: '2', maxlength: '600', placeholder: 'Cualquier otra cosa que debamos saber',
      oninput: (e) => { state.notes = e.target.value; } }, state.notes) }));

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 2; render(); },
    next: 'Revisar →', onNext: () => { step = 4; render(); },
  }));
}

// ─── Step 4: Confirmar ──────────────────────────────────────────────────────
function renderStep4(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' }, 'Revisa los datos. Si todo está bien, envía la inscripción.'));

  const review = el('dl', { class: 'sw-review' });
  reviewRow(review, 'Nombre',     `${state.first_name} ${state.last_name}`.trim());
  reviewRow(review, 'Edad',       state.age);
  if (state.sex)                reviewRow(review, 'Sexo', state.sex);
  reviewRow(review, 'Contacto',   state.contact_name);
  reviewRow(review, 'Parentesco', state.relationship);
  reviewRow(review, 'Teléfono',   state.contact_phone);
  if (state.contact_email)      reviewRow(review, 'Email', state.contact_email);
  if (state.allergies)          reviewRow(review, 'Alergias', state.allergies);
  if (state.medical_conditions) reviewRow(review, 'Condiciones', state.medical_conditions);
  if (state.notes)              reviewRow(review, 'Notas', state.notes);
  host.appendChild(review);

  host.appendChild(el('p', { class: 'sw-legal' },
    'Tu información solo la verá el liderazgo de la iglesia para organizar el evento.'));

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 3; render(); },
    next: 'Enviar inscripción', nextId: 'rwSubmit', onNext: submit,
  }));
}

// ─── Submit ─────────────────────────────────────────────────────────────────
async function submit() {
  const btn = rootEl.querySelector('#rwSubmit');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

  const payload = {
    event_id:           eventCtx.id,
    first_name:         state.first_name.trim(),
    last_name:          state.last_name.trim(),
    age:                Number(state.age),
    sex:                state.sex || null,
    contact_name:       state.contact_name.trim(),
    relationship:       state.relationship.trim(),
    contact_phone:      state.contact_phone.trim(),
    contact_email:      state.contact_email.trim() || null,
    allergies:          state.allergies.trim() || null,
    medical_conditions: state.medical_conditions.trim() || null,
    notes:              state.notes.trim() || null,
  };

  const { error } = await sb.from('event_registrations').insert(payload);

  if (error) {
    console.error('[registro-wizard] insert:', error);
    btn.disabled = false;
    btn.innerHTML = orig;
    flashError('No pudimos enviar la inscripción. Las inscripciones podrían estar cerradas. Inténtalo de nuevo.');
    return;
  }

  renderSuccess(state.first_name);
  if (typeof onSuccess === 'function') { try { onSuccess({ first_name: payload.first_name }); } catch {} }
}

function renderSuccess(name) {
  const first = (name || '').trim().split(/\s+/)[0];
  const body  = rootEl.querySelector('#rwBody');
  body.innerHTML = `
    <div class="sw-thanks" role="status" aria-live="polite">
      <div class="sw-thanks__icon" aria-hidden="true"><i class="fas fa-circle-check"></i></div>
      <h2 class="sw-thanks__title">¡Inscripción enviada${first ? ', ' + escapeHtml(first) : ''}!</h2>
      <p class="sw-thanks__body">Gracias. Hemos recibido la información correctamente.</p>
      <div class="sw-nav">
        <button type="button" class="sw-btn sw-btn--ghost" id="rwAnother">Inscribir a otra persona</button>
        <span class="sw-nav__spacer"></span>
        <button type="button" class="sw-btn sw-btn--primary" id="rwBack">Volver al evento</button>
      </div>
    </div>`;
  rootEl.querySelector('#rwProgress').innerHTML = '';
  rootEl.querySelector('#rwTitle').textContent  = '¡Listo!';
  rootEl.querySelector('#rwBack').addEventListener('click', () => {
    // Send them back to the event home page they signed up at.
    if (eventCtx?.slug) window.location.href = `/eventos/evento-especial.html?e=${encodeURIComponent(eventCtx.slug)}`;
    else close();
  });
  rootEl.querySelector('#rwAnother').addEventListener('click', () => {
    step = 1; resetState(); render();
    requestAnimationFrame(() => rootEl.querySelector('input')?.focus());
  });
}

// ─── Component helpers ──────────────────────────────────────────────────────
function field({ id, label, input, full }) {
  return el('div', { class: 'sw-field' + (full ? ' sw-field--full' : '') }, [
    el('label', { class: 'sw-field__label', for: id }, label),
    input,
  ]);
}

function selectEl(id, opts, value, onChange) {
  const sel = el('select', { id, onchange: (e) => onChange(e.target.value) });
  for (const o of opts) {
    const opt = el('option', { value: o.v }, o.label);
    if (o.v === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function nav({ back, onBack, next, onNext, nextId }) {
  const wrap = el('div', { class: 'sw-nav' });
  if (back) wrap.appendChild(el('button', { type: 'button', class: 'sw-btn sw-btn--ghost', onclick: onBack }, back));
  wrap.appendChild(el('span', { class: 'sw-nav__spacer' }));
  wrap.appendChild(el('button', { type: 'button', class: 'sw-btn sw-btn--primary', id: nextId || '', onclick: onNext }, next));
  return wrap;
}

function reviewRow(dl, k, v) {
  dl.appendChild(el('dt', {}, k));
  dl.appendChild(el('dd', {}, v));
}

function flashError(msg, focusId) {
  let bar = rootEl.querySelector('.sw-error');
  if (!bar) {
    bar = el('div', { class: 'sw-error', role: 'alert' });
    rootEl.querySelector('#rwBody').prepend(bar);
  }
  bar.textContent = msg;
  bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (focusId) rootEl.querySelector('#' + focusId)?.focus();
  clearTimeout(flashError._t);
  flashError._t = setTimeout(() => bar?.remove(), 4000);
}
