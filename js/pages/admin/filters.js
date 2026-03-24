// js/pages/admin/filters.js
// Ministry filter — shared between Upcoming, Past, and Calendar tabs.

import {
  ministries, selectedMinistries, isAdmin,
} from './state.js';

// After each filter change, callers register their re-render functions here.
const _listeners = [];
export function onFilterChange(fn) { _listeners.push(fn); }
function _notify() { _listeners.forEach(fn => fn()); }

// ─── Build checkboxes in both filter panels ───────────────────────────────────
export function buildFilterChecks() {
  if (!isAdmin()) return;

  ['filterBarWrap', 'filterPanel', 'calFilterBarWrap', 'calFilterPanel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  const html = ministries.map(m => `
    <label class="filter-check" data-id="${m.id}">
      <input type="checkbox" value="${m.id}" checked>
      <span class="filter-check__dot" style="background:${m.color}"></span>
      <span>${m.name}</span>
    </label>`).join('');

  document.getElementById('filterChecks').innerHTML    = html;
  document.getElementById('calFilterChecks').innerHTML = html;

  document.querySelectorAll(
    '#filterChecks input[type=checkbox], #calFilterChecks input[type=checkbox]'
  ).forEach(cb => cb.addEventListener('change', _handleChange));
}

function _handleChange(e) {
  const val     = e.target.value;
  const checked = e.target.checked;

  // Keep both panels in sync
  document.querySelectorAll(
    `#filterChecks input[value="${val}"], #calFilterChecks input[value="${val}"]`
  ).forEach(cb => cb.checked = checked);

  // Rebuild selectedMinistries set
  selectedMinistries.clear();
  document.querySelectorAll('#filterChecks input[type=checkbox]').forEach(cb => {
    if (cb.checked) selectedMinistries.add(cb.value);
  });

  _syncBadges();
  _notify();
}

function _syncBadges() {
  const allSelected = selectedMinistries.size === ministries.length;
  [['filterBadge', 'filterToggleBtn'], ['calFilterBadge', 'calFilterToggleBtn']].forEach(([bId, btnId]) => {
    const badge = document.getElementById(bId);
    const btn   = document.getElementById(btnId);
    if (!badge || !btn) return;
    badge.textContent = allSelected ? '' : selectedMinistries.size;
    badge.classList.toggle('hidden', allSelected);
    btn.classList.toggle('active', !allSelected);
  });
}

export function initFilterToggles() {
  document.getElementById('filterToggleBtn')?.addEventListener('click', () => {
    document.getElementById('filterPanel').classList.toggle('open');
  });
  document.getElementById('calFilterToggleBtn')?.addEventListener('click', () => {
    document.getElementById('calFilterPanel').classList.toggle('open');
  });
}