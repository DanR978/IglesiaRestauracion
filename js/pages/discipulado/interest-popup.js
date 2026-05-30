// js/pages/discipulado/interest-popup.js
// ─────────────────────────────────────────────────────────────────────────────
// Single-step "Estoy interesado" popup — for the /discipulado/ hub page.
// Lighter than the per-group wizard: just first name, last name, phone,
// and an optional message. Lands in the same `discipleship_interests`
// table the admin reads from, but without a target_group_id so it shows
// up in the Interesados sub-panel as an unassigned general lead.
//
// Reuses the .sw-* modal classes from css/pages/discipulado-wizard.css
// so we don't duplicate ~200 lines of styling.
// ─────────────────────────────────────────────────────────────────────────────

import { submitInterest } from '/js/lib/discipleship.js';

let rootEl = null;
let onSubmittedCb = null;

const state = { first_name: '', last_name: '', phone: '', message: '' };

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if      (k === 'class')      n.className = v;
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ensureRoot() {
  if (rootEl) return rootEl;
  rootEl = el('div', { id: 'interestPopupBackdrop', class: 'sw-backdrop', 'aria-hidden': 'true' }, [
    el('div', { class: 'sw-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ipTitle' }, [
      el('div', { class: 'sw-modal__header' }, [
        el('h3', { id: 'ipTitle', class: 'sw-modal__title' }, 'Estoy interesado'),
        el('button', { type: 'button', class: 'sw-modal__close', 'aria-label': 'Cerrar', onclick: close }, '×'),
      ]),
      el('div', { class: 'sw-modal__body', id: 'ipBody' }),
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

export function openInterestPopup({ onSubmitted } = {}) {
  ensureRoot();
  Object.assign(state, { first_name: '', last_name: '', phone: '', message: '' });
  onSubmittedCb = onSubmitted || null;
  renderForm();
  rootEl.classList.add('open');
  rootEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => rootEl.querySelector('input')?.focus());
}

export function close() {
  if (!rootEl) return;
  rootEl.classList.remove('open');
  rootEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function renderForm() {
  rootEl.querySelector('#ipTitle').textContent = 'Estoy interesado';

  const body = rootEl.querySelector('#ipBody');
  body.innerHTML = '';

  body.appendChild(el('p', { class: 'sw-step__hint' },
    'Déjanos tus datos y el pastor te contactará para guiarte al grupo adecuado.'));

  const grid = el('div', { class: 'sw-grid' });

  grid.appendChild(field({
    id: 'ipFirstName', label: 'Nombre *',
    input: el('input', {
      type: 'text', id: 'ipFirstName', autocomplete: 'given-name', value: state.first_name,
      oninput: (e) => { state.first_name = e.target.value; },
    }),
  }));

  grid.appendChild(field({
    id: 'ipLastName', label: 'Apellido',
    input: el('input', {
      type: 'text', id: 'ipLastName', autocomplete: 'family-name', value: state.last_name,
      oninput: (e) => { state.last_name = e.target.value; },
    }),
  }));

  grid.appendChild(field({
    id: 'ipPhone', label: 'Teléfono *', full: true,
    input: el('input', {
      type: 'tel', id: 'ipPhone', autocomplete: 'tel', inputmode: 'numeric', value: state.phone,
      oninput: (e) => { state.phone = e.target.value; },
    }),
  }));

  grid.appendChild(field({
    id: 'ipMessage', label: 'Mensaje (opcional)', full: true,
    input: el('textarea', {
      id: 'ipMessage', rows: '4', maxlength: '600',
      placeholder: '¿Algo que quieras que el pastor sepa antes de contactarte?',
      oninput: (e) => { state.message = e.target.value; },
    }, state.message),
  }));

  body.appendChild(grid);

  body.appendChild(el('p', { class: 'sw-legal' },
    'Tu información solo la verá el pastor y el liderazgo de la iglesia.'));

  body.appendChild(nav({
    next: 'Enviar', nextId: 'ipSubmit',
    onNext: submit,
  }));
}

async function submit() {
  const btn = rootEl.querySelector('#ipSubmit');
  if (!btn || btn.disabled) return;

  if (!state.first_name.trim()) return flashError('Por favor escribe tu nombre.', 'ipFirstName');
  if (!state.phone.trim())      return flashError('Necesitamos un teléfono para contactarte.', 'ipPhone');

  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

  const fullName = [state.first_name.trim(), state.last_name.trim()].filter(Boolean).join(' ');

  const { error } = await submitInterest({
    full_name: fullName,
    phone:     state.phone.trim(),
    message:   state.message.trim(),
    source:    'discipulado_interested',
  });

  if (error) {
    btn.disabled = false;
    btn.innerHTML = orig;
    flashError(typeof error === 'string' ? error : 'No pudimos enviar tu solicitud. Inténtalo de nuevo.');
    return;
  }

  renderSuccess(state.first_name);
  if (typeof onSubmittedCb === 'function') {
    try { onSubmittedCb({ full_name: fullName }); } catch {}
  }
}

function renderSuccess(name) {
  const first = (name || '').trim().split(/\s+/)[0];
  const body  = rootEl.querySelector('#ipBody');
  body.innerHTML = `
    <div class="sw-thanks" role="status" aria-live="polite">
      <div class="sw-thanks__icon" aria-hidden="true"><i class="fas fa-heart"></i></div>
      <h2 class="sw-thanks__title">¡Gracias${first ? ', ' + escapeHtml(first) : ''}!</h2>
      <p class="sw-thanks__body">El pastor recibió tu interés y se pondrá en contacto contigo pronto.</p>
      <blockquote class="sw-thanks__verse">
        "Confía en Jehová de todo tu corazón, y no te apoyes en tu propia prudencia."
        <footer>— Proverbios 3:5</footer>
      </blockquote>
      <button type="button" class="sw-btn sw-btn--primary" id="ipClose">Cerrar</button>
    </div>`;
  rootEl.querySelector('#ipTitle').textContent = '¡Solicitud enviada!';
  rootEl.querySelector('#ipClose').addEventListener('click', close);
}

// ─── Component helpers (mirror signup-wizard.js) ────────────────────────────
function field({ id, label, input, full }) {
  return el('div', { class: 'sw-field' + (full ? ' sw-field--full' : '') }, [
    el('label', { class: 'sw-field__label', for: id }, label),
    input,
  ]);
}

function nav({ next, onNext, nextClass, nextId }) {
  return el('div', { class: 'sw-nav' }, [
    el('span', { class: 'sw-nav__spacer' }),
    el('button', {
      type: 'button',
      class: nextClass || 'sw-btn sw-btn--primary',
      id: nextId || '',
      onclick: onNext,
    }, next),
  ]);
}

function flashError(msg, focusId) {
  let bar = rootEl.querySelector('.sw-error');
  if (!bar) {
    bar = el('div', { class: 'sw-error', role: 'alert' });
    rootEl.querySelector('#ipBody').prepend(bar);
  }
  bar.textContent = msg;
  bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (focusId) rootEl.querySelector('#' + focusId)?.focus();
  clearTimeout(flashError._t);
  flashError._t = setTimeout(() => bar?.remove(), 4000);
}
