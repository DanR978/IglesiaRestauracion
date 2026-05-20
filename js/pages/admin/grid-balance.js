// js/pages/admin/grid-balance.js
// ─────────────────────────────────────────────────────────────────────────────
// Makes a CSS grid fill its last row. When the final row has fewer items than
// there are columns, those items stretch to share the leftover space evenly —
// so you never get a lonely half-width card dangling at the bottom.
//
// Works at any viewport width and any item count. Pair it with a grid that uses
// `grid-template-columns: repeat(auto-fit, minmax(...))`.
// ─────────────────────────────────────────────────────────────────────────────

const _grids = new Set();

/** Balance one grid element right now. */
export function balance(el) {
  if (!el || !el.isConnected) return;

  const items = [...el.children];
  items.forEach(it => { it.style.gridColumn = ''; });   // reset any prior spans
  if (items.length < 2) return;

  // Count the grid's *real* columns (collapsed auto-fit tracks report as 0px).
  const cols = getComputedStyle(el).gridTemplateColumns
    .split(' ')
    .filter(track => parseFloat(track) > 0)
    .length;

  // One column, or everything already fits on a single row → nothing to do.
  if (cols < 2 || items.length <= cols) return;

  const remainder = items.length % cols;
  if (remainder === 0) return;                          // last row is full

  // Spread the short last row's items across all columns.
  const tail = items.slice(-remainder);
  const base = Math.floor(cols / remainder);
  let extra  = cols - base * remainder;
  tail.forEach(it => {
    it.style.gridColumn = `span ${base + (extra-- > 0 ? 1 : 0)}`;
  });
}

/** Register a grid: balance it now, and keep it balanced as the window resizes. */
export function autoBalance(el) {
  if (!el) return;
  _grids.add(el);
  balance(el);
}

let _raf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(() => _grids.forEach(balance));
});
