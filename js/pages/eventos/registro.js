// js/pages/eventos/registro.js
// Public registration form for a special event. Reads ?e=<slug> (fallback
// ?id=<uuid>), confirms the event is open, validates input, and inserts a row
// into event_registrations (anon INSERT-only via RLS — see migration).

import { sb } from '/js/lib/supabase.js';
import { showToast } from '/js/lib/toast.js';
import { isValidEmail, isValidUSPhone } from '/js/lib/validators.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.style.display = ''; };
const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };

let currentEvent = null;

// ── Field error helpers ──────────────────────────────────
function setFieldError(input, msg) {
  input?.classList.add('input-error');
  if (msg) {
    const box = $('reg-form-error');
    box.textContent = msg;
    box.style.display = '';
  }
}
function clearErrors() {
  document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
  const box = $('reg-form-error');
  box.textContent = '';
  box.style.display = 'none';
}

// ── Load the event ───────────────────────────────────────
async function loadEvent() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('e');
  const id   = params.get('id');
  if (!slug && !id) return showError();

  try {
    let q = sb.from('special_events').select('*');
    q = slug ? q.eq('slug', slug) : q.eq('id', id);
    const { data, error } = await q.single();
    if (error || !data) return showError();
    if (!data.registration_open) {
      return showError('Las inscripciones para este evento están cerradas.');
    }
    currentEvent = data;
    $('reg-event-title').textContent = data.title || 'Evento';
    hide('reg-loading');
    show('reg-content');
  } catch (err) {
    console.error('[registro] error:', err);
    showError();
  }
}

function showError(msg) {
  hide('reg-loading');
  hide('reg-content');
  if (msg) $('reg-error-msg').textContent = msg;
  show('reg-error');
}

// ── Submit ───────────────────────────────────────────────
async function onSubmit(e) {
  e.preventDefault();
  if (!currentEvent) return;
  clearErrors();

  const first   = $('r-first').value.trim();
  const last    = $('r-last').value.trim();
  const ageRaw  = $('r-age').value.trim();
  const sex     = $('r-sex').value || null;
  const contact = $('r-contact').value.trim();
  const rel     = $('r-rel').value.trim();
  const phone   = $('r-phone').value.trim();
  const email   = $('r-email').value.trim();

  // Required-field validation
  const missing = [];
  if (!first)   { setFieldError($('r-first')); missing.push('nombre'); }
  if (!last)    { setFieldError($('r-last')); missing.push('apellido'); }
  if (!ageRaw)  { setFieldError($('r-age')); missing.push('edad'); }
  if (!contact) { setFieldError($('r-contact')); missing.push('contacto'); }
  if (!rel)     { setFieldError($('r-rel')); missing.push('parentesco'); }
  if (!phone)   { setFieldError($('r-phone')); missing.push('teléfono'); }
  if (missing.length) {
    setFieldError(null, 'Por favor completa los campos obligatorios (*).');
    showToast('Faltan campos obligatorios', { ok: false });
    return;
  }

  const age = Number(ageRaw);
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    setFieldError($('r-age'), 'Ingresa una edad válida.');
    return;
  }
  if (!isValidUSPhone(phone)) {
    setFieldError($('r-phone'), 'Ingresa un teléfono válido de 10 dígitos.');
    return;
  }
  if (email && !isValidEmail(email)) {
    setFieldError($('r-email'), 'Ingresa un correo electrónico válido.');
    return;
  }

  const payload = {
    event_id:           currentEvent.id,
    first_name:         first,
    last_name:          last,
    age,
    sex,
    contact_name:       contact,
    relationship:       rel,
    contact_phone:      phone,
    contact_email:      email || null,
    allergies:          $('r-allergies').value.trim() || null,
    medical_conditions: $('r-medical').value.trim() || null,
    notes:              $('r-notes').value.trim() || null,
  };

  const btn = $('reg-submit');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Enviando...';

  const { error } = await sb.from('event_registrations').insert(payload);

  btn.disabled = false;
  btn.textContent = original;

  if (error) {
    console.error('[registro] insert error:', error);
    setFieldError(null, 'No se pudo enviar el registro. Las inscripciones podrían estar cerradas. Intenta de nuevo.');
    showToast('No se pudo enviar el registro', { ok: false });
    return;
  }

  hide('reg-form');
  show('reg-success');
  showToast('¡Registro enviado!', { ok: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForRegisterAnother() {
  $('reg-form').reset();
  clearErrors();
  hide('reg-success');
  show('reg-form');
  $('r-first').focus();
}

// ── Boot ─────────────────────────────────────────────────
let booted = false;
function init() {
  if (booted) return;
  booted = true;
  $('reg-form')?.addEventListener('submit', onSubmit);
  $('reg-another')?.addEventListener('click', resetForRegisterAnother);
  loadEvent();
}

document.addEventListener('includes:ready', init);
if (document.documentElement.classList.contains('ready')) init();
