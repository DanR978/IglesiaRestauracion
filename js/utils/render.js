// js/utils/render.js
// Minimal render helper for the admin's string-template views.
//
// The admin tabs build their UI as HTML strings and assign them to
// `container.innerHTML` on every load/refresh. Doing that unconditionally
// throws away scroll position and re-runs CSS entry animations even when the
// markup is identical. `render()` only touches the DOM when the content
// actually changed, and preserves the container's scroll position when it does.
//
// It is NOT a virtual DOM — for genuinely incremental updates (preserving
// focus inside inputs mid-edit) a keyed list diff would be needed. This is the
// safe, drop-in first step: pair it with the auto-escaping `html` template.

import { SafeHtml } from './escape.js';

/**
 * @param {Element|null} container
 * @param {SafeHtml|string} content  Output of html`` (preferred) or a trusted string.
 * @returns {boolean} true if the DOM was updated, false if it was already current
 *   (so callers can skip re-attaching listeners to nodes that didn't change).
 */
export function render(container, content) {
  if (!container) return false;
  const next = content instanceof SafeHtml ? content.value : String(content ?? '');
  if (container.__lastRenderedHtml === next) return false;   // unchanged → no DOM churn
  const scroll = container.scrollTop;
  container.innerHTML = next;
  container.__lastRenderedHtml = next;
  if (scroll) container.scrollTop = scroll;                  // keep the user's place
  return true;
}
