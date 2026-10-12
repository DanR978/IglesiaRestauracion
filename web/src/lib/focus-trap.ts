/* ============================================================================
 * web/src/lib/focus-trap.ts — a STACKED focus trap for overlays (S16)
 * ----------------------------------------------------------------------------
 * Legacy has no focus management at all: `openModal` only adds a class
 * (`js/pages/admin/ui.js:50`), so Tab walks straight out of an open modal into
 * the page behind it and focus never comes back to the trigger on close.
 * DESIGN-SYSTEM §6.2 makes "focus moves in / is trapped / returns" a hard
 * requirement for EVERY overlay, so the mechanism lives here rather than in
 * one component: Modal (S16) uses it, and ActionSheet (S17) and Lightbox (S20)
 * must use it too instead of re-implementing it.
 *
 * The traps form a STACK, and only the topmost one is live. That is what makes
 * a confirm-over-modal correct: while the confirm is up, Tab cycles inside the
 * confirm; when it closes, the modal underneath becomes live again. The same
 * stack answers "am I the overlay Escape should close?" (`isTopmostTrap`) —
 * without it, one Escape keypress would close every open overlay at once.
 *
 * Two listeners, installed once while any trap is open, both in the CAPTURE
 * phase so they run before anything inside the overlay:
 *   keydown — wraps Tab / Shift+Tab at the ends of the container.
 *   focusin — pulls focus back if it lands outside (a click on the page
 *             behind, or a browser control handing focus back to the document).
 *
 * Prerender-safe: with no `document` it returns an inert release function.
 *
 * Usage:
 *   import { trapFocus, isTopmostTrap } from '$lib/focus-trap';
 *   const release = trapFocus(dialogEl);   // in an $effect
 *   return release;                        // …and its cleanup
 * ========================================================================== */

/**
 * Anything the browser can put keyboard focus on. `[tabindex="-1"]` is excluded
 * on purpose: it is programmatically focusable (the dialog container itself is)
 * but is NOT part of the tab ring, so it must not be a wrap point.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const stack: HTMLElement[] = [];
let listening = false;

/**
 * Tab-reachable descendants, in document order.
 *
 * Filtering is attribute-based only — deliberately no geometry check: jsdom
 * reports every element as having no layout, so an `offsetParent`/
 * `getClientRects()` test would drop EVERY candidate and silently disable the
 * trap in the component tests.
 */
function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.closest('[hidden]') === null,
  );
}

function top(): HTMLElement | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const container = top();
  if (!container) return;

  const items = focusable(container);
  if (items.length === 0) {
    // An overlay with nothing to focus still must not leak the tab ring.
    event.preventDefault();
    container.focus();
    return;
  }

  const active = document.activeElement;
  const inside = active instanceof HTMLElement && container.contains(active);
  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function onFocusIn(event: FocusEvent): void {
  const container = top();
  if (!container) return;
  const target = event.target;
  if (target instanceof Node && container.contains(target)) return;
  container.focus();
}

/**
 * Make `container` the live focus trap and return the release. Nest freely —
 * releases may run in any order; each removes only its own entry.
 */
export function trapFocus(container: HTMLElement): () => void {
  if (typeof document === 'undefined') return () => {};

  stack.push(container);
  if (!listening) {
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('focusin', onFocusIn, true);
    listening = true;
  }

  let released = false;
  return function release(): void {
    if (released) return;
    released = true;
    const i = stack.lastIndexOf(container);
    if (i !== -1) stack.splice(i, 1);
    if (stack.length === 0 && listening) {
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      listening = false;
    }
  };
}

/**
 * True when `container` is the overlay on top. Escape must close only that one
 * — every open Modal hears the same window keydown.
 */
export function isTopmostTrap(container: HTMLElement): boolean {
  return top() === container;
}

/** How many traps are open. 0 means the page has its tab ring back. */
export function focusTrapDepth(): number {
  return stack.length;
}
