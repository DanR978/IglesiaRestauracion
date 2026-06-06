// js/utils/escape.js
// Single source of truth for HTML escaping + safe templating.
//
// Before this existed, ~26 modules each hand-rolled their own `esc` /
// `escapeHtml` / `escapeAttr`, and XSS was only prevented if every author
// remembered to wrap every interpolated DB/API value. The `html` tagged
// template inverts that: interpolations are escaped *by default*, and you
// must opt out explicitly with `raw()` for trusted markup.
//
// Usage:
//   import { html, esc, raw } from '/js/utils/escape.js';
//   el.innerHTML = html`<h3>${title}</h3>`;            // title auto-escaped
//   el.innerHTML = html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`;
//   el.innerHTML = html`<div>${raw(trustedSvgMarkup)}</div>`;  // opt out

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a value for safe insertion into HTML text or a quoted attribute. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

// Back-compat aliases for the names the old per-file helpers used, so call
// sites keep working when their local definition is swapped for an import.
export const escapeHtml = esc;
export const escapeAttr = esc;

/** Wrapper marking a string as already-safe HTML so `html` won't re-escape it. */
export class SafeHtml {
  constructor(value) { this.value = String(value ?? ''); }
  toString() { return this.value; }
}

/** Opt a trusted string out of escaping inside an `html` template. */
export function raw(value) {
  return new SafeHtml(value);
}

function serialize(v) {
  if (v == null) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(serialize).join('');
  return esc(v);
}

/**
 * Tagged template literal that escapes every interpolation by default.
 * Arrays are flattened/joined (so `.map(...)` works without `.join('')`).
 * Returns a SafeHtml — assign it directly to `.innerHTML` (it stringifies),
 * or nest it inside another `html` template without double-escaping.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += serialize(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}
