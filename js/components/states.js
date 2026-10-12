// js/components/states.js
// The three states every async view owes the user: loading, empty, error.
//
// CLAUDE.md requires all three on every async view and pins the exact class
// names, but there was no helper — so the markup was retyped by hand ~80 times
// and had already drifted (different wrappers, different icons, a few missing
// the icon entirely). More seriously, five error boxes interpolated a raw
// `error.message` straight into innerHTML: Postgres and the YouTube Data API
// both echo caller-supplied text back inside their messages, so those were live
// injection points. Everything here escapes by default.
//
// This lives in components/ rather than utils/ on purpose: it hardcodes Font
// Awesome class names and ships Spanish user-facing copy, neither of which
// belongs in a domain-free primitive. Its CSS is css/components/states.css.
//
// Usage:
//   import { loadingHtml, emptyHtml, errorHtml } from '/js/components/states.js';
//   import { render } from '/js/utils/render.js';
//
//   render(list, loadingHtml());
//   render(list, emptyHtml('fa-calendar-check', 'No hay eventos próximos.'));
//   render(list, errorHtml(error.message, { prefix: 'No se pudieron cargar los eventos' }));
//
// The message slot escapes plain strings. To pass markup — a CTA link, a
// <strong> — build it with html``, which is already trusted and passes through:
//   emptyHtml('fa-images', html`<a class="ird-btn" href="/galeria/">Ver galería</a>`);
// (raw() is for a trusted string you did NOT build with html``.)

import { html } from '/js/utils/escape.js';

/**
 * Spinner box shown while a view's first fetch is in flight.
 * @param {string} [label] Spanish, user-facing.
 * @returns {import('/js/utils/escape.js').SafeHtml}
 */
export function loadingHtml(label = 'Cargando...') {
  return html`<div class="loading"><i class="fas fa-spinner fa-spin"></i> ${label}</div>`;
}

/**
 * "Nothing here yet" panel. The icon varies by domain, so it is required
 * rather than defaulted — a generic icon on every empty view reads as a bug.
 * @param {string} icon Font Awesome name, e.g. 'fa-calendar-check'.
 * @param {string|import('/js/utils/escape.js').SafeHtml} message
 */
export function emptyHtml(icon, message) {
  return html`<div class="empty-state"><i class="fas ${icon}"></i><p>${message}</p></div>`;
}

/**
 * Error panel. `message` is escaped — never assume an API's error text is safe.
 *
 * Note on `fallback`: the call sites this replaces rendered `error.message`
 * unguarded, so an error without a `.message` printed the literal string
 * "undefined" to the user. That is never what anyone wanted, so a missing
 * message now renders the fallback instead. It is the one deliberate behavior
 * change in this module.
 *
 * @param {string} [message] Raw error text; escaped before rendering.
 * @param {{prefix?: string, fallback?: string}} [opts] `prefix` adds context
 *   ("No se pudieron cargar los eventos"); the message follows after a colon.
 */
export function errorHtml(message, { prefix = '', fallback = 'Ocurrió un error.' } = {}) {
  const detail = message || fallback;
  // Two branches rather than building the string first: interpolating `detail`
  // directly lets the html tag decide how to treat it, so a SafeHtml message
  // survives the prefix path instead of being stringified and re-escaped.
  return prefix
    ? html`<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${prefix}: ${detail}</p></div>`
    : html`<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${detail}</p></div>`;
}
