/* ============================================================================
 * web/src/lib/special-events.ts — lifecycle rules for registration events
 * (`special_events`) — pure half of legacy js/lib/special-events.js (S22)
 * ----------------------------------------------------------------------------
 * The lifecycle is derived from two timestamps and one flag:
 *
 *   event_at ─────────── ends_at ─────────── +7d
 *       │   upcoming   │   running   │  ended  │  gone
 *
 *   • `ends_at` is when the event is OVER. Null falls back to the close of
 *     event_at's day in America/New_York — this mirrors
 *     public.special_event_ends() in
 *     supabase/migrations/20260716_event_lifecycle.sql. Change one, change both.
 *   • Registration is gated by `registration_open` ALONE, exactly like the
 *     `event_reg_insert` RLS policy. Never re-add a date check here: an admin
 *     re-opening an ended event has to actually re-open it. A scheduled job
 *     keeps the flag honest once an event ends.
 *
 * Every function takes an explicit `now` (epoch ms) so prerenders and tests
 * are deterministic (G-002). Queries live in `$lib/repos/registrations`.
 *
 * Usage:
 *   import { eventPhase, isRegistrationOpen, eventAlbum } from '$lib/special-events';
 * ========================================================================== */

const TZ = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a finished event keeps its spot before it drops off the site. */
export const LINGER_DAYS = 7;
const LINGER_MS = LINGER_DAYS * DAY_MS;

export type EventPhase = 'upcoming' | 'running' | 'ended' | 'gone';

/** The subset of a `special_events` row the lifecycle reads. */
export type LifecycleInput = {
  event_at?: string | null;
  ends_at?: string | null;
  registration_open?: boolean | null;
};

/** The embedded `gallery_albums(...)` projection the card query selects. */
export type EventAlbumRef = {
  id: string;
  slug: string | null;
  title: string;
  photo_count: number | null;
  is_published: boolean | null;
};

export type EventWithAlbums = LifecycleInput & {
  gallery_albums?: EventAlbumRef[] | EventAlbumRef | null;
};

export type EventRef = { slug?: string | null } | null | undefined;
export type AlbumRef = { id?: string | null; slug?: string | null } | null | undefined;

/* ── Time helpers ──────────────────────────────────────────────────────── */

// The zone's UTC offset at a given instant, in ms. 'sv-SE' renders as
// "YYYY-MM-DD HH:mm:ss", which re-parses cleanly once ISO-ified.
function tzOffsetMs(instant: Date): number {
  const wall =
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(instant)
      .replace(' ', 'T') + 'Z';
  return Date.parse(wall) - instant.getTime();
}

// The instant at which `iso`'s local day closes (midnight that starts the next
// day, in TZ). Two passes so a DST boundary resolves to the real offset.
function endOfDayTZ(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .split('-')
    .map(Number);
  const wall = Date.UTC(y, m - 1, day + 1);
  let t = wall - tzOffsetMs(new Date(wall));
  t = wall - tzOffsetMs(new Date(t));
  return new Date(t);
}

/* ── Lifecycle ─────────────────────────────────────────────────────────── */

export function eventStartsAt(ev: LifecycleInput | null | undefined): Date | null {
  if (!ev?.event_at) return null;
  const d = new Date(ev.event_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function eventEndsAt(ev: LifecycleInput | null | undefined): Date | null {
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
export function eventPhase(
  ev: LifecycleInput | null | undefined,
  now: number = Date.now(),
): EventPhase {
  const start = eventStartsAt(ev);
  const end = eventEndsAt(ev);
  if (!start || !end) return 'upcoming';
  if (now < start.getTime()) return 'upcoming';
  if (now < end.getTime()) return 'running';
  if (now < end.getTime() + LINGER_MS) return 'ended';
  return 'gone';
}

export const PHASE_LABEL: Readonly<Record<Exclude<EventPhase, 'gone'>, string>> = {
  upcoming: 'Próximamente',
  running: 'En curso',
  ended: 'Recién terminado',
};

export const PHASE_ICON: Readonly<Record<Exclude<EventPhase, 'gone'>, string>> = {
  upcoming: 'fa-hourglass-start',
  running: 'fa-circle-play',
  ended: 'fa-circle-check',
};

/** Mirrors the `event_reg_insert` RLS policy. The flag is the whole gate. */
export function isRegistrationOpen(ev: LifecycleInput | null | undefined): boolean {
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
export function isPubliclyVisible(
  ev: LifecycleInput | null | undefined,
  now: number = Date.now(),
): boolean {
  const phase = eventPhase(ev, now);
  if (phase === 'gone') return false;
  if (phase === 'upcoming' && !isRegistrationOpen(ev)) return false;
  return true;
}

// Running first (it's happening now), then soonest upcoming, then the most
// recently finished.
const PHASE_RANK: Readonly<Record<EventPhase, number>> = {
  running: 0,
  upcoming: 1,
  ended: 2,
  gone: 3,
};

/** Sort comparator for public event lists; pass the same `now` as the filter. */
export function compareByPhaseThenDate(now: number = Date.now()) {
  return (a: LifecycleInput, b: LifecycleInput): number => {
    const pa = eventPhase(a, now);
    const pb = eventPhase(b, now);
    if (PHASE_RANK[pa] !== PHASE_RANK[pb]) return PHASE_RANK[pa] - PHASE_RANK[pb];
    const ta = eventStartsAt(a)?.getTime() ?? Infinity;
    const tb = eventStartsAt(b)?.getTime() ?? Infinity;
    return pa === 'ended' ? tb - ta : ta - tb;
  };
}

/* ── Photos ────────────────────────────────────────────────────────────── */

/** The event's album — only once it's published AND actually has photos in it. */
export function eventAlbum(ev: EventWithAlbums | null | undefined): EventAlbumRef | null {
  const albums = Array.isArray(ev?.gallery_albums) ? ev.gallery_albums : [];
  const ready = albums.filter((a) => a?.is_published && (a.photo_count ?? 0) > 0);
  if (!ready.length) return null;
  return ready.sort((a, b) => (b.photo_count ?? 0) - (a.photo_count ?? 0))[0];
}

export function albumUrl(album: AlbumRef): string {
  if (album?.slug) return `/galeria/album/?slug=${encodeURIComponent(album.slug)}`;
  if (album?.id) return `/galeria/album/?id=${encodeURIComponent(album.id)}`;
  return '/galeria';
}

export function eventUrl(ev: EventRef): string {
  return `/eventos/evento-especial.html?e=${encodeURIComponent(ev?.slug ?? '')}`;
}
