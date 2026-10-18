// js/utils/string.js
// Small string primitives.
//
// `capitalize` existed four times: three copies returned their input unchanged
// on falsy/non-string input, while discipleship-tab.js's coerced with
// `String(s ?? '')`. The coercing version is the one kept here because it is
// the only one that can't throw — but note it is *more permissive* than the
// three it replaces, so a non-string reaching it now returns a string instead
// of raising a TypeError. All existing call sites pass a string or nothing.
//
// Deliberately NOT here: `slugify`. js/lib/qr.js owns the event-slug rules, and
// its output is baked into printed QR codes and shared URLs — changing it would
// 404 links already in circulation. Leave that one where it is.
//
// Usage:
//   import { capitalize, initials } from '/js/utils/string.js';
//   capitalize('jueves')                    // "Jueves"
//   initials('Pastor Raúl García Guerra')   // "RG"

/** Uppercase the first character. Nullish and empty input return ''. */
export function capitalize(s) {
  const str = String(s ?? '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// Titles that precede names on this site; a monogram of "Pastor Raúl…" is "R…", not "P…".
const HONORIFICS = new Set(['pastor', 'pastora', 'pr', 'pra', 'hno', 'hna', 'hermano', 'hermana', 'ev', 'dr', 'dra']);

/**
 * Two-letter monogram: the first letters of the first and last words, minus
 * honorifics ("Pastor Raúl García Guerra" → "RG", "Ashley Navarro-Ortiz" → "AN").
 * Letters are matched by Unicode property, so accents and emoji can't split a
 * character. Returns '' when the name has no letters, so callers can fall back.
 * (admin/account.js and admin/users.js keep a simpler first-two-words copy for
 * account avatars.)
 */
export function initials(name) {
  const words = String(name ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const named = words.filter(w => !HONORIFICS.has(w.toLocaleLowerCase('es').replace(/\.$/, '')));
  const use = named.length ? named : words;
  const letter = (w) => (w.match(/\p{L}/u) || [''])[0];
  const first = use.length ? letter(use[0]) : '';
  const last = use.length > 1 ? letter(use[use.length - 1]) : '';
  return (first + last).toLocaleUpperCase('es');
}
