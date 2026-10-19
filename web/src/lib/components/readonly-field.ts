/* ============================================================================
 * web/src/lib/components/readonly-field.ts — the ReadonlyField contract (PR-C2, S45)
 * ----------------------------------------------------------------------------
 * The non-visual half of ReadonlyField.svelte: the BEM block, the Spanish
 * strings and the one rule for "there is no value".
 *
 * Emitted names:
 *   ird-readonly                                   (the <dl>)
 *   ird-readonly__label · __value · __note         (<dt> · <dd> · <dd>)
 *   is-missing                                     (on __value: the em dash)
 *
 * Usage:
 *   import ReadonlyField from '#lib/components/ReadonlyField.svelte';
 *   import { isMissingValue } from '#lib/components/readonly-field.js';
 * ========================================================================== */

/** The BEM block every ReadonlyField emits. */
export const READONLY_BLOCK = 'ird-readonly';

/** Drawn for a missing value; hidden from assistive tech, which hears MISSING_TEXT. */
export const MISSING_MARK = '—';

/** What a screen reader hears instead of the dash. */
export const MISSING_TEXT = 'Sin dato';

/** No value to show: null/undefined, or a string that is only whitespace. */
export function isMissingValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  return value.trim() === '';
}
