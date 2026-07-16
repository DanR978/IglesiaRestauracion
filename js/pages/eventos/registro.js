// js/pages/eventos/registro.js
// Standalone registration page (?e=<slug> | ?id=<uuid>). Loads the event, then
// opens the step-by-step registration wizard. Behind the wizard sits a focused
// card with the event title + a button to (re)open it — so direct links and
// closing the wizard both leave a sensible page.

import { openRegistrationWizard } from '/js/pages/eventos/registro-wizard.js';
import { fetchEventBy, isRegistrationOpen } from '/js/lib/special-events.js';

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
    const data = await fetchEventBy({ slug, id });
    if (!data) return showError();
    // `registration_open` alone, matching the `event_reg_insert` RLS policy —
    // no date check, so an admin re-opening an ended event really re-opens it.
    if (!isRegistrationOpen(data)) return showError('Las inscripciones se han cerrado. Por favor, contacta al pastor para recibir ayuda.');

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
