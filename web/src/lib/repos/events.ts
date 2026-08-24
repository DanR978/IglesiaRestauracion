/* ============================================================================
 * web/src/lib/repos/events.ts — `events` + `calendar_events` reads (S22)
 * ----------------------------------------------------------------------------
 * The inline `sb.from('events' | 'calendar_events')` queries the PUBLIC site
 * ran from js/main.js, js/components/calendar.js, js/components/event-detail.js
 * and js/pages/eventos/hub.js, extracted into typed functions. Reads never
 * throw: they warn with a `[events]` tag and return a safe empty.
 *
 * Registration events (`special_events`) are a different table with their own
 * lifecycle — see `$lib/repos/registrations`.
 *
 * Usage:
 *   import { fetchUpcomingEvents, fetchEventById } from '$lib/repos/events';
 * ========================================================================== */

import { browser } from '$app/environment';
import { supabase } from '$lib/db/client';
import type { Tables } from '$lib/db/database.types';
import type { ChangeHandler, Unsubscribe } from './types';

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
 */
export async function fetchUpcomingEvents(since: Date = startOfToday()): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('starts_at', since.toISOString())
    .order('starts_at', { ascending: true });
  if (error) {
    console.warn(`${TAG} fetchUpcomingEvents:`, error.message);
    return [];
  }
  return data ?? [];
}

/** One event for the detail page; null when missing or on error. */
export async function fetchEventById(id: string): Promise<EventRow | null> {
  if (!id) return null;
  const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.warn(`${TAG} fetchEventById:`, error.message);
    return null;
  }
  return data;
}

/** Every special event, by start time, in the hub's card projection. */
export async function fetchEventsForCalendar(): Promise<EventCalendarRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_CALENDAR_COLS)
    .order('starts_at');
  if (error) {
    console.warn(`${TAG} fetchEventsForCalendar:`, error.message);
    return [];
  }
  return data ?? [];
}

/** Every recurring activity (`calendar_events`), by date. */
export async function fetchCalendarActivities(): Promise<CalendarActivityRow[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_ACTIVITY_COLS)
    .order('date');
  if (error) {
    console.warn(`${TAG} fetchCalendarActivities:`, error.message);
    return [];
  }
  return data ?? [];
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
