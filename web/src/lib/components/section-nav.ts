/* ============================================================================
 * web/src/lib/components/section-nav.ts — the SectionNav contract (PR-C2, S21/S45)
 * ----------------------------------------------------------------------------
 * The non-visual half of SectionNav.svelte: the item shape, how the mode is
 * chosen, the roving-focus key map, and the bar's scroll arithmetic — pure,
 * so the tests pin them without a layout engine.
 *
 * Two modes, chosen by the items:
 *   links    every item has an `href` (e.g. `?seccion=seguridad`, the URL
 *            state D-036 asks for): <a aria-current="page">, natural tab order.
 *   buttons  no hrefs: <button aria-current="true"> with ONE tab stop and
 *            Arrow keys / Home / End moving between them (roving tabindex).
 *
 * Emitted names:
 *   ird-snav · ird-snav__list · __entry · __item · __icon · __label
 *
 * Usage:
 *   import SectionNav from '#lib/components/SectionNav.svelte';
 *   import type { SectionNavItem } from '#lib/components/section-nav.js';
 * ========================================================================== */

/** The BEM block every SectionNav emits. */
export const SECTION_NAV_BLOCK = 'ird-snav';

export interface SectionNavItem {
  /** Stable key — `current` names the active item by it. */
  id: string;
  label: string;
  /** Font Awesome name (no `fa-`). Decorative: the label names the item. */
  icon?: string;
  /**
   * Link mode: where the item goes, already through resolve() or a query
   * string like `?seccion=perfil`. Give it on every item or on none.
   */
  href?: string;
}

export type SectionNavMode = 'links' | 'buttons';

/** Links when every item has an href; buttons otherwise (a mix is not a nav). */
export function sectionNavMode(items: readonly SectionNavItem[]): SectionNavMode {
  const allLinks =
    items.length > 0 && items.every((item) => typeof item.href === 'string' && item.href !== '');
  return allLinks ? 'links' : 'buttons';
}

/**
 * Where a key moves the focus in button mode, or null for keys the nav does
 * not handle. Both arrow axes work, because the list is vertical on a desktop
 * and a horizontal bar on a phone. It wraps at both ends.
 */
export function rovingTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * The bar's scrollLeft that centres an item (its offsetLeft and width),
 * clamped to what the bar can actually scroll.
 */
export function centredScrollLeft(
  itemStart: number,
  itemWidth: number,
  viewport: number,
  scrollWidth: number,
): number {
  const max = Math.max(0, scrollWidth - viewport);
  const target = itemStart - (viewport - itemWidth) / 2;
  return Math.min(Math.max(0, Math.round(target)), max);
}
