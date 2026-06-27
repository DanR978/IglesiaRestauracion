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
import { isValidEmail, isValidUSPhone, formatUSPhoneNational } from '/js/lib/validators.js';
import { createSignaturePad } from '/js/components/signature-pad.js';
import { WAIVER_VERSION, renderWaiverPrintDoc } from '/js/lib/waiver.js';
import { celebrateModal } from '/js/lib/celebrate.js';

const TOTAL_STEPS = 5;
const DEFAULT_LOC = '2601 Clays Mill Rd, Lexington, KY 40503';

function fmtDateEs(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/New_York',
    });
  } catch { return ''; }
}

const SEX_OPTS = [
  { v: '',                  label: '— Prefiero no decir —' },
  { v: 'Femenino',          label: 'Femenino' },
  { v: 'Masculino',         label: 'Masculino' },
  { v: 'Prefiere no decir', label: 'Prefiere no decir' },
];

const STEP_TITLES = {
  1: 'Participantes',
  2: 'Contacto de emergencia',
  3: 'Información de salud',
  4: 'Exoneración',
  5: 'Confirmar y enviar',
};

// ─── State ──────────────────────────────────────────────────────────────────
let step = 1;
let eventCtx = null;        // { id, title, slug, date, location }
let onSuccess = null;
let signaturePad = null;    // active SignaturePad on the Exoneración step
let stopCelebration = null; // teardown for the confirm-step celebration

// One attendee. A parent can register several at once (e.g. siblings); each
// keeps its own identity + health, and all share the contact + signed waiver.
function blankParticipant() {
  return { first_name: '', last_name: '', age: '', sex: '', allergies: '', medical_conditions: '', notes: '' };
}

const FRESH = () => ({
  participants: [blankParticipant()],
  // Parent / legal guardian — the person who signs.
  parent_name: '', parent_relationship: '', parent_phone: '', parent_email: '',
  // Emergency contact. When same_emergency is true it mirrors the parent.
  same_emergency: true, contact_name: '', contact_phone: '',
  // Waiver: signature is either a drawn PNG (sig_image) or a typed name
  // (sig_name); sig_mode selects which. signed_at stamps when it was signed.
  sig_mode: 'draw', sig_image: '', sig_name: '', signed_at: '',
});

// The emergency contact actually used (parent's info when "same" is checked).
function emergencyName()  { return state.same_emergency ? state.parent_name  : state.contact_name; }
function emergencyPhone() { return state.same_emergency ? state.parent_phone : state.contact_phone; }

const state = FRESH();

function resetState() { Object.assign(state, FRESH()); }

// Display name for a participant ("" until they type one).
function participantName(p) { return `${p.first_name} ${p.last_name}`.trim(); }

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
export function openRegistrationWizard({ eventId, eventTitle, eventSlug, eventDate, eventLocation, onSubmitted } = {}) {
  if (!eventId) return;
  ensureRoot();
  step = 1;
  eventCtx = {
    id: eventId, title: eventTitle || '', slug: eventSlug || '',
    date: eventDate || '', location: eventLocation || '',
  };
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
  if (stopCelebration) { try { stopCelebration(); } catch {} stopCelebration = null; }
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

  // Tear down any signature pad from a previous render (removes its listeners);
  // step 4 recreates a fresh one.
  if (signaturePad) { try { signaturePad.destroy(); } catch {} signaturePad = null; }

  // Stop the confirm-step celebration when navigating away from it (the neon
  // border + button pulse + fireworks only belong on the "Confirmar" step).
  if (stopCelebration) { try { stopCelebration(); } catch {} stopCelebration = null; }

  const body = rootEl.querySelector('#rwBody');
  body.innerHTML = '';
  if      (step === 1) renderStep1(body);
  else if (step === 2) renderStep2(body);
  else if (step === 3) renderStep3(body);
  else if (step === 4) renderStep4(body);
  else if (step === 5) renderStep5(body);
}

