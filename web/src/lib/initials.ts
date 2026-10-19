/* ============================================================================
 * web/src/lib/initials.ts — the one initials (monogram) algorithm (PR-C2)
 * ----------------------------------------------------------------------------
 * DESIGN-SYSTEM §4.1 Avatar: ONE initials algorithm for the sidebar footer,
 * the account hero and profile, the users list and the Actividad actor.
 * Legacy carried three diverging copies:
 *   · js/pages/admin/account.js + users.js — the first letter of the first two
 *     words, `'?'` when empty; "Pastor Raúl García" became "PR", and an emoji
 *     contributed half a surrogate pair.
 *   · js/utils/string.js `initials()` (2ced8ce) — moved into
 *     js/pages/lideres/index.js by 1e47036 with two review fixes, and that is
 *     the version production runs. THIS is its port:
 *       - first letters of the first and last words ("Ashley Navarro-Ortiz" → "AN");
 *       - LEADING titles skipped ("Pastor Raúl García Guerra" → "RG"), but a
 *         title-like surname stays ("Ana Pastor" → "AP");
 *       - words without a letter ignored ("🙏 Flor Alfaro 🙏" → "FA");
 *       - letters matched by Unicode property after NFC, so an accent or an
 *         emoji can't split a character;
 *       - '' when the name has no letter, so the caller can show a glyph.
 * tests/golden/initials.test.ts holds the port to the legacy function's output.
 *
 * Usage:
 *   import { initials } from '#lib/initials.js';
 *   initials('Pastor Raúl García Guerra')   // 'RG'
 *   initials(profile.display_name) || null  // null → render the fallback glyph
 * ========================================================================== */

/** Titles that open a name here. Only LEADING ones are skipped ("Pastor" is also a surname). */
const HONORIFICS: ReadonlySet<string> = new Set([
  'pastor',
  'pastora',
  'pr',
  'pra',
  'hno',
  'hna',
  'hermano',
  'hermana',
  'ev',
  'dr',
  'dra',
]);

const LETTER = /\p{L}/u;

function firstLetter(word: string): string {
  return word.match(LETTER)?.[0] ?? '';
}

/** Up to two uppercase letters for `name`; '' when it holds no letter. Never throws. */
export function initials(name: string | null | undefined): string {
  const words = String(name ?? '')
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .filter((word) => LETTER.test(word));

  // A title alone is still the name ("Pastor" → "P"): the last word is never skipped.
  let start = 0;
  while (
    start < words.length - 1 &&
    HONORIFICS.has(words[start].toLocaleLowerCase('es').replace(/\.$/, ''))
  ) {
    start++;
  }

  const used = words.slice(start);
  const first = used.length ? firstLetter(used[0]) : '';
  const last = used.length > 1 ? firstLetter(used[used.length - 1]) : '';
  return (first + last).toLocaleUpperCase('es');
}
