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
//   import { capitalize } from '/js/utils/string.js';
//   capitalize('jueves')   // "Jueves"

/** Uppercase the first character. Nullish and empty input return ''. */
export function capitalize(s) {
  const str = String(s ?? '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