// ─── Step 1: Participantes (one or several) ─────────────────────────────────
function renderStep1(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' },
    'Agrega a cada persona que se inscribe. Puedes inscribir a varios (por ejemplo, hermanos) con una sola firma.'));

  state.participants.forEach((p, i) => host.appendChild(participantCard(p, i)));

  host.appendChild(el('button', { type: 'button', class: 'sw-add',
    onclick: () => { state.participants.push(blankParticipant()); render(); } },
    [el('i', { class: 'fas fa-plus' }), ' Agregar otro participante']));

  host.appendChild(nav({
    next: 'Siguiente →',
    onNext: () => {
      for (let i = 0; i < state.participants.length; i++) {
        const p = state.participants[i];
        if (!p.first_name.trim()) return flashError(`Escribe el nombre del participante ${i + 1}.`, `rwFirst${i}`);
        if (!p.last_name.trim())  return flashError(`Escribe el apellido del participante ${i + 1}.`, `rwLast${i}`);
        const age = Number(p.age);
        if (!String(p.age).trim() || !Number.isInteger(age) || age < 0 || age > 120)
          return flashError(`Escribe una edad válida para el participante ${i + 1}.`, `rwAge${i}`);
      }
      step = 2; render();
    },
  }));
}

function participantCard(p, i) {
  const multi = state.participants.length > 1;
  const head = el('div', { class: 'sw-pcard__head' }, [
    el('span', { class: 'sw-pcard__title' }, multi ? `Participante ${i + 1}` : 'Participante'),
    multi ? el('button', { type: 'button', class: 'sw-pcard__remove', 'aria-label': 'Quitar participante',
      onclick: () => { state.participants.splice(i, 1); render(); } }, [el('i', { class: 'fas fa-trash' })]) : null,
  ]);
  const grid = el('div', { class: 'sw-grid' });
  grid.appendChild(field({ id: `rwFirst${i}`, label: 'Nombre *',
    input: el('input', { type: 'text', id: `rwFirst${i}`, autocomplete: 'off', value: p.first_name,
      oninput: (e) => { p.first_name = e.target.value; } }) }));
  grid.appendChild(field({ id: `rwLast${i}`, label: 'Apellido *',
    input: el('input', { type: 'text', id: `rwLast${i}`, autocomplete: 'off', value: p.last_name,
      oninput: (e) => { p.last_name = e.target.value; } }) }));
  grid.appendChild(field({ id: `rwAge${i}`, label: 'Edad *',
    input: el('input', { type: 'number', id: `rwAge${i}`, inputmode: 'numeric', min: '0', max: '120', value: p.age,
      oninput: (e) => { p.age = e.target.value; } }) }));
  grid.appendChild(field({ id: `rwSex${i}`, label: 'Sexo',
    input: selectEl(`rwSex${i}`, SEX_OPTS, p.sex, v => { p.sex = v; }) }));
  return el('div', { class: 'sw-pcard' }, [head, grid]);
}

// ─── Step 2: Padre/Tutor + contacto de emergencia ───────────────────────────
function renderStep2(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' },
    'Información del padre, la madre o el tutor legal que firma, y un contacto de emergencia.'));

  // Parent / guardian
  host.appendChild(el('div', { class: 'sw-section-label' }, 'Padre / Madre / Tutor legal'));
  const pg = el('div', { class: 'sw-grid' });
  pg.appendChild(field({ id: 'rwPName', label: 'Nombre completo *',
    input: el('input', { type: 'text', id: 'rwPName', autocomplete: 'name', value: state.parent_name,
      oninput: (e) => { state.parent_name = e.target.value; if (state.same_emergency) syncEmergencyInputs(); } }) }));
  pg.appendChild(field({ id: 'rwPRel', label: 'Parentesco *',
    input: el('input', { type: 'text', id: 'rwPRel', placeholder: 'ej. Madre, Padre, Tutor', value: state.parent_relationship,
      oninput: (e) => { state.parent_relationship = e.target.value; } }) }));
  pg.appendChild(field({ id: 'rwPPhone', label: 'Teléfono *',
    input: el('input', { type: 'tel', id: 'rwPPhone', autocomplete: 'tel', inputmode: 'tel', placeholder: '(859) 555-1234', value: state.parent_phone,
      oninput: (e) => { state.parent_phone = e.target.value; if (state.same_emergency) syncEmergencyInputs(); } }) }));
  pg.appendChild(field({ id: 'rwPEmail', label: 'Correo electrónico (opcional)',
    input: el('input', { type: 'email', id: 'rwPEmail', autocomplete: 'email', placeholder: 'correo@ejemplo.com', value: state.parent_email,
      oninput: (e) => { state.parent_email = e.target.value; } }) }));
  host.appendChild(pg);

  // Emergency contact + "same as parent" toggle
  host.appendChild(el('div', { class: 'sw-section-label' }, 'Contacto de emergencia'));
  host.appendChild(el('label', { class: 'sw-check' }, [
    el('input', { type: 'checkbox', id: 'rwSame', checked: state.same_emergency,
      onchange: (e) => { state.same_emergency = e.target.checked; render(); } }),
    el('span', {}, 'Usar la información del padre / madre / tutor'),
  ]));

  const eg = el('div', { class: 'sw-grid' });
  eg.appendChild(field({ id: 'rwEName', label: 'Nombre del contacto *',
    input: el('input', { type: 'text', id: 'rwEName', autocomplete: 'off',
      value: emergencyName(), disabled: state.same_emergency,
      oninput: (e) => { state.contact_name = e.target.value; } }) }));
  eg.appendChild(field({ id: 'rwEPhone', label: 'Teléfono *',
    input: el('input', { type: 'tel', id: 'rwEPhone', inputmode: 'tel', placeholder: '(859) 555-1234',
      value: emergencyPhone(), disabled: state.same_emergency,
      oninput: (e) => { state.contact_phone = e.target.value; } }) }));
  if (state.same_emergency) eg.classList.add('sw-grid--disabled');
  host.appendChild(eg);

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 1; render(); },
    next: 'Siguiente →',
    onNext: () => {
      if (!state.parent_name.trim())         return flashError('Escribe el nombre del padre / madre / tutor.', 'rwPName');
      if (!state.parent_relationship.trim()) return flashError('Indica el parentesco.', 'rwPRel');
      if (!isValidUSPhone(state.parent_phone)) return flashError('Escribe un teléfono válido de 10 dígitos.', 'rwPPhone');
      if (state.parent_email.trim() && !isValidEmail(state.parent_email)) return flashError('El correo no es válido.', 'rwPEmail');
      if (!state.same_emergency) {
        if (!state.contact_name.trim())          return flashError('Escribe el nombre del contacto de emergencia.', 'rwEName');
        if (!isValidUSPhone(state.contact_phone)) return flashError('Escribe un teléfono de emergencia válido.', 'rwEPhone');
      }
      step = 3; render();
    },
  }));
}

