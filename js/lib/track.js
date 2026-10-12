// js/lib/track.js
// ─────────────────────────────────────────────────────────────────────────────
// Record a conversion (a sign-up, a sent form…) in the first-party analytics.
//
// The collector itself is js/lib/analytics.js — a classic script in every
// public page's <head>. This only dispatches the DOM event it listens for, so
// a page module needs no import order with it, and on a page without the
// collector (admin, dev server) the call is a harmless no-op.
//
// Names are snake_case, ≤40 chars (the track function rejects anything else);
// they show up translated in the admin Analíticas tab (EVENT_LABELS there).
//
// Usage:
//   import { trackEvent } from '/js/lib/track.js';
//   trackEvent('newsletter_signup');
//   trackEvent('event_registration', slug);
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} name   snake_case event name.
 * @param {string} [label] Short, non-personal detail (a slug, a form name).
 *   Never pass a name, email, phone or free text a visitor typed.
 */
export function trackEvent(name, label = '') {
  document.dispatchEvent(new CustomEvent('ird:track', { detail: { name, label } }));
}
