/* ============================================================================
 * web/src/lib/repos/events.ts — `events` + `calendar_events` reads (S22)
 * ----------------------------------------------------------------------------
 * The inline `sb.from('events' | 'calendar_events')` queries the PUBLIC site
 * ran from js/main.js, js/components/calendar.js, js/components/event-detail.js
 * and js/pages/eventos/hub.js, extracted into typed functions. Reads never
 * throw: they return a `ReadResult` (ADR-0004) — a failure is logged with the
 * `[events]` tag and comes back as `{ ok: false, error }`, never as an empty
 * list.
 *
 * Registration events (`special_events`) are a different table with their own
 * lifecycle — see `#lib/repos/registrations.js`.
 *
 * Every read here is public (`events_public_read`, `calevents_public_read`:
 * anon may read all rows), so none of them asks for a session — except
 * `fetchNextCalendarEvents`, whose `ministries` embed anon cannot read.
 *
 * S40 adds the admin Inicio's reads (js/pages/admin/dashboard.js): two `head`
 * counts and the next calendar activities. A count that fails or comes back
 * without a number is `{ ok: false }`, never 0.
 *
 * Usage:
 *   import { fetchUpcomingEvents, fetchEventById } from '#lib/repos/events.js';
 *   const res = await fetchUpcomingEvents();
 *   if (res.ok) render(res.data);
 *   const month = await countCalendarEvents({ from: '2026-10-01', to: '2026-10-31' });
 * ========================================================================== */

import { browser } from '$app/env';
import { supabase } from '#lib/db/client.js';
import type { Tables } from '#lib/db/database.types.js';
import { todayISO } from '#lib/date.js';
import { fail, invalid, noCount, ok } from './errors';
import { requireSession } from './session';
import type { ChangeHandler, ReadResult, Unsubscribe } from './types';

const TAG = '[events]';

export type EventRow = Tables<'events'>;
export type CalendarEventRow = Tables<'calendar_events'>;

/** The `events` projection the hub / month grid renders. */
export type EventCalendarRow = Pick<
  EventRow,
  'id' | 'title' | 'starts_at' | 'location' | 'description' | 'image_url' | 'tag'
>;
const EVENT_CALENDAR_COLS = 'id,title,starts_at,location,description,image_url,tag';

/** The `calendar_events` projection the hub / month grid renders. */
export type CalendarActivityRow = Pick<
  CalendarEventRow,
  'id' | 'title' | 'date' | 'time' | 'location' | 'description' | 'category' | 'cancelled'
>;
const CALENDAR_ACTIVITY_COLS = 'id,title,date,time,location,description,category,cancelled';

/** Local start of today — the legacy homepage rail's "upcoming" floor. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Upcoming special events for the homepage rail: everything starting at or
 * after `since` (default: the viewer's local start of today), soonest first.
 * An Invalid Date is refused (`toISOString()` would throw).
 */
export async function fetchUpcomingEvents(
  since: Date = startOfToday(),
): Promise<ReadResult<EventRow[]>> {
  if (Number.isNaN(since.getTime())) return invalid('Fecha inválida.');
  const { data, error, status } = await supabase
    .from('events')
    .select('*')
    .gte('starts_at', since.toISOString())
    .order('starts_at', { ascending: true });
  if (error) return fail(TAG, 'fetchUpcomingEvents', error, status);
  return ok(data ?? []);
}

/** One event for the detail page; `data: null` when there is no such event. */
export async function fetchEventById(id: string): Promise<ReadResult<EventRow | null>> {
  if (!id) return ok(null);
  const { data, error, status } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(TAG, 'fetchEventById', error, status);
  return ok(data);
}

/** Every special event, by start time, in the hub's card projection. */
export async function fetchEventsForCalendar(): Promise<ReadResult<EventCalendarRow[]>> {
  const { data, error, status } = await supabase
    .from('events')
    .select(EVENT_CALENDAR_COLS)
    .order('starts_at');
  if (error) return fail(TAG, 'fetchEventsForCalendar', error, status);
  return ok(data ?? []);
}

/** Every recurring activity (`calendar_events`), by date. */
export async function fetchCalendarActivities(): Promise<ReadResult<CalendarActivityRow[]>> {
  const { data, error, status } = await supabase
    .from('calendar_events')
    .select(CALENDAR_ACTIVITY_COLS)
    .order('date');
  if (error) return fail(TAG, 'fetchCalendarActivities', error, status);
  return ok(data ?? []);
}

/* ── Admin Inicio (S40/S41) ────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DateRange = {
  /** First day counted, 'YYYY-MM-DD', inclusive; no lower bound when omitted. */
  from?: string | null;
  /** Last day counted, 'YYYY-MM-DD', inclusive; no upper bound when omitted. */
  to?: string | null;
};

/**
 * How many calendar activities fall on [from, to] — cancelled ones included,
 * as legacy Inicio counted them. Every `calendar_events` row is public, so
 * this needs no session.
 */
export async function countCalendarEvents({ from, to }: DateRange = {}): Promise<
  ReadResult<number>
> {
  if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
    return invalid('Las fechas no son válidas.');
  }
  let q = supabase.from('calendar_events').select('id', { count: 'exact', head: true });
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  const { count, error, status } = await q;
  if (error) return fail(TAG, 'countCalendarEvents', error, status);
  if (count === null) return noCount(TAG, 'countCalendarEvents');
  return ok(count);
}

/** How many special events (`events`) start at or after `nowIso`. A public read. */
export async function countUpcomingSpecialEvents(nowIso: string): Promise<ReadResult<number>> {
  if (Number.isNaN(Date.parse(nowIso))) return invalid('La fecha no es válida.');
  const { count, error, status } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .gte('starts_at', nowIso);
  if (error) return fail(TAG, 'countUpcomingSpecialEvents', error, status);
  if (count === null) return noCount(TAG, 'countUpcomingSpecialEvents');
  return ok(count);
}

/** A calendar activity in Inicio's "Próximos eventos" list. */
export type NextCalendarEvent = Pick<
  CalendarEventRow,
  'id' | 'title' | 'date' | 'time' | 'location' | 'cancelled'
> & { ministries: { name: string; color: string | null } | null };

const NEXT_DEFAULT = 6;
const NEXT_MAX = 50;

/**
 * The next `limit` calendar activities from `from` (default: the viewer's
 * local today), soonest first, each with its ministry's name and colour.
 * Staff-only although the rows are public: `ministries` is not, so signed
 * out every ministry would quietly come back null.
 */
export async function fetchNextCalendarEvents(
  limit = NEXT_DEFAULT,
  from: string = todayISO(),
): Promise<ReadResult<NextCalendarEvent[]>> {
  const denied = await requireSession(TAG, 'fetchNextCalendarEvents');
  if (denied) return denied;
  if (!ISO_DATE.test(from)) return invalid('La fecha no es válida.');
  const rows = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), 1), NEXT_MAX)
    : NEXT_DEFAULT;
  const { data, error, status } = await supabase
    .from('calendar_events')
    .select('id,title,date,time,location,cancelled,ministries(name,color)')
    .gte('date', from)
    .order('date', { ascending: true })
    .limit(rows);
  if (error) return fail(TAG, 'fetchNextCalendarEvents', error, status);
  return ok(data ?? []);
}

/**
 * Realtime: any change to `events`. A no-op during prerender — a socket
 * opened under Node would keep the build alive.
 */
export function subscribeEvents(onChange: ChangeHandler<EventRow>): Unsubscribe {
  if (!browser) return () => {};
  const ch = supabase
    .channel('events-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
