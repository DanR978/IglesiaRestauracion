// js/pages/discipulado/signup-wizard.js
// ─────────────────────────────────────────────────────────────────────────────
// Public group-signup wizard — multi-step popup for /discipulado/grupo/.
//
// Flow:
//   Step 1 → Tus datos        (name, phone, email)
//   Step 2 → Sobre ti         (life stage, gender, experience, family)
//   Step 3 → Logística        (can_host + address, transport, message)
//   Step 4 → Confirmar        (review + submit)
//   → Success screen
//
// Mirrors the admin event-creation wizard UX (admin/wizard.js) but uses
// public-site styling and posts via submitInterest() into the existing
// `discipleship_interests` table.
// ─────────────────────────────────────────────────────────────────────────────

import { submitInterest } from '/js/lib/discipleship.js';

const TOTAL_STEPS = 4;

const AGE_OPTS = [
  { v: '',            label: '— Prefiero no decir —' },
  { v: 'teen',        label: 'Adolescente (13–17)' },
  { v: 'young-adult', label: 'Joven adulto (18–29)' },
  { v: 'adult',       label: 'Adulto (30–59)' },
  { v: 'senior',      label: 'Adulto mayor (60+)' },
];
const GENDER_OPTS = [
  { v: '',              label: '— Prefiero no decir —' },
  { v: 'masculino',     label: 'Masculino' },
  { v: 'femenino',      label: 'Femenino' },
  { v: 'no-especifica', label: 'Prefiero no decir' },
];
const EXP_OPTS = [
  { v: '',  label: 'No estoy seguro' },
  { v: '1', label: 'Nunca — es mi primera vez' },
  { v: '2', label: 'Estoy comenzando en la fe' },
  { v: '3', label: 'Tengo algo de tiempo caminando con Cristo' },
  { v: '4', label: 'Ya he sido discipulado antes' },
  { v: '5', label: 'Quiero crecer para discipular a otros' },
];

const STEP_TITLES = {
  1: 'Tus datos',
  2: 'Sobre ti',
  3: 'Logística',
  4: 'Confirmar y enviar',
};

// ─── State ──────────────────────────────────────────────────────────────────
let step = 1;
let groupCtx = null;        // { id, name } — set when the modal opens
let submitBtnLabel = 'Quiero unirme a este grupo';
let onSuccess = null;       // optional callback fired after a successful submit

const state = {
  full_name: '',
  email: '',
  phone: '',
  age_range: '',
  gender: '',
  experience_level: '',
  bringing_family: '',
  can_host: 'no',
  home_address: '',
  has_transportation: 'yes',
  message: '',
};

// ─── DOM utility ────────────────────────────────────────────────────────────
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class')      n.className = v;
    else if (k === 'html')  n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else                    n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Modal scaffold (built once, reused) ────────────────────────────────────
let rootEl = null;

function ensureRoot() {
  if (rootEl) return rootEl;
  rootEl = el('div', { id: 'signupWizardBackdrop', class: 'sw-backdrop', 'aria-hidden': 'true' }, [
    el('div', { class: 'sw-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'swTitle' }, [
      el('div', { class: 'sw-modal__header' }, [
        el('h3', { id: 'swTitle', class: 'sw-modal__title' }, 'Únete a este grupo'),
        el('button', { type: 'button', class: 'sw-modal__close', 'aria-label': 'Cerrar', onclick: close }, '×'),
      ]),
      el('div', { class: 'sw-modal__progress', id: 'swProgress' }),
      el('div', { class: 'sw-modal__body', id: 'swBody' }),
    ]),
  ]);
  rootEl.addEventListener('click', (e) => { if (e.target === rootEl) close(); });
  document.body.appendChild(rootEl);
  document.addEventListener('keydown', onKey);
  return rootEl;
}

