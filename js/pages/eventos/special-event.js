// js/pages/eventos/special-event.js
// Public landing page for a registration-based special event.
// Reads ?e=<slug> (fallback ?id=<uuid>) from the URL, fetches the event from
// Supabase, fills the page, and wires the "Registrarse" button.
// Mirrors js/components/event-detail.js.

import { sb } from '/js/lib/supabase.js';
import { sanitizeHtml, htmlIsEmpty } from '/js/lib/sanitize-html.js';

const TZ = 'America/New_York';

// ── Helpers ──────────────────────────────────────────────
function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('es', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ,
    });
  } catch { return dateStr || ''; }
}
function formatTime(dateStr) {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
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
    let q = sb.from('special_events').select('*');
    q = slug ? q.eq('slug', slug) : q.eq('id', id);
    const { data, error } = await q.single();
    if (error || !data) { console.error('[special-event] fetch error:', error); return showError(); }
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

  // Hero image (fall back to the header's default hero)
  const heroImg = $('ed-hero-img');
  if (heroImg && ev.image_url) {
    heroImg.src = ev.image_url;
    heroImg.alt = ev.title || 'Evento';
  } else if (heroImg) {
    const fallback = $('header')?.getAttribute('data-hero');
    if (fallback) heroImg.src = fallback;
  }

  setText('event-title', ev.title || 'Evento');

  if (ev.event_at) {
    setText('event-date', formatDate(ev.event_at));
    show('event-date-row');
    const t = formatTime(ev.event_at);
    if (t) { setText('event-time', t); show('event-time-row'); }
  }
  if (ev.location) { setText('event-location', ev.location); show('event-location-row'); }

  if (ev.description && !htmlIsEmpty(ev.description)) {
    $('event-description').innerHTML = sanitizeHtml(ev.description);
    show('event-description-section');
  }
  if (ev.information && !htmlIsEmpty(ev.information)) {
    $('event-information').innerHTML = sanitizeHtml(ev.information);
    show('event-information-section');
  }

  // Register buttons (two — above and below the details)
  const regUrl = `/eventos/registro.html?e=${encodeURIComponent(ev.slug)}`;
  const btns = [$('event-register-btn'), $('event-register-btn-2')].filter(Boolean);
  if (ev.registration_open) {
    show('event-tag');
    btns.forEach(b => { b.href = regUrl; b.style.display = ''; });
  } else {
    hide('event-tag');
    btns.forEach(b => b.style.display = 'none');
    show('event-register-closed');
  }

  if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());
}

// ── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const heroImg = $('ed-hero-img');
  const fallback = $('header')?.getAttribute('data-hero');
  if (heroImg && fallback && !heroImg.src) heroImg.src = fallback;
});

document.addEventListener('includes:ready', loadEvent);
if (document.documentElement.classList.contains('ready')) loadEvent();
