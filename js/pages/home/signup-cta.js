// js/pages/home/signup-cta.js
// ─────────────────────────────────────────────────────────────────────────────
// Homepage registration promo, near the top of the page.
//   • 1 open event  → a big featured "¡Regístrate ahora!" banner.
//   • 2+ open events → a "Inscripciones abiertas" heading + responsive grid of
//                      cards that wraps as more events are added.
//   • 0 open events  → the section stays hidden (zero footprint).
//
// "Open" = registration_open AND (no date OR date in the future). Soonest first.
// Admins control everything just by toggling each event's "Inscripciones
// abiertas" switch — no extra flag to manage.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';
import { esc } from '/js/utils/escape.js';

const TZ = 'America/New_York';
const MAX = 12;   // safety cap on how many cards we render

function fmtDateLong(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
    });
  } catch { return ''; }
}
function fmtDateShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es', {
      day: 'numeric', month: 'short', timeZone: TZ,
    });
  } catch { return ''; }
}
function eventUrl(ev) {
  return `/eventos/evento-especial.html?e=${encodeURIComponent(ev.slug)}`;
}

const ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>`;

// ── Single featured banner ───────────────────────────────────────────────────
function renderFeatured(ev) {
  const meta = [fmtDateLong(ev.event_at), ev.location].filter(Boolean).map(esc).join(' · ');
  return `
    <a class="home-signup__card" href="${eventUrl(ev)}" aria-label="Regístrate: ${esc(ev.title)}">
      ${ev.image_url ? `
        <div class="home-signup__media">
          <img src="${esc(ev.image_url)}" alt="" loading="lazy" decoding="async">
        </div>` : ''}
      <div class="home-signup__body">
        <span class="home-signup__kicker">
          <i class="fas fa-bullhorn" aria-hidden="true"></i> Inscripciones abiertas
        </span>
        <h2 class="home-signup__title" id="homeSignupTitle">${esc(ev.title)}</h2>
        ${meta ? `<p class="home-signup__meta">${meta}</p>` : ''}
        <span class="ird-btn home-signup__btn">¡Regístrate ahora!</span>
      </div>
    </a>`;
}

// ── Grid of cards (2+) ───────────────────────────────────────────────────────
function card(ev) {
  const date = fmtDateShort(ev.event_at);
  return `
    <a class="seh-card" href="${eventUrl(ev)}" aria-label="Regístrate: ${esc(ev.title)}">
      <div class="seh-card__media">
        ${ev.image_url
          ? `<img src="${esc(ev.image_url)}" alt="" loading="lazy" decoding="async">`
          : `<span class="seh-card__placeholder"><i class="fas fa-calendar-star" aria-hidden="true"></i></span>`}
      </div>
      <div class="seh-card__body">
        <h3 class="seh-card__title">${esc(ev.title)}</h3>
        <p class="seh-card__meta">
          ${date ? `<span><i class="fas fa-calendar" aria-hidden="true"></i> ${esc(date)}</span>` : ''}
          ${ev.location ? `<span><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(ev.location)}</span>` : ''}
        </p>
        <span class="seh-card__cta">Registrarse ${ARROW}</span>
      </div>
    </a>`;
}

function renderGrid(events) {
  return `
    <div class="home-signup__head">
      <span class="home-signup__eyebrow"><i class="fas fa-bullhorn" aria-hidden="true"></i> Inscripciones abiertas</span>
      <h2 class="home-signup__heading" id="homeSignupTitle">Eventos con inscripción</h2>
    </div>
    <div class="home-signup__grid">
      ${events.map(card).join('')}
    </div>`;
}

async function initSignupCta() {
  const section = document.getElementById('homeSignupSection');
  const root = document.getElementById('homeSignup');
  if (!section || !root || !sb) return;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from('special_events')
      .select('id,title,slug,image_url,event_at,location,registration_open')
      .eq('registration_open', true)
      .or(`event_at.gte.${nowIso},event_at.is.null`)
      .order('event_at', { ascending: true, nullsFirst: false })
      .limit(MAX);

    const events = data || [];
    if (error || !events.length) { section.hidden = true; return; }

    root.innerHTML = events.length === 1 ? renderFeatured(events[0]) : renderGrid(events);
    section.classList.toggle('home-signup--grid', events.length > 1);
    section.hidden = false;
  } catch (e) {
    console.warn('[home-signup]', e);
    section.hidden = true;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSignupCta);
} else {
  initSignupCta();
}
