/* ============================================================================
 * web/src/lib/components/icon-button.ts — the IconButton contract (PR-C2, S14)
 * ----------------------------------------------------------------------------
 * The non-visual half of IconButton.svelte: variants, sizes, the BEM block and
 * the name check. One component retires the two near-identical legacy names
 * `.icon-btn__admin` and `.adm-icon-btn`, and every `title=`-only icon control
 * (`.dz-ic`, `.dz-mini`), which screen readers and touch users never get a
 * name from (DESIGN-SYSTEM §4.1, PORT-DEBT S13).
 *
 * THE NAME IS REQUIRED. `label` is a non-optional string in the props, it is
 * rendered as aria-label, and a blank one is reported with console.warn. There
 * is no title= tooltip: it is invisible on touch and to most assistive tech,
 * and the house controls (Modal ×, Toast ×) carry none.
 *
 * Variants (the hover tints; none of them is hover-only — the glyph is always
 * visible and the hit area is always the full square):
 *   ghost   no fill, inherits the ink around it — top-bar chrome on the dark
 *           bar, a dismiss × inside an Alert, inline row actions
 *   subtle  a neutral tint at rest, muted glyph — toolbars, row kebabs
 *   danger  the AA red ink — a destructive row action (pair it with a confirm)
 *
 * Emitted names:
 *   ird-icon-btn · ird-icon-btn--{ghost|subtle|danger} · ird-icon-btn--{sm|md}
 *   ird-icon-btn--touch · is-loading · is-disabled · is-pressed
 *   ird-icon-btn__icon · ird-icon-btn__spinner
 *
 * Usage:
 *   import IconButton from '#lib/components/IconButton.svelte';
 *   <IconButton icon="xmark" label="Cerrar aviso" onclick={dismiss} />
 *   <IconButton icon="bars" label="Abrir menú" touch aria-expanded={open} aria-controls={navId} />
 *   <IconButton icon="bold" label="Negrita" variant="subtle" pressed={bold} onclick={toggle} />
 * ========================================================================== */

export type IconButtonVariant = 'ghost' | 'subtle' | 'danger';

export const ICON_BUTTON_VARIANTS: readonly IconButtonVariant[] = ['ghost', 'subtle', 'danger'];

/** `sm` = 32px (dense rows), `md` = 40px. Both clear WCAG 2.5.8's 24px minimum. */
export type IconButtonSize = 'sm' | 'md';

export const ICON_BUTTON_SIZES: readonly IconButtonSize[] = ['sm', 'md'];

/** The visual square per size, in CSS px (the stylesheet states the same in rem). */
export const ICON_BUTTON_PX: Readonly<Record<IconButtonSize, number>> = { sm: 32, md: 40 };

/** The hit area `touch` guarantees, in CSS px: primary / touch controls (visual brief). */
export const ICON_BUTTON_TOUCH_PX = 44;

/** The BEM block every IconButton emits. */
export const ICON_BUTTON_BLOCK = 'ird-icon-btn';

/** Whether `label` can name a control: a string with something other than whitespace. */
export function hasAccessibleName(label: unknown): label is string {
  return typeof label === 'string' && label.trim() !== '';
}
