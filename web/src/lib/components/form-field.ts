/* ============================================================================
 * web/src/lib/components/form-field.ts — the FormField contract (PR-C2, S21)
 * ----------------------------------------------------------------------------
 * The non-visual half of FormField.svelte: the attribute bag a control
 * receives, the BEM names, the Spanish strings, and the id-list helper. Kept
 * out of the component (the Button/Modal split) so PasswordField, CodeInput
 * and the tests can use them without mounting anything.
 *
 * FormField owns the WIRING, the caller owns the CONTROL. The control arrives
 * as a snippet that receives `FormFieldControlAttrs`; spread them onto the
 * <input> / <select> / <textarea> and label `for`, aria-describedby (hint +
 * error), aria-invalid and aria-required are right by construction. That is
 * the gap S21 left: FormWizard's fields carry no aria-describedby or
 * aria-invalid (docs/architecture/design-system.md §6).
 *
 * Emitted names:
 *   ird-field · is-invalid · is-disabled                    (the block)
 *   ird-field__label · __required · __hint · __error        (elements)
 *   ird-field__control                                      (on the CALLER's
 *                                                            control, via attrs)
 *
 * Usage:
 *   import FormField from '#lib/components/FormField.svelte';
 *   import { joinIds, type FormFieldControlAttrs } from '#lib/components/form-field.js';
 * ========================================================================== */

/** The BEM block every FormField emits. */
export const FIELD_BLOCK = 'ird-field';

/**
 * The class FormField hands its control. FormField styles it (border, focus,
 * error, disabled, read-only), so any control that carries it looks like every
 * other field in the admin.
 */
export const FIELD_CONTROL_CLASS = `${FIELD_BLOCK}__control`;

/** Visible required marker — words, not a colour or a lone asterisk. */
export const REQUIRED_TEXT = '(obligatorio)';

/** Visually hidden prefix on an error, so a screen reader hears what it is. */
export const ERROR_PREFIX = 'Error:';

/**
 * What the `control` snippet receives. Spread it first, then add your own
 * attributes: `<input {...attrs} type="email" bind:value />`. To add a class,
 * keep FormField's: `class={[attrs.class, 'mine']}`.
 */
export interface FormFieldControlAttrs {
  /** Matches the label's `for`. */
  id: string;
  /** FIELD_CONTROL_CLASS — the shared control look. */
  class: string;
  /** Hint, extra ids, then the error — only the ones that exist. */
  'aria-describedby': string | undefined;
  /** `'true'` while an error is shown. */
  'aria-invalid': 'true' | undefined;
  /**
   * `'true'` for a required field. Deliberately not the native `required`
   * attribute: that would pop the browser's own validation bubble (in the
   * browser's language) over our inline Spanish error.
   */
  'aria-required': 'true' | undefined;
  disabled: boolean;
}

/**
 * A space-separated id list for aria-describedby, or `undefined` when there is
 * nothing to point at (an empty attribute is a dangling reference).
 */
export function joinIds(...ids: (string | false | null | undefined)[]): string | undefined {
  const list = ids
    .flatMap((id) => (typeof id === 'string' ? id.split(/\s+/) : []))
    .filter((id) => id !== '');
  return list.length > 0 ? [...new Set(list)].join(' ') : undefined;
}

/** True when `error` is something to show — a non-blank string. */
export function hasErrorText(error: string | null | undefined): error is string {
  return typeof error === 'string' && error.trim() !== '';
}
