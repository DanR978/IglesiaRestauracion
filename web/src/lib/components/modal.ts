/* ============================================================================
 * web/src/lib/components/modal.ts — the Modal contract (S16)
 * ----------------------------------------------------------------------------
 * The non-visual half of Modal.svelte: the variant union, the BEM block and
 * the two Spanish strings the component renders itself. Kept out of the
 * component so a consumer can type a prop (`variant: ModalVariant`) or iterate
 * every variant (the /kit/ showcase, the tests) without importing the
 * component — the same split Button/Card use.
 *
 * ONE modal replaces the THREE legacy systems: `.modal-backdrop`/`.modal`
 * (css/pages/admin/modal.css), the designer `.dz-modal`, and
 * `.wizard-backdrop`/`.wizard` (css/pages/admin/wizard.css).
 *
 * Emitted names:
 *   ird-modal · ird-modal--{variant}                      (the backdrop/block)
 *   ird-modal__dialog · __header · __title · __close ·
 *   __body · __error · __footer                           (elements)
 *   ird-modal__spacer                                     (footer utility,
 *                                                          used by consumers)
 *
 * Usage:
 *   import Modal from '$lib/components/Modal.svelte';
 *   import { MODAL_VARIANTS, type ModalVariant } from '$lib/components/modal';
 * ========================================================================== */

/**
 * Panel width, and nothing else — colour and chrome are identical across all
 * four (DESIGN-SYSTEM §4.2).
 *   standard  ~500px  the default: forms, detail panels
 *   wide      ~760px  tables and designer tools (retires `.dz-modal--wide`)
 *   confirm   ~360px  ConfirmDialog; ALSO the one variant that stacks above an
 *                     open modal (legacy `#confirmModal`'s z-index bump)
 *   tool      ~420px  designer property / layer docks
 */
export type ModalVariant = 'standard' | 'wide' | 'confirm' | 'tool';

export const MODAL_VARIANTS: readonly ModalVariant[] = ['standard', 'wide', 'confirm', 'tool'];

/** The BEM block every Modal emits (the backdrop element). */
export const MODAL_BLOCK = 'ird-modal';

/**
 * Footer utility class. Put it on an empty element between two groups of
 * actions to push them apart — it replaces the raw `style="flex:1"` span the
 * legacy footers used (DESIGN-SYSTEM §4.2: "a footer spacer utility").
 */
export const MODAL_SPACER_CLASS = `${MODAL_BLOCK}__spacer`;

/** Accessible name of the header × button. */
export const MODAL_CLOSE_LABEL = 'Cerrar';
