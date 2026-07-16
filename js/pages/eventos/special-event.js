// js/pages/eventos/special-event.js
// Public landing page for a registration-based special event — clean two-column
// layout (main: title/date/details · sidebar: image/location/register).
// Reads ?e=<slug> (fallback ?id=<uuid>), fetches the event, fills the page, and
// opens the step-by-step registration wizard from the single "Registrarse" CTA.

import { sanitizeHtml, htmlIsEmpty } from '/js/lib/sanitize-html.js';
import { openRegistrationWizard } from '/js/pages/eventos/registro-wizard.js';
import { celebrateQrLanding } from '/js/lib/celebrate.js';
import { fetchEventBy, isRegistrationOpen, eventPhase, eventAlbum, albumUrl } from '/js/lib/special-events.js';

const TZ = 'America/New_York';

// ── Helpers ──────────────────────────────────────────────
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function formatDate(iso) {
  try {
    return cap(new Date(iso).toLocaleDateString('es', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    }));
  } catch { return ''; }
}
function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
    });
  } catch { return ''; }
}

const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.style.display = ''; };
const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };
const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };

// ── Fetch & render ───────────────────────────────────────
async function loadEvent() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('e');
  const id   = params.get('id');
  if (!slug && !id) return showError();
  try {
    const data = await fetchEventBy({ slug, id });
    if (!data) return showError();
    renderEvent(data);
  } catch (err) {
    console.error('[special-event] error:', err);
    showError();
  }
}

function showError() {
  hide('event-loading');
  show('event-error');
}

function renderEvent(ev) {
  hide('event-loading');
  show('event-content');

  document.title = `${ev.title || 'Evento'} — Iglesia Restauración Divina`;
  setText('event-crumb', ev.title || 'Evento');
  setText('event-title', ev.title || 'Evento');

  // Date / time — one friendly line up top, plus the sidebar field
  if (ev.event_at) {
    const d = formatDate(ev.event_at);
    const t = formatTime(ev.event_at);
    setText('event-when', t ? `${d} · ${t}` : d);
    setText('event-date', d);
    if (t) setText('event-time', `· ${t}`);
    show('event-date-block');
  }

  // Location + directions
  if (ev.location) {
    setText('event-location', ev.location);
    const dir = $('event-directions');
    if (dir) dir.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`;
    show('event-location-row');
  }

  // Image (sidebar)
  if (ev.image_url) {
    const img = $('ed-hero-img');
    if (img) { img.src = ev.image_url; img.alt = ev.title || 'Evento'; }
    show('event-media');
  }

  // Details / Información (sanitized rich text)
  if (ev.description && !htmlIsEmpty(ev.description)) {
    $('event-description').innerHTML = sanitizeHtml(ev.description);
    show('event-description-section');
  }
  if (ev.information && !htmlIsEmpty(ev.information)) {
    $('event-information').innerHTML = sanitizeHtml(ev.information);
    show('event-information-section');
  }

  // Single register CTA → opens the step-by-step wizard.
  // `registration_open` is the whole gate, matching the `event_reg_insert` RLS
  // policy exactly. Deliberately no date check: a past event that an admin has
  // re-opened must really be open. A scheduled job clears the flag once the
  // event ends — see 20260716_event_lifecycle.sql.
  const phase = eventPhase(ev);
  const btn = $('event-register-btn');
  if (isRegistrationOpen(ev)) {
    // The event is under way but still taking walk-ups — say so, rather than
    // letting "Inscripciones abiertas" imply it hasn't started.
    if (phase === 'running') setText('event-action-note', 'En curso — aún puedes inscribirte');
    if (btn) {
      btn.href = `/eventos/registro.html?e=${encodeURIComponent(ev.slug)}`;  // no-JS fallback
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openRegistrationWizard({ eventId: ev.id, eventTitle: ev.title, eventSlug: ev.slug, eventDate: ev.event_at, eventLocation: ev.location });
      });
      // Welcome intro: blur the page, play fireworks, and glow the register
      // button so the eye lands on it — then fade smoothly back to normal.
      // Plays on every arrival while registration is open; respects
      // reduced-motion (no-op there).
      requestAnimationFrame(() => celebrateQrLanding({ button: btn }));
    }
  } else {
    hide('event-action');
    show('event-register-closed');
  }

  // Once the event is over and its album has photos, point people at them.
  const album = phase === 'ended' || phase === 'gone' ? eventAlbum(ev) : null;
  if (album) {
    const link = $('event-album-btn');
    if (link) link.href = albumUrl(album);
    show('event-album-action');
  }

  if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());
}

// ── Boot ─────────────────────────────────────────────────
document.addEventListener('includes:ready', loadEvent);
if (document.documentElement.classList.contains('ready')) loadEvent();
