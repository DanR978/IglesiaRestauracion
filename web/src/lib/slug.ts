/* ============================================================================
 * web/src/lib/slug.ts — URL slug primitive (S22)
 * ----------------------------------------------------------------------------
 * The one slugifier both gallery albums and discipleship groups used in legacy
 * (`js/lib/gallery.js` slugify + the inline copy in `discipleship.js`
 * upsertGroup) — byte-identical, so existing slugs keep resolving.
 *
 * Usage:
 *   import { slugify } from '$lib/slug';
 *   slugify('Noche de Oración — ¡Gloria!') // "noche-de-oracion-gloria"
 * ========================================================================== */

/** Lower-case, ASCII-fold, hyphenate, trim, and cap at 80 chars. */
export function slugify(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}