function onKey(e) {
  if (!rootEl?.classList.contains('open')) return;
  if (e.key === 'Escape') close();
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function openSignupWizard({ groupId, groupName, submitLabel, onSubmitted } = {}) {
  ensureRoot();
  step = 1;
  groupCtx = { id: groupId || null, name: groupName || '' };
  submitBtnLabel = submitLabel || 'Quiero unirme a este grupo';
  onSuccess = onSubmitted || null;

  // Reset state — don't persist across openings (each visitor signs up fresh)
  Object.assign(state, {
    full_name: '', email: '', phone: '',
    age_range: '', gender: '', experience_level: '', bringing_family: '',
    can_host: 'no', home_address: '', has_transportation: 'yes',
    message: '',
  });

  render();
  rootEl.classList.add('open');
  rootEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  // Focus the first input on the next frame so the modal animates in first.
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
  const title = rootEl.querySelector('#swTitle');
  title.textContent = groupCtx?.name
    ? `${STEP_TITLES[step]} · ${groupCtx.name}`
    : STEP_TITLES[step];

  // Progress dots
  const prog = rootEl.querySelector('#swProgress');
  prog.innerHTML = '';
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const dot = el('span', {
      class: 'sw-progress__dot' +
        (i === step ? ' active' : '') +
        (i <  step ? ' done'   : ''),
    });
    prog.appendChild(dot);
  }

  const body = rootEl.querySelector('#swBody');
  body.innerHTML = '';
  if      (step === 1) renderStep1(body);
  else if (step === 2) renderStep2(body);
  else if (step === 3) renderStep3(body);
  else if (step === 4) renderStep4(body);
}

// ─── Step 1: Datos básicos ──────────────────────────────────────────────────
function renderStep1(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' },
    'Necesitamos al menos tu nombre y un teléfono o email para que el pastor pueda contactarte.'));

  const grid = el('div', { class: 'sw-grid' });

  grid.appendChild(field({
    id: 'swName', label: 'Nombre completo *', value: state.full_name,
    input: el('input', {
      type: 'text', id: 'swName', autocomplete: 'name', required: true, value: state.full_name,
      oninput: (e) => { state.full_name = e.target.value; },
    }),
  }));

  grid.appendChild(field({
    id: 'swPhone', label: 'Teléfono *',
    input: el('input', {
      type: 'tel', id: 'swPhone', autocomplete: 'tel', inputmode: 'numeric', value: state.phone,
      oninput: (e) => { state.phone = e.target.value; },
    }),
  }));

  grid.appendChild(field({
    id: 'swEmail', label: 'E-mail (opcional)',
    input: el('input', {
      type: 'email', id: 'swEmail', autocomplete: 'email', value: state.email,
      oninput: (e) => { state.email = e.target.value; },
    }),
  }));

  host.appendChild(grid);
  host.appendChild(nav({
    next: 'Siguiente →',
    onNext: () => {
      if (!state.full_name.trim()) return flashError('Por favor escribe tu nombre.', 'swName');
      if (!state.phone.trim() && !state.email.trim()) {
        return flashError('Necesitamos al menos un teléfono o email.', 'swPhone');
      }
      step = 2; render();
    },
  }));
}

// ─── Step 2: Sobre ti ───────────────────────────────────────────────────────
function renderStep2(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' },
    'Estos datos son opcionales — nos ayudan a recibirte mejor.'));

  const grid = el('div', { class: 'sw-grid' });

  grid.appendChild(field({
    id: 'swAge', label: 'Tu etapa de vida',
    input: selectEl('swAge', AGE_OPTS, state.age_range, v => { state.age_range = v; }),
  }));

  grid.appendChild(field({
    id: 'swGender', label: 'Género',
    input: selectEl('swGender', GENDER_OPTS, state.gender, v => { state.gender = v; }),
  }));

  grid.appendChild(field({
    id: 'swExp', label: '¿Has hecho discipulado antes?', full: true,
    input: selectEl('swExp', EXP_OPTS, state.experience_level, v => { state.experience_level = v; }),
  }));

  grid.appendChild(field({
    id: 'swFamily', label: '¿Vienes con familia?', full: true,
    input: el('input', {
      type: 'text', id: 'swFamily', placeholder: 'ej. esposo + 2 niños', value: state.bringing_family,
      oninput: (e) => { state.bringing_family = e.target.value; },
    }),
  }));

  host.appendChild(grid);
  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 1; render(); },
    next: 'Siguiente →', onNext: () => { step = 3; render(); },
  }));
}

