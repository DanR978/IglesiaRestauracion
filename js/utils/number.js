// js/utils/number.js
// Number and currency formatting.
//
// The USD formatter below was defined three times, byte-identically, in
// treasury-tab.js, project-treasury.js and report-builder.js, and inlined a
// fourth time in form-wizard.js. Every treasury figure on screen and in every
// generated PDF goes through it, so the three copies drifting apart would have
// meant the same amount rendering differently in the report than in the table
// it was built from.
//
// Usage:
//   import { money } from '/js/utils/number.js';
//   money(1234.5)   // "$1,234.50"

/**
 * Format a value as US dollars. Non-numeric and nullish input becomes $0.00,
 * which is what every existing call site relied on (`Number(n) || 0`).
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function money(n) {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