// Mirror the parent's name/phone into the (disabled) emergency inputs live.
function syncEmergencyInputs() {
  const n = rootEl.querySelector('#rwEName'), p = rootEl.querySelector('#rwEPhone');
  if (n) n.value = state.parent_name;
  if (p) p.value = state.parent_phone;
}

// ─── Step 3: Salud (per participant) ────────────────────────────────────────
function renderStep3(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' },
    'Todo lo de abajo es opcional, pero nos ayuda a cuidar mejor a cada asistente.'));

  const multi = state.participants.length > 1;
  state.participants.forEach((p, i) => {
    const card = el('div', { class: 'sw-pcard' });
    if (multi) card.appendChild(el('div', { class: 'sw-pcard__head' }, [
      el('span', { class: 'sw-pcard__title' }, participantName(p) || `Participante ${i + 1}`),
    ]));
    card.appendChild(field({ id: `rwAllergies${i}`, label: 'Alergias', full: true,
      input: el('textarea', { id: `rwAllergies${i}`, rows: '2', maxlength: '600', placeholder: 'Indica cualquier alergia',
        oninput: (e) => { p.allergies = e.target.value; } }, p.allergies) }));
    card.appendChild(field({ id: `rwMedical${i}`, label: 'Condiciones médicas', full: true,
      input: el('textarea', { id: `rwMedical${i}`, rows: '2', maxlength: '600', placeholder: 'Indica cualquier condición médica',
        oninput: (e) => { p.medical_conditions = e.target.value; } }, p.medical_conditions) }));
    card.appendChild(field({ id: `rwNotes${i}`, label: 'Notas adicionales', full: true,
      input: el('textarea', { id: `rwNotes${i}`, rows: '2', maxlength: '600', placeholder: 'Cualquier otra cosa que debamos saber',
        oninput: (e) => { p.notes = e.target.value; } }, p.notes) }));
    host.appendChild(card);
  });

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 2; render(); },
    next: 'Continuar →', onNext: () => { step = 4; render(); },
  }));
}

