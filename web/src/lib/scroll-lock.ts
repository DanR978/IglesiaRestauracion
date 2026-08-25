/* ============================================================================
 * web/src/lib/scroll-lock.ts — reference-counted body scroll lock (S21)
 * ----------------------------------------------------------------------------
 * DESIGN-SYSTEM §4.2 / §6.2: an overlay must SAVE and RESTORE the previous
 * `document.body.style.overflow`, and the lock must be REFERENCE COUNTED. The
 * legacy sets `overflow:'hidden'` on open and hard-clears it to `''` on close
 * in `ui.js` openModal/closeModal, `form-wizard.js:57/226` and every bespoke
 * opener — so closing a confirm nested inside a modal unlocks the page while
 * the outer modal is still open, and any page-level overflow the app had set
 * is destroyed.
 *
 * ONE counter for the whole app: every overlay (FormWizard S21, Modal +
 * ConfirmDialog S16, ActionSheet S17, Lightbox S20) calls lockBodyScroll() on
 * open and the returned release() on close. Nothing else writes
 * document.body.style.overflow.
 *
 * SSR / prerender safe: with no `document` it is a no-op returning a no-op.
 *
 * Usage:
 *   import { lockBodyScroll } from '$lib/scroll-lock';
 *   $effect(() => { if (!open) return; return lockBodyScroll(); });
 * ========================================================================== */

let depth = 0;
/** The body overflow that was in place before the OUTERMOST lock. */
let restoreTo = '';

/**
 * Lock body scrolling and get back the release for THIS lock.
 * Releasing is idempotent — calling it twice does not unbalance the counter,
 * so a component may release in both a teardown and an explicit close.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (depth === 0) {
    restoreTo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  depth += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth -= 1;
    if (depth <= 0) {
      depth = 0;
      document.body.style.overflow = restoreTo;
      restoreTo = '';
    }
  };
}

/** How many overlays currently hold the lock. Tests and diagnostics only. */
export function bodyScrollLockDepth(): number {
  return depth;
}