// ─── Step 3: Logística ──────────────────────────────────────────────────────
function renderStep3(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' },
    'Esto ayuda al pastor a planear los grupos. Todo es opcional.'));

  // Can host
  host.appendChild(radioGroup({
    label: '¿Podrías ofrecer tu casa para una reunión semanal?',
    name: 'can_host', value: state.can_host,
    options: [
      { v: 'yes',   label: 'Sí, sin problema' },
      { v: 'maybe', label: 'Tal vez, pregúntenme' },
      { v: 'no',    label: 'Prefiero no hospedar' },
    ],
    onChange: (v) => { state.can_host = v; render(); },
  }));

  if (state.can_host === 'yes' || state.can_host === 'maybe') {
    const addrWrap = field({
      id: 'swAddr', label: 'Dirección (solo el pastor la ve)', full: true,
      input: el('input', {
        type: 'text', id: 'swAddr', autocomplete: 'street-address',
        placeholder: 'ej. 1234 Maple St, Lexington, KY 40503',
        value: state.home_address,
        oninput: (e) => { state.home_address = e.target.value; },
      }),
    });
    host.appendChild(addrWrap);
  }

  host.appendChild(radioGroup({
    label: '¿Tienes transporte para llegar?',
    name: 'has_transport', value: state.has_transportation,
    options: [
      { v: 'yes', label: 'Sí, tengo cómo llegar' },
      { v: 'no',  label: 'Necesito ayuda con transporte' },
    ],
    onChange: (v) => { state.has_transportation = v; },
  }));

  host.appendChild(field({
    id: 'swMsg', label: 'Cuéntanos algo más (opcional)', full: true,
    input: el('textarea', {
      id: 'swMsg', rows: '3', maxlength: '600',
      placeholder: 'Cualquier cosa que quieras compartir antes del primer encuentro.',
      oninput: (e) => { state.message = e.target.value; },
    }, state.message),
  }));

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 2; render(); },
    next: 'Revisar →', onNext: () => { step = 4; render(); },
  }));
}

// ─── Step 4: Confirmar ──────────────────────────────────────────────────────
function renderStep4(host) {
  host.appendChild(el('p', { class: 'sw-step__hint' }, 'Revisa los datos. Si todo está bien, envía.'));

  const review = el('dl', { class: 'sw-review' });
  reviewRow(review, 'Nombre',    state.full_name);
  reviewRow(review, 'Teléfono',  state.phone);
  reviewRow(review, 'E-mail',    state.email);
  if (state.age_range)        reviewRow(review, 'Etapa de vida', labelOf(AGE_OPTS,    state.age_range));
  if (state.gender)           reviewRow(review, 'Género',        labelOf(GENDER_OPTS, state.gender));
  if (state.experience_level) reviewRow(review, 'Experiencia',   labelOf(EXP_OPTS,    state.experience_level));
  if (state.bringing_family)  reviewRow(review, 'Familia',       state.bringing_family);
  if (state.can_host === 'yes' || state.can_host === 'maybe')
                              reviewRow(review, 'Hospedar',
                                state.can_host === 'yes' ? 'Sí, sin problema' : 'Tal vez');
  if (state.home_address)     reviewRow(review, 'Dirección',     state.home_address);
  reviewRow(review, 'Transporte',
            state.has_transportation === 'yes' ? 'Sí, tengo cómo llegar' : 'Necesito ayuda con transporte');
  if (state.message)          reviewRow(review, 'Mensaje',       state.message);

  host.appendChild(review);

  host.appendChild(el('p', { class: 'sw-legal' },
    'Tu información solo la verá el pastor y el liderazgo de la iglesia. No la compartimos con nadie más.'));

  host.appendChild(nav({
    back: '← Atrás', onBack: () => { step = 3; render(); },
    next: submitBtnLabel,
    nextClass: 'sw-btn sw-btn--primary',
    nextId: 'swSubmit',
    onNext: submit,
  }));
}