// ─── Step 4: Exoneración (waiver + signature) ───────────────────────────────
// Renders the real document (same layout as the printed / saved copy) with the
// event + participant entries embedded; the signature is captured directly on
// the document's own signature line and the date is auto-stamped. A drawn
// signature is the default; "Escribir nombre" is a typed e-signature fallback.
function renderStep4(host) {
  host.appendChild(el('p', { class: 'sw-step__hint sw-step__hint--sm' },
    'Lee la exoneración. Tus datos ya están completos — solo falta tu firma; la fecha se registra automáticamente.'));

  // The document, with a mount point where the signature goes.
  const ev = eventCtx || {};
  const docHtml = renderWaiverPrintDoc({
    event: { title: ev.title || '', date: fmtDateEs(ev.date), location: ev.location || DEFAULT_LOC },
    participants: state.participants.map(p => ({ name: participantName(p), age: p.age })),
    guardian: { name: state.parent_name, relationship: state.parent_relationship, phone: formatUSPhoneNational(state.parent_phone), email: state.parent_email },
    emergency: { name: emergencyName(), phone: formatUSPhoneNational(emergencyPhone()) },
    signedDate: fmtDateEs(state.signed_at || new Date().toISOString()),
    signatureSlot: '<div class="wv-sigmount" id="wvSigMount"></div>',
  });
  const doc = el('div', { class: 'sw-doc', html: docHtml });
  host.appendChild(doc);

  // Mount the active signer (pad or typed input) onto the document's line.
  const mount = doc.querySelector('#wvSigMount');
  if (state.sig_mode === 'type') {
    mount.appendChild(el('input', { type: 'text', id: 'rwSigName', class: 'wv-typed-input', autocomplete: 'name',
      placeholder: 'Escribe tu nombre completo', value: state.sig_name,
      oninput: (e) => { state.sig_name = e.target.value; } }));
  } else {
    signaturePad = createSignaturePad({ height: 64 });
    mount.appendChild(signaturePad.element);
    if (state.sig_image) {
      const saved = state.sig_image;
      requestAnimationFrame(() => { signaturePad?.resize(); signaturePad?.loadDataURL(saved); });
    }
  }

  // Control bar: signature mode toggle + clear (clear only applies to drawing).
  host.appendChild(el('div', { class: 'sw-sign__bar' }, [
    el('div', { class: 'sw-sign__tabs', role: 'tablist' }, [
      el('button', { type: 'button', class: 'sw-sign__tab' + (state.sig_mode === 'draw' ? ' active' : ''),
        onclick: () => switchSig('draw') }, 'Dibujar'),
      el('button', { type: 'button', class: 'sw-sign__tab' + (state.sig_mode === 'type' ? ' active' : ''),
        onclick: () => switchSig('type') }, 'Escribir nombre'),
    ]),
    state.sig_mode === 'draw'
      ? el('button', { type: 'button', class: 'sw-sign__clear',
          onclick: () => { signaturePad?.clear(); state.sig_image = ''; } }, 'Borrar firma')
      : null,
  ]));

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { stashSignature(); step = 3; render(); },
    next: 'Revisar →', onNext: () => {
      stashSignature();
      if (state.sig_mode === 'draw' && !state.sig_image)
        return flashError('Dibuja tu firma para continuar, o usa «Escribir nombre».');
      if (state.sig_mode === 'type' && state.sig_name.trim().length < 3)
        return flashError('Escribe tu nombre completo como firma.', 'rwSigName');
      if (!state.signed_at) state.signed_at = new Date().toISOString();
      step = 5; render();
    },
  }));
}

// Pull the current drawing out of the live pad into state before the step is
// re-rendered (tab switch, back/next) so the signature survives navigation.
function stashSignature() {
  if (state.sig_mode === 'draw' && signaturePad) {
    const url = signaturePad.toDataURL();
    if (url) state.sig_image = url;
  }
}

function switchSig(mode) {
  if (state.sig_mode === mode) return;
  stashSignature();
  state.sig_mode = mode;
  render();
}

