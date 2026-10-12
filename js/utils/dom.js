// js/utils/dom.js
// The `document.getElementById` shorthand and the element builder.
//
// `const $ = (id) => document.getElementById(id)` was declared in fifteen
// modules — fourteen under the name `$` and once, in admin/account.js, under
// the name `el`, which collided with the *other* helper in this file.
//
// One caveat worth knowing before you delete a local copy: js/main.js loads
// jQuery from a CDN on every public page, so `window.$` is a live global. A
// public module that drops its own `const $` without adding this import will
// silently resolve `$` to jQuery — which returns an empty *truthy* collection
// for a bare id, so every `if (el)` guard still passes and the page renders
// blank with nothing in the console. Always add the import in the same edit.
//
// Usage:
//   import { $, show, hide, setText, el } from '/js/utils/dom.js';
//   $('eventTitle')                       // bare id — no '#'
//   el('p', { class: 'note' }, ['Hola'])  // built element

/** `document.getElementById`. Takes a bare id — no `#` prefix. */
export const $ = (id) => document.getElementById(id);

/** Clear an inline `display`, reverting the element to its stylesheet value. */
export function show(id) {
  const node = $(id);
  if (node) node.style.display = '';
}

/** Hide via inline `display: none`. No-op when the element is missing. */
export function hide(id) {
  const node = $(id);
  if (node) node.style.display = 'none';
}

/**
 * Set `textContent`. Null-safe on the *element*, not on the value: passing
 * `undefined` writes the literal string "undefined", which is the behavior the
 * existing call sites were written against.
 */
export function setText(id, text) {
  const node = $(id);
  if (node) node.textContent = text;
}

/**
 * Build an element.
 *   - `class` sets className; `html` sets innerHTML (trusted markup only).
 *   - a key starting with `on` becomes an addEventListener.
 *   - `null`/`false` attribute values and children are skipped, so
 *     `cond && el(...)` works inline.
 *   - `true` renders a bare boolean attribute.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {Array<Node|string>|Node|string} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class')           node.className = v;
    else if (k === 'html')       node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else                         node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