// ─── Submit ─────────────────────────────────────────────────────────────────
async function submit() {
  const btn = rootEl.querySelector('#swSubmit');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

  const payload = {
    full_name:          state.full_name.trim(),
    email:              state.email.trim(),
    phone:              state.phone.trim(),
    experience_level:   state.experience_level || null,
    bringing_family:    state.bringing_family.trim(),
    age_range:          state.age_range || null,
    gender:             state.gender || null,
    message:            state.message.trim(),
    target_group_id:    groupCtx?.id || null,
    can_host:           state.can_host === 'yes' ? true : state.can_host === 'no' ? false : null,
    home_address:       state.home_address.trim(),
    has_transportation: state.has_transportation === 'yes' ? true : state.has_transportation === 'no' ? false : null,
    source:             'group_signup_wizard',
  };

  const { error } = await submitInterest(payload);

  if (error) {
    btn.disabled = false;
    btn.innerHTML = orig;
    flashError(typeof error === 'string' ? error : 'No pudimos enviar tu solicitud. Inténtalo de nuevo.');
    return;
  }

  renderSuccess(payload.full_name);
  if (typeof onSuccess === 'function') {
    try { onSuccess({ full_name: payload.full_name }); } catch {}
  }
}

function renderSuccess(name) {
  const first = (name || '').trim().split(/\s+/)[0];
  const body  = rootEl.querySelector('#swBody');
  body.innerHTML = `
    <div class="sw-thanks" role="status" aria-live="polite">
      <div class="sw-thanks__icon" aria-hidden="true"><i class="fas fa-heart"></i></div>
      <h2 class="sw-thanks__title">¡Gracias${first ? ', ' + escapeHtml(first) : ''} por tu interés!</h2>
      <p class="sw-thanks__body">El pastor recibió tu solicitud y se pondrá en contacto contigo pronto.</p>
      <blockquote class="sw-thanks__verse">
        "Confía en Jehová de todo tu corazón, y no te apoyes en tu propia prudencia."
        <footer>— Proverbios 3:5</footer>
      </blockquote>
      <button type="button" class="sw-btn sw-btn--primary" id="swClose">Cerrar</button>
    </div>`;
  rootEl.querySelector('#swProgress').innerHTML = '';
  rootEl.querySelector('#swTitle').textContent  = '¡Solicitud enviada!';
  rootEl.querySelector('#swClose').addEventListener('click', close);
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

function radioGroup({ label, name, value, options, onChange }) {
  const wrap = el('div', { class: 'sw-field sw-field--full' });
  wrap.appendChild(el('span', { class: 'sw-field__label' }, label));
  const row = el('div', { class: 'sw-radio-row', role: 'radiogroup', 'aria-label': label });
  for (const o of options) {
    const r = el('label', { class: 'sw-radio' + (o.v === value ? ' sw-radio--on' : '') }, [
      el('input', {
        type: 'radio', name, value: o.v,
        checked: o.v === value,
        onchange: (e) => onChange(e.target.value),
      }),
      el('span', {}, o.label),
    ]);
    row.appendChild(r);
  }
  wrap.appendChild(row);
  return wrap;
}

function nav({ back, onBack, next, onNext, nextClass, nextId }) {
  const wrap = el('div', { class: 'sw-nav' });
  if (back) {
    wrap.appendChild(el('button', {
      type: 'button', class: 'sw-btn sw-btn--ghost', onclick: onBack,
    }, back));
  }
  wrap.appendChild(el('span', { class: 'sw-nav__spacer' }));
  wrap.appendChild(el('button', {
    type: 'button', class: nextClass || 'sw-btn sw-btn--primary',
    id: nextId || '', onclick: onNext,
  }, next));
  return wrap;
}

function reviewRow(dl, k, v) {
  dl.appendChild(el('dt', {}, k));
  dl.appendChild(el('dd', {}, v));
}

function labelOf(opts, value) {
  return opts.find(o => o.v === value)?.label || value || '';
}

function flashError(msg, focusId) {
  let bar = rootEl.querySelector('.sw-error');
  if (!bar) {
    bar = el('div', { class: 'sw-error', role: 'alert' });
    rootEl.querySelector('#swBody').prepend(bar);
  }
  bar.textContent = msg;
  bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (focusId) rootEl.querySelector('#' + focusId)?.focus();
  // Auto-clear after 4s
  clearTimeout(flashError._t);
  flashError._t = setTimeout(() => bar?.remove(), 4000);
}
