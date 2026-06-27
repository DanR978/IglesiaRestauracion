// js/pages/eventos/registro.js
// Standalone registration page (?e=<slug> | ?id=<uuid>). Loads the event, then
// opens the step-by-step registration wizard. Behind the wizard sits a focused
// card with the event title + a button to (re)open it — so direct links and
// closing the wizard both leave a sensible page.

import { sb } from '/js/lib/supabase.js';
import { openRegistrationWizard } from '/js/pages/eventos/registro-wizard.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.style.display = ''; };
const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };

let currentEvent = null;
let booted = false;

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
    const past = data.event_at ? (() => { try { return new Date(data.event_at).getTime() < Date.now(); } catch { return false; } })() : false;
    const isOpen = data.registration_open && data.status !== 'closed' && data.status !== 'completed' && !past;
    if (!isOpen) return showError('Las inscripciones se han cerrado. Por favor, contacta al pastor para recibir ayuda.');

    currentEvent = data;
    $('reg-event-title').textContent = data.title || 'Evento';
    hide('reg-loading');
    show('reg-content');

    $('reg-open-btn').addEventListener('click', openWizard);
    openWizard();   // open immediately on arrival
  } catch (err) {
    console.error('[registro] error:', err);
    showError();
  }
}

function openWizard() {
  if (!currentEvent) return;
  openRegistrationWizard({ eventId: currentEvent.id, eventTitle: currentEvent.title, eventSlug: currentEvent.slug, eventDate: currentEvent.event_at, eventLocation: currentEvent.location });
}

function showError(msg) {
  hide('reg-loading');
  hide('reg-content');
  if (msg) $('reg-error-msg').textContent = msg;
  show('reg-error');
}

function init() {
  if (booted) return;
  booted = true;
  loadEvent();
}

document.addEventListener('includes:ready', init);
if (document.documentElement.classList.contains('ready')) init();
