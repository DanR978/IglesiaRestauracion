// js/lib/special-events.js
// ─────────────────────────────────────────────────────────────────────────────
// Queries + lifecycle rules for registration events (`special_events`).
//
// The lifecycle is derived from two timestamps and one flag:
//
//   event_at ─────────── ends_at ─────────── +7d
//       │   upcoming   │   running   │  ended  │  gone
//
//   • `ends_at` is when the event is OVER. Null falls back to the close of
//     event_at's day in America/New_York — this mirrors public.special_event_ends()
//     in supabase/migrations/20260716_event_lifecycle.sql. Change one, change both.
//   • Registration is gated by `registration_open` ALONE, exactly like the
//     `event_reg_insert` RLS policy. Never re-add a date check here: an admin
//     re-opening an ended event has to actually re-open it. A scheduled job
//     keeps the flag honest once an event ends.
//
// Usage:
//   import { eventPhase, isRegistrationOpen, fetchLiveEvents } from '/js/lib/special-events.js';
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';

const TZ = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a finished event keeps its spot before it drops off the site. */
export const LINGER_DAYS = 7;
const LINGER_MS = LINGER_DAYS * DAY_MS;

const CARD_COLS =
  'id,title,slug,image_url,event_at,ends_at,location,registration_open,status,' +
  'gallery_albums(id,slug,title,photo_count,is_published)';

/* ── Time helpers ─────────────────────────────────────────────────────────── */

// The zone's UTC offset at a given instant, in ms. 'sv-SE' renders as
// "YYYY-MM-DD HH:mm:ss", which re-parses cleanly once ISO-ified.
function tzOffsetMs(instant) {
  const wall = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(instant).replace(' ', 'T') + 'Z';
  return Date.parse(wall) - instant.getTime();
}

// The instant at which `iso`'s local day closes (midnight that starts the next
// day, in TZ). Two passes so a DST boundary resolves to the real offset.
function endOfDayTZ(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d).split('-').map(Number);
  const wall = Date.UTC(y, m - 1, day + 1);
  let t = wall - tzOffsetMs(new Date(wall));
  t = wall - tzOffsetMs(new Date(t));
  return new Date(t);
}

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

