/* ============================================================================
 * web/src/lib/components/button.ts — the Button contract (S14)
 * ----------------------------------------------------------------------------
 * The non-visual half of Button.svelte: the variant and size unions plus the
 * BEM block the component emits. Kept out of the component so a consumer can
 * type a prop (`variant: ButtonVariant`) or iterate every variant (the /kit/
 * showcase, the tests) without importing the component.
 *
 * THE CLASS BLOCK IS `ird-btn`, on purpose (ROADMAP S14: "keep the .ird-btn
 * classes for coexistence"). CLAUDE.md §4 names `ird-` as the one global
 * button family, and markup lifted from a legacy page keeps reading the same.
 * The emitted names are:
 *   ird-btn · ird-btn--{variant} · ird-btn--sm | ird-btn--full
 *   is-loading · is-disabled          (state hooks; also drive the CSS)
 * The legacy public modifiers map onto the variants:
 *   .ird-btn--teal → variant="primary" · .ird-btn--orange → variant="secondary"
 *
 * Usage:
 *   import Button from '$lib/components/Button.svelte';
 *   import { BUTTON_VARIANTS, type ButtonVariant } from '$lib/components/button';
 * ========================================================================== */

/**
 * The button hierarchy (DESIGN-SYSTEM §4.1). `secondary` reads as brand gold on
 * the public site and slate inside `[data-surface="admin"]` — it is the same
 * token either way (D-014), so no component hardcodes a palette.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'danger',
  'ghost',
];

/**
 * `default` and `sm` size the control; `full` is the 100%-width form for a
 * stacked mobile action bar (legacy `.btn--full`). One axis, exactly as
 * DESIGN-SYSTEM §4.1 specifies — a small full-width button is not expressible.
 */
export type ButtonSize = 'default' | 'sm' | 'full';

export const BUTTON_SIZES: readonly ButtonSize[] = ['default', 'sm', 'full'];

/** The BEM block every Button emits. */
export const BUTTON_BLOCK = 'ird-btn';
