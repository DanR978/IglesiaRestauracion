// js/pages/home/signup-cta.js
// ─────────────────────────────────────────────────────────────────────────────
// Homepage event promo, near the top of the page.
//   • 1 live event  → a big featured banner.
//   • 2+ live events → a heading + responsive grid of cards that wraps as more
//                      events are added.
//   • 0 live events  → the section stays hidden (zero footprint).
//
// An event holds its spot through its whole life — Próximamente → En curso →
// Recién terminado — and drops off LINGER_DAYS after it ends. Once its gallery
// album has photos, the finished card links to them instead of to the event.
// All of those rules live in /js/lib/special-events.js; this file only renders.
// ─────────────────────────────────────────────────────────────────────────────

import { esc } from '/js/utils/escape.js';
import {
  fetchLiveEvents, eventPhase, eventStartsAt, isRegistrationOpen,
  eventAlbum, albumUrl, eventUrl, PHASE_LABEL, PHASE_ICON,
} from '/js/lib/special-events.js';

const TZ  = 'America/New_York';
const MAX = 12;   // safety cap on how many cards we render

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

function fmtDateLong(d) {
  try {
    return new Intl.DateTimeFormat('es', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
    }).format(d);
  } catch { return ''; }
}
function fmtDateShort(d) {
  try {
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: TZ }).format(d);
  } catch { return ''; }
}

// "sábado, 18 de julio" for a single day; "14 – 18 de julio" once it spans days.
function fmtRange(ev) {
  const s = eventStartsAt(ev);
  if (!s) return '';
  const e = ev?.ends_at ? new Date(ev.ends_at) : null;
  if (!e || Number.isNaN(e.getTime()) || dayKey(s) === dayKey(e)) return fmtDateLong(s);
  const sameMonth = dayKey(s).slice(0, 7) === dayKey(e).slice(0, 7);
  const from = new Intl.DateTimeFormat('es', {
    day: 'numeric', ...(sameMonth ? {} : { month: 'long' }), timeZone: TZ,
  }).format(s);
  const to = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', timeZone: TZ }).format(e);
  return `${from} – ${to}`;
}

// What the badge says, and where the card goes. Registration state and phase are
// independent: an event can be running with sign-ups still open (walk-ups), or
// upcoming with sign-ups not yet open.
function kicker(ev, phase) {
  if (phase === 'ended')   return { icon: PHASE_ICON.ended, text: PHASE_LABEL.ended };
  if (phase === 'running') {
    return { icon: PHASE_ICON.running, live: true,
             text: isRegistrationOpen(ev) ? 'En curso — aún puedes inscribirte' : PHASE_LABEL.running };
  }
  return isRegistrationOpen(ev)
    ? { icon: 'fa-bullhorn',      text: 'Inscripciones abiertas' }
    : { icon: PHASE_ICON.upcoming, text: PHASE_LABEL.upcoming };
}

function cta(ev, phase) {
  const album = phase === 'ended' ? eventAlbum(ev) : null;
  if (album) return { href: albumUrl(album), label: 'Ver fotos', icon: 'fa-images' };
  if (isRegistrationOpen(ev)) return { href: eventUrl(ev), label: '¡Regístrate ahora!' };
  return { href: eventUrl(ev), label: 'Ver detalles' };
}

const ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>`;

function badgeHtml(k, cls) {
  return `<span class="${cls}">
      ${k.live ? '<span class="ev-live-dot" aria-hidden="true"></span>' : `<i class="fas ${k.icon}" aria-hidden="true"></i>`}
      ${esc(k.text)}
    </span>`;
}

// ── Single featured banner ───────────────────────────────────────────────────
function renderFeatured(ev) {
  const phase = eventPhase(ev);
  const k     = kicker(ev, phase);
  const c     = cta(ev, phase);
  const meta  = [fmtRange(ev), ev.location].filter(Boolean).map(esc).join(' · ');
  return `
    <a class="home-signup__card" href="${esc(c.href)}" aria-label="${esc(`${k.text}: ${ev.title}`)}">
      ${ev.image_url ? `
        <div class="home-signup__media">
          <img src="${esc(ev.image_url)}" alt="" loading="lazy" decoding="async">
        </div>` : ''}
      <div class="home-signup__body">
        ${badgeHtml(k, 'home-signup__kicker')}
        <h2 class="home-signup__title" id="homeSignupTitle">${esc(ev.title)}</h2>
        ${meta ? `<p class="home-signup__meta">${meta}</p>` : ''}
        <span class="ird-btn home-signup__btn">
          ${c.icon ? `<i class="fas ${c.icon}" aria-hidden="true"></i> ` : ''}${esc(c.label)}
        </span>
      </div>
    </a>`;
}

// ── Grid of cards (2+) ───────────────────────────────────────────────────────
function card(ev) {
  const phase = eventPhase(ev);
  const k     = kicker(ev, phase);
  const c     = cta(ev, phase);
  const date  = fmtRange(ev);   // '' for a dateless event — show no date rather than invent one
  return `
    <a class="seh-card" href="${esc(c.href)}" aria-label="${esc(`${k.text}: ${ev.title}`)}">
      <div class="seh-card__media">
        ${ev.image_url
          ? `<img src="${esc(ev.image_url)}" alt="" loading="lazy" decoding="async">`
          : `<span class="seh-card__placeholder"><i class="fas fa-calendar-star" aria-hidden="true"></i></span>`}
        ${badgeHtml(k, `seh-card__phase seh-card__phase--${phase}`)}
      </div>
      <div class="seh-card__body">
        <h3 class="seh-card__title">${esc(ev.title)}</h3>
        <p class="seh-card__meta">
          ${date ? `<span><i class="fas fa-calendar" aria-hidden="true"></i> ${esc(date)}</span>` : ''}
          ${ev.location ? `<span><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(ev.location)}</span>` : ''}
        </p>
        <span class="seh-card__cta">${esc(c.label)} ${ARROW}</span>
      </div>
    </a>`;
}

function renderGrid(events) {
  // Say what's actually true of the set, rather than always promising sign-ups.
  const anyOpen = events.some(isRegistrationOpen);
  return `
    <div class="home-signup__head">
      <span class="home-signup__eyebrow">
        <i class="fas ${anyOpen ? 'fa-bullhorn' : 'fa-calendar-star'}" aria-hidden="true"></i>
        ${anyOpen ? 'Inscripciones abiertas' : 'Nuestros eventos'}
      </span>
      <h2 class="home-signup__heading" id="homeSignupTitle">Eventos con inscripción</h2>
    </div>
    <div class="home-signup__grid">
      ${events.map(card).join('')}
    </div>`;
}

async function initSignupCta() {
  const section = document.getElementById('homeSignupSection');
  const root = document.getElementById('homeSignup');
  if (!section || !root) return;
  try {
    const events = await fetchLiveEvents({ limit: MAX });
    if (!events.length) { section.hidden = true; return; }

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
