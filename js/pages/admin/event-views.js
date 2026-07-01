// js/pages/admin/event-views.js
// ─────────────────────────────────────────────────────────────────────────────
// "Eventos" is a single nav entry that hosts three views behind pills:
// Calendario (default) · Próximos · Registraciones. Each pill shows its
// `.ev-view` panel and (re)loads its data. Deep-links from elsewhere (dashboard
// cards, notifications, calendar → edit) route through goToTab() so those three
// keys land on the right pill instead of a now-removed top-level nav button.
// ─────────────────────────────────────────────────────────────────────────────

import { loadUpcoming }      from './events-tab.js';
import { loadCalendario }    from './calendar-tab.js';
import { loadSpecialEvents } from './special-events-tab.js';

const EV_VIEWS = ['calendario', 'upcoming', 'special-events'];
const LOADERS = { calendario: loadCalendario, upcoming: loadUpcoming, 'special-events': loadSpecialEvents };

// Show one view + load it. No-op for an unknown key.
export function showEventView(view) {
  if (!EV_VIEWS.includes(view)) return;
  document.querySelectorAll('#evPills .ev-pill').forEach(p => {
    const on = p.dataset.evView === view;
    p.classList.toggle('active', on);
    p.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('#tab-eventos .ev-view').forEach(v =>
    v.classList.toggle('active', v.id === `tab-${view}`));
  LOADERS[view]?.();
  window.scrollTo(0, 0);
}

// Called when the Eventos tab is opened: reopen the active pill, or fall back to
// the first pill the user is allowed to see (access hides the others).
export function openEventsTab() {
  let pill = document.querySelector('#evPills .ev-pill.active');
  if (!pill || pill.style.display === 'none') {
    pill = [...document.querySelectorAll('#evPills .ev-pill')].find(p => p.style.display !== 'none');
  }
  if (pill) showEventView(pill.dataset.evView);
}

// Navigate to any admin tab by key. The three event views open the Eventos tab
// on the requested pill; everything else clicks its own nav button as before.
export function goToTab(tab) {
  if (EV_VIEWS.includes(tab)) {
    // Pre-select the pill so opening the Eventos tab lands straight on `tab`
    // (openEventsTab reads the active pill) — no default-view flash / double load.
    document.querySelectorAll('#evPills .ev-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.evView === tab));
    document.querySelector('#admNav .tab-btn[data-tab="eventos"]')?.click();
  } else {
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.click();
  }
}

export function initEventViews() {
  document.querySelectorAll('#evPills .ev-pill').forEach(pill =>
    pill.addEventListener('click', () => {
      if (pill.style.display !== 'none') showEventView(pill.dataset.evView);
    }));
}
