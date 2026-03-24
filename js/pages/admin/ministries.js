// js/pages/admin/ministries.js

import { sb, ministries, setMinistries, isAdmin, currentProfile } from './state.js';
import { buildFilterChecks } from './filters.js';

export async function loadMinistries() {
  const { data } = await sb.from('ministries').select('*').order('name');
  setMinistries(data || []);

  const opts = ministries.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  ['evMinistry', 'uMinistry'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });

  if (!isAdmin() && currentProfile?.ministry_id) {
    ['evMinistry', 'uMinistry'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = currentProfile.ministry_id;
    });
  }

  renderMinistriesTab();
  buildFilterChecks();
}

export function renderMinistriesTab() {
  const el = document.getElementById('ministriesList');
  if (!el) return;
  if (!ministries.length) {
    el.innerHTML = '<p style="color:var(--color-muted)">No hay ministerios.</p>';
    return;
  }
  el.innerHTML = ministries.map(m => `
    <div class="ministry-card">
      <div class="ministry-card__dot" style="background:${m.color}"></div>
      <div>
        <div class="ministry-card__name">${m.name}</div>
        <div class="ministry-card__id">${m.id}</div>
      </div>
    </div>`).join('');
}