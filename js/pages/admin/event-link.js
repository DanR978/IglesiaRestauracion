// js/pages/admin/event-link.js
// ─────────────────────────────────────────────────────────────────────────────
// The "Evento relacionado" picker, shared by the Galería album editor and the
// album wizard. An album links to the registration event it documents, and that
// link is what puts a "Ver fotos" button on the event once the photos land.
//
// The event list is fetched once and cached: both callers must await
// `loadEventOptions()` before rendering a picker, otherwise the select renders
// empty and saving would quietly clear an album's existing link.
//
// Usage:
//   const events = await loadEventOptions();
//   sel.innerHTML = eventOptionsHtml(events, album.special_event_id);
// ─────────────────────────────────────────────────────────────────────────────

import { html } from '/js/utils/escape.js';
import { fetchEventOptions } from '/js/lib/special-events.js';

const TZ = 'America/New_York';

let _cache = null;
let _inflight = null;

/** Fetch-once cache. Concurrent callers share the same request. */
export async function loadEventOptions() {
  if (_cache) return _cache;
  if (!_inflight) {
    _inflight = fetchEventOptions()
      .then(list => { _cache = list; return list; })
      .finally(() => { _inflight = null; });
  }
  return _inflight;
}

/** Drop the cache so a newly created event shows up in the picker. */
export function invalidateEventOptions() {
  _cache = null;
}

// Titles come from the DB, so this is built with the auto-escaping template.
export function eventOptionsHtml(events, selectedId) {
  const known = (events || []).some(ev => ev.id === selectedId);
  return html`
    <option value="" ${selectedId && known ? '' : 'selected'}>— Sin evento —</option>
    ${(events || []).map(ev => html`
      <option value="${ev.id}" ${ev.id === selectedId ? 'selected' : ''}>${eventLabel(ev)}</option>`)}
  `.toString();
}

// Several events share a title across years ("EBV"), so date-stamp the label.
function eventLabel(ev) {
  const title = ev?.title || 'Evento';
  if (!ev?.event_at) return title;
  try {
    const when = new Intl.DateTimeFormat('es', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ,
    }).format(new Date(ev.event_at));
    return `${title} — ${when}`;
  } catch {
    return title;
  }
}