// ─── Step 5: Confirmar ──────────────────────────────────────────────────────
function renderStep5(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' }, 'Revisa los datos. Si todo está bien, envía la inscripción.'));

  const review = el('dl', { class: 'sw-review' });
  const multi = state.participants.length > 1;
  state.participants.forEach((p, i) => {
    const tag = multi ? ` ${i + 1}` : '';
    reviewRow(review, `Participante${tag}`,
      `${participantName(p)} · ${p.age} años${p.sex ? ` · ${p.sex}` : ''}`);
    if (p.allergies)          reviewRow(review, `Alergias${tag}`, p.allergies);
    if (p.medical_conditions) reviewRow(review, `Condiciones${tag}`, p.medical_conditions);
    if (p.notes)              reviewRow(review, `Notas${tag}`, p.notes);
  });
  reviewRow(review, 'Padre / tutor', `${state.parent_name} (${state.parent_relationship})`);
  reviewRow(review, 'Teléfono',   formatUSPhoneNational(state.parent_phone));
  if (state.parent_email)       reviewRow(review, 'Email', state.parent_email);
  reviewRow(review, 'Emergencia', `${emergencyName()} · ${formatUSPhoneNational(emergencyPhone())}`);
  reviewRow(review, 'Exoneración', `Firmada · ${fmtDateEs(state.signed_at)}`);
  host.appendChild(review);

  // Signature preview so they can confirm the mark they're submitting.
  if (state.sig_image) {
    host.appendChild(el('div', { class: 'sw-sign__row' }, [
      el('img', { src: state.sig_image, alt: 'Firma', style: 'max-height:54px;border-bottom:1px solid #999' }),
    ]));
  } else if (state.sig_name) {
    host.appendChild(el('div', { class: 'sw-sign__typed' }, state.sig_name));
  }

  host.appendChild(el('p', { class: 'sw-legal' },
    'Tu información solo la verá el liderazgo de la iglesia para organizar el evento.'));

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 4; render(); },
    next: 'Enviar inscripción', nextId: 'rwSubmit', onNext: submit,
  }));

  // Reaching the final step is the celebratory moment: neon border + fireworks
  // and confetti, with the "Enviar inscripción" button pulsing to invite the
  // last tap. Respects reduced-motion (handled inside celebrateModal).
  stopCelebration = celebrateModal({
    modal: rootEl.querySelector('.sw-modal'),
    button: rootEl.querySelector('#rwSubmit'),
  });
}

// ─── Submit ─────────────────────────────────────────────────────────────────
async function submit() {
  const btn = rootEl.querySelector('#rwSubmit');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

  // Fields shared by every participant in this submission.
  const groupId = state.participants.length > 1 && typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : null;
  const shared = {
    event_id:             eventCtx.id,
    contact_name:         emergencyName().trim(),
    contact_phone:        emergencyPhone().trim(),
    relationship:         state.parent_relationship.trim(),
    contact_email:        state.parent_email.trim() || null,
    parent_name:          state.parent_name.trim(),
    parent_relationship:  state.parent_relationship.trim(),
    parent_phone:         state.parent_phone.trim(),
    parent_email:         state.parent_email.trim() || null,
    signature_image:      state.sig_mode === 'draw' ? (state.sig_image || null) : null,
    signature_name:       state.sig_mode === 'type' ? (state.sig_name.trim() || null) : null,
    waiver_signed_at:     state.signed_at || new Date().toISOString(),
    waiver_version:       WAIVER_VERSION,
    registration_group_id: groupId,
  };
  const payload = state.participants.map(p => ({
    ...shared,
    first_name:         p.first_name.trim(),
    last_name:          p.last_name.trim(),
    age:                Number(p.age),
    sex:                p.sex || null,
    allergies:          p.allergies.trim() || null,
    medical_conditions: p.medical_conditions.trim() || null,
    notes:              p.notes.trim() || null,
  }));

  const { error } = await sb.from('event_registrations').insert(payload);

  if (error) {
    console.error('[registro-wizard] insert:', error);
    btn.disabled = false;
    btn.innerHTML = orig;
    flashError('No pudimos enviar la inscripción. Las inscripciones podrían estar cerradas. Inténtalo de nuevo.');
    return;
  }

  renderSuccess(state.participants[0]?.first_name || '', state.participants.length);
  if (typeof onSuccess === 'function') { try { onSuccess({ first_name: payload[0].first_name }); } catch {} }
}

function renderSuccess(name, count = 1) {
  // The celebration belongs to the confirm step; the success screen is calm.
  if (stopCelebration) { try { stopCelebration(); } catch {} stopCelebration = null; }
  const first = (name || '').trim().split(/\s+/)[0];
  const body  = rootEl.querySelector('#rwBody');
  const msg = count > 1
    ? `Hemos recibido las ${count} inscripciones correctamente.`
    : 'Hemos recibido la información correctamente.';
  body.innerHTML = `
    <div class="sw-thanks" role="status" aria-live="polite">
      <div class="sw-thanks__icon" aria-hidden="true"><i class="fas fa-circle-check"></i></div>
      <h2 class="sw-thanks__title">¡Inscripción enviada${first ? ', ' + escapeHtml(first) : ''}!</h2>
      <p class="sw-thanks__body">Gracias. ${msg}</p>
      <div class="sw-nav">
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
