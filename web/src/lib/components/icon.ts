/* ============================================================================
 * web/src/lib/components/icon.ts — the Icon contract + the SVG sprite (S13)
 * ----------------------------------------------------------------------------
 * The non-visual half of Icon.svelte: the glyph-source union, the closed set
 * of sprite ids, the Font Awesome pin, and `injectSprite()` — the one-time
 * sprite injection that replaces legacy js/utils/load-icons.js.
 *
 * Two glyph sources, one component:
 *   • Font Awesome 6.5.0 (`fas` / `far` / `fab`) — loaded as a pinned,
 *     SRI-checked CDN stylesheet in src/app.html, the SAME URL the legacy
 *     pages already load, so a visitor crossing legacy ↔ /app pays for it
 *     once. `FA_CSS_URL` / `FA_CSS_INTEGRITY` are the contract
 *     tests/unit/icon.test.ts holds app.html to. Never add a second icon set
 *     (DESIGN-SYSTEM §4.1).
 *   • The trusted static sprite (`sprite`) — src/lib/assets/icons.svg, a
 *     verbatim copy of resources/icons/icons.svg, bundled as a string
 *     (`?raw`) and written into one hidden holder on first use. The sprite is
 *     the ONE `innerHTML` carve-out D-005 grants; nothing untrusted can reach
 *     it because `name` must be one of SPRITE_ICONS (a literal union) and a
 *     runtime check refuses anything else.
 *
 * Usage:
 *   <Icon name="church" />                          decorative solid glyph
 *   <Icon set="far" name="clock" label="Hora" />    meaningful → role=img + aria-label
 *   <Icon set="sprite" name="logo-church" class="footer__logo" />
 *   import { injectSprite, SPRITE_ICONS, isSpriteIcon } from '$lib/components/icon';
 * ========================================================================== */
import spriteMarkup from '$lib/assets/icons.svg?raw';

/** Where a glyph comes from. `fas`/`far`/`fab` are the Font Awesome 6 style prefixes. */
export type IconSet = 'fas' | 'far' | 'fab' | 'sprite';

export const ICON_SETS: readonly IconSet[] = ['fas', 'far', 'fab', 'sprite'];

/**
 * The `<symbol id>`s the sprite ships — the ONLY values `set="sprite"` accepts.
 * tests/unit/icon.test.ts asserts this list equals the ids in icons.svg, so
 * adding a symbol means adding it here (and nowhere else).
 */
export const SPRITE_ICONS = [
  'icon-calendar',
  'icon-clock',
  'icon-location',
  'logo-church',
  'floating-envelope',
] as const;

export type SpriteIcon = (typeof SPRITE_ICONS)[number];

/** id of the hidden element the sprite is injected into (legacy: the same id). */
export const SPRITE_HOLDER_ID = 'svg-sprite-holder';

/** Font Awesome pin — the legacy `<link>` (scripts/build-heads.mjs:208), verbatim. */
export const FA_VERSION = '6.5.0';
export const FA_CSS_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FA_VERSION}/css/all.min.css`;
export const FA_CSS_INTEGRITY =
  'sha512-Avb2QiuDEEvB4bZJYdft2mNjVShBftLdPG8FJ0V7irTLQ8Uo0qcPxh4Plq7G5tGm0rU+1SPhVotteLpBERwTkw==';

// Font Awesome names are lower-case kebab tokens (`map-marker-alt`, `circle-check`).
// Anything else is refused so a value can never smuggle a second class onto the element.
const FA_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSpriteIcon(name: unknown): name is SpriteIcon {
  return typeof name === 'string' && (SPRITE_ICONS as readonly string[]).includes(name);
}

export function isFaIconName(name: unknown): boolean {
  return typeof name === 'string' && FA_NAME_RE.test(name);
}

/** Whether `name` is renderable for `set` — the guard Icon.svelte applies before emitting markup. */
export function isValidIcon(set: IconSet, name: unknown): boolean {
  return set === 'sprite' ? isSpriteIcon(name) : isFaIconName(name);
}

let holder: HTMLElement | undefined;

/**
 * Inject the sprite into the document exactly once and return its holder.
 * Idempotent across components, HMR and tests: the cached element wins while
 * it is still connected; an existing holder (e.g. a layout that server-rendered
 * the sprite) is adopted rather than duplicated. No-op without a document
 * (prerender). Also re-points any `<use href="#…">` already in the DOM — the
 * legacy Safari repaint nudge, kept for hydrated markup that predates the holder.
 */
export function injectSprite(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  if (holder?.isConnected) return holder;

  const existing = document.getElementById(SPRITE_HOLDER_ID);
  if (existing) {
    holder = existing;
    return holder;
  }

  const el = document.createElement('div');
  el.id = SPRITE_HOLDER_ID;
  el.setAttribute('aria-hidden', 'true');
  // Trusted static asset, bundled at build time — the D-005 sprite carve-out.
  el.innerHTML = spriteMarkup;
  const root = el.querySelector('svg');
  if (root && !root.getAttribute('xmlns:xlink')) {
    root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  document.body.prepend(el);
  holder = el;

  for (const use of document.querySelectorAll('use[href^="#"]')) {
    const ref = use.getAttribute('href');
    if (!ref) continue;
    use.removeAttribute('href');
    use.setAttribute('href', ref);
  }
  return holder;
}