export function eventStartsAt(ev) {
  if (!ev?.event_at) return null;
  const d = new Date(ev.event_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function eventEndsAt(ev) {
  if (ev?.ends_at) {
    const d = new Date(ev.ends_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return ev?.event_at ? endOfDayTZ(ev.event_at) : null;
}

/**
 * 'upcoming' → 'running' → 'ended' → 'gone'.
 * 'gone' means stop showing it. A dateless event is always 'upcoming' — there
 * is nothing for it to run past.
 */
export function eventPhase(ev, now = Date.now()) {
  const start = eventStartsAt(ev);
  const end   = eventEndsAt(ev);
  if (!start || !end) return 'upcoming';
  if (now < start.getTime())            return 'upcoming';
  if (now < end.getTime())              return 'running';
  if (now < end.getTime() + LINGER_MS)  return 'ended';
  return 'gone';
}

export const PHASE_LABEL = {
  upcoming: 'Próximamente',
  running:  'En curso',
  ended:    'Recién terminado',
};

export const PHASE_ICON = {
  upcoming: 'fa-hourglass-start',
  running:  'fa-circle-play',
  ended:    'fa-circle-check',
};

/** Mirrors the `event_reg_insert` RLS policy. The flag is the whole gate. */
export function isRegistrationOpen(ev) {
  return !!ev?.registration_open;
}

/**
 * Whether the public site should list this event at all.
 *
 * Registration state is not a visibility rule once an event has started — a
 * running or finished event stays up whether or not it's still taking sign-ups.
 * But `special_events` has no draft flag, so closing registration on an event
 * that hasn't started yet is the only way admins can keep one they're still
 * preparing off the site. That single combination stays hidden.
 */
export function isPubliclyVisible(ev, now = Date.now()) {
  const phase = eventPhase(ev, now);
  if (phase === 'gone') return false;
  if (phase === 'upcoming' && !isRegistrationOpen(ev)) return false;
  return true;
}

/* ── Photos ───────────────────────────────────────────────────────────────── */

/** The event's album — only once it's published AND actually has photos in it. */
export function eventAlbum(ev) {
  const albums = Array.isArray(ev?.gallery_albums) ? ev.gallery_albums : [];
  const ready = albums.filter(a => a?.is_published && (a.photo_count ?? 0) > 0);
  if (!ready.length) return null;
  return ready.sort((a, b) => (b.photo_count ?? 0) - (a.photo_count ?? 0))[0];
}

export function albumUrl(album) {
  if (album?.slug) return `/galeria/album/?slug=${encodeURIComponent(album.slug)}`;
  if (album?.id)   return `/galeria/album/?id=${encodeURIComponent(album.id)}`;
  return '/galeria';
}

export function eventUrl(ev) {
  return `/eventos/evento-especial.html?e=${encodeURIComponent(ev?.slug ?? '')}`;
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

// Running first (it's happening now), then soonest upcoming, then the most
// recently finished.
const PHASE_RANK = { running: 0, upcoming: 1, ended: 2, gone: 3 };
function byPhaseThenDate(a, b) {
  const pa = eventPhase(a), pb = eventPhase(b);
  if (PHASE_RANK[pa] !== PHASE_RANK[pb]) return PHASE_RANK[pa] - PHASE_RANK[pb];
  const ta = eventStartsAt(a)?.getTime() ?? Infinity;
  const tb = eventStartsAt(b)?.getTime() ?? Infinity;
  return pa === 'ended' ? tb - ta : ta - tb;
}

/**
 * Every event the public should still see: upcoming, running, or finished
 * within the last LINGER_DAYS.
 *
 * The effective end is computed (ends_at may be null), so the phase filter runs
 * client-side. The query only has to avoid missing anything — either timestamp
 * inside the linger window qualifies the row, which covers a long camp whose
 * start is well outside it.
 *
 * `registration_open` is NOT a visibility filter once an event has started:
 * a running or finished event stays up whether or not it's still taking
 * sign-ups. But an *upcoming* closed event is how admins keep an event they're
 * still preparing off the site — special_events has no draft flag — so that one
 * combination stays hidden.
 */
export async function fetchLiveEvents({ limit = 12 } = {}) {
  if (!sb) return [];
  const floorIso = new Date(Date.now() - (LINGER_DAYS + 1) * DAY_MS).toISOString();
  const { data, error } = await sb
    .from('special_events')
    .select(CARD_COLS)
    .or(`ends_at.gte.${floorIso},event_at.gte.${floorIso},event_at.is.null`)
    .order('event_at', { ascending: true, nullsFirst: false });
  if (error) { console.warn('[special-events] fetchLiveEvents:', error.message); return []; }
  return (data ?? [])
    .filter(ev => isPubliclyVisible(ev))
    .sort(byPhaseThenDate)
    .slice(0, limit);
}

export async function fetchEventBy({ slug, id } = {}) {
  if (!sb || (!slug && !id)) return null;
  let q = sb.from('special_events').select(`*,gallery_albums(id,slug,title,photo_count,is_published)`);
  q = slug ? q.eq('slug', slug) : q.eq('id', id);
  const { data, error } = await q.maybeSingle();
  if (error) { console.warn('[special-events] fetchEventBy:', error.message); return null; }
  return data;
}

/** Events an album can be attached to, newest first (admin gallery picker). */
export async function fetchEventOptions() {
  if (!sb) return [];
  const { data, error } = await sb
    .from('special_events')
    .select('id,title,event_at')
    .order('event_at', { ascending: false, nullsFirst: false });
  if (error) { console.warn('[special-events] fetchEventOptions:', error.message); return []; }
  return data ?? [];
}
