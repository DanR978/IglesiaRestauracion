// /js/components/event-detail.js
// Detail page for a regular special event (events table). Reads ?id=<uuid>,
// fetches the event, and fills the clean two-column layout (same as the EVB /
// registration event page) — main: title/date/details · sidebar: image,
// location + directions, and "Agregar al calendario".

import { sb } from '/js/lib/supabase.js';
import { renderRichText, htmlIsEmpty } from '/js/lib/sanitize-html.js';
import { buildGoogleCalUrl, downloadICS } from '/js/utils/calendar.js';
import { isIOS } from '/js/utils/detect-device.js';

const TZ = 'America/New_York';

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
function timeRange(startsAt, endsAt) {
  const s = formatTime(startsAt);
  if (!endsAt) return s;
  const e = formatTime(endsAt);
  return e ? `${s} – ${e}` : s;
}

const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.style.display = ''; };
const hide = (id) => { const el = $(id); if (el) el.style.display = 'none'; };
const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };

async function loadEvent() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return showError();
  try {
    const { data, error } = await sb.from('events').select('*').eq('id', id).single();
    if (error || !data) { console.error('[event-detail] fetch:', error); return showError(); }
    renderEvent(data);
  } catch (err) {
    console.error('[event-detail] error:', err);
    showError();
  }
}

function showError() { hide('event-loading'); show('event-error'); }

function renderEvent(ev) {
  hide('event-loading');
  show('event-content');

  document.title = `${ev.title || 'Evento'} — Iglesia Restauración Divina`;
  setText('event-crumb', ev.title || 'Evento');
  setText('event-title', ev.title || 'Evento');

  if (ev.starts_at) {
    const d = formatDate(ev.starts_at);
    const t = timeRange(ev.starts_at, ev.ends_at);
    setText('event-when', t ? `${d} · ${t}` : d);
    setText('event-date', d);
    if (t) setText('event-time', `· ${t}`);
    show('event-date-block');
  }

  if (ev.location) {
    setText('event-location', ev.location);
    const dir = $('event-directions');
    if (dir) dir.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`;
    show('event-location-row');
  }

  if (ev.image_url) {
    const img = $('ed-hero-img');
    if (img) { img.src = ev.image_url; img.alt = ev.title || 'Evento'; }
    show('event-media');
  }

  if (ev.description && !htmlIsEmpty(ev.description)) {
    $('event-description').innerHTML = renderRichText(ev.description);
    show('event-description-section');
  }

  if (ev.organizer_name || ev.organizer_email) {
    if (ev.organizer_name) setText('event-organizer-name', ev.organizer_name);
    const em = $('event-organizer-email');
    if (em && ev.organizer_email) { em.textContent = ev.organizer_email; em.href = `mailto:${ev.organizer_email}`; }
    show('event-organizer-section');
  }

  // Add to calendar — native .ics on iOS, Google Calendar elsewhere.
  const calBtn = $('event-calendar-btn');
  if (calBtn) {
    calBtn.href = buildGoogleCalUrl(ev);
    if (isIOS()) {
      calBtn.removeAttribute('target');
      calBtn.addEventListener('click', (e) => { e.preventDefault(); downloadICS(ev); });
    }
  }

  if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());
}

document.addEventListener('includes:ready', loadEvent);
if (document.documentElement.classList.contains('ready')) loadEvent();
