/* ============================================================================
 * web/src/lib/components/segmented-control.ts — the SegmentedControl contract (PR-C2, S21)
 * ----------------------------------------------------------------------------
 * The non-visual half of SegmentedControl.svelte: the option shape and the BEM
 * names. The control is a native radio group, so the browser owns the
 * keyboard (Arrow keys move AND select, Tab enters at the checked option) and
 * there is no key map to keep in sync here.
 *
 * Emitted names:
 *   ird-seg · is-disabled                              (the block)
 *   ird-seg__label · __group · __option · __input ·    (elements)
 *   __icon · __text
 *   is-checked                                         (on the chosen __option)
 *
 * Usage:
 *   import SegmentedControl from '#lib/components/SegmentedControl.svelte';
 *   import type { SegmentedOption } from '#lib/components/segmented-control.js';
 * ========================================================================== */

/** The BEM block every SegmentedControl emits. */
export const SEGMENTED_BLOCK = 'ird-seg';

export interface SegmentedOption {
  /** What `value` holds when this option is chosen. Unique within the control. */
  value: string;
  /** Visible text — also the radio's accessible name. */
  label: string;
  /** Font Awesome name (no `fa-`), decorative beside the text. */
  icon?: string;
}
