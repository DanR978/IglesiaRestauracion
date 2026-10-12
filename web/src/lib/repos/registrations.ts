/* ============================================================================
 * web/src/lib/repos/registrations.ts — registration events (`special_events`)
 * + the public sign-up insert (`event_registrations`) (S22)
 * ----------------------------------------------------------------------------
 * Port of the query half of legacy `js/lib/special-events.js`, plus the inline
 * insert from `js/pages/eventos/registro-wizard.js`. Reads never throw (warn
 * with `[registrations]`, return a safe empty); writes return `WriteResult`.
 *
 * G-006: `submitRegistrations` is an anon insert into a table anon cannot
 * SELECT — it must NOT chain `.select()`, or a saved row surfaces as a false
 * "violates row-level security policy". The wizard only needs "it succeeded".
 *
 * Lifecycle rules (phase, visibility, ordering) are pure and live in
 * `$lib/special-events`; this module only runs the queries and applies them.
 *
 * Usage:
 *   import { fetchLiveEvents, fetchSpecialEventBy } from '$lib/repos/registrations';
 * ========================================================================== */

import { supabase } from '$lib/db/client';
import type { Tables, TablesInsert } from '$lib/db/database.types';
import {
  LINGER_DAYS,
  compareByPhaseThenDate,
  isPubliclyVisible,
  type EventAlbumRef,
} from '$lib/special-events';
import type { WriteResult } from './types';

const TAG = '[registrations]';
const DAY_MS = 24 * 60 * 60 * 1000;

export type SpecialEventRow = Tables<'special_events'>;
export type EventRegistrationInsert = TablesInsert<'event_registrations'>;

const ALBUM_EMBED = 'gallery_albums(id,slug,title,photo_count,is_published)';

/** The card projection the homepage CTA renders: lifecycle columns + album refs. */
export type SpecialEventCard = Pick<
  SpecialEventRow,
  | 'id'
  | 'title'
  | 'slug'
  | 'image_url'
  | 'event_at'
  | 'ends_at'
  | 'location'
  | 'registration_open'
  | 'status'
> & { gallery_albums: EventAlbumRef[] };
// A template (not `+`) so TS keeps the literal type the select parser needs.
const CARD_COLS = `id,title,slug,image_url,event_at,ends_at,location,registration_open,status,${ALBUM_EMBED}`;

/** The full row plus album refs — the detail page and the registro gate. */
export type SpecialEventDetail = SpecialEventRow & { gallery_albums: EventAlbumRef[] };

/** The projection the events hub merges into its calendar. */
export type SpecialEventCalendarRow = Pick<
  SpecialEventRow,
  | 'id'
  | 'title'
  | 'slug'
  | 'image_url'
  | 'description'
  | 'event_at'
  | 'ends_at'
  | 'location'
  | 'registration_open'
>;
const CALENDAR_COLS =
  'id,title,slug,image_url,description,event_at,ends_at,location,registration_open';

/** The admin gallery picker's option list. */
export type SpecialEventOption = Pick<SpecialEventRow, 'id' | 'title' | 'event_at'>;

/* ── Reads ─────────────────────────────────────────────────────────────── */

export type LiveEventsOptions = {
  limit?: number;
  /** Epoch ms; pin it for prerenders and tests. */
  now?: number;
};

/**
 * Every event the public should still see: upcoming, running, or finished
 * within the last LINGER_DAYS — running first, then soonest upcoming, then
 * most recently finished.
 *
 * The effective end is computed (ends_at may be null), so the phase filter runs
 * client-side. The query only has to avoid missing anything — either timestamp
 * inside the linger window qualifies the row, which covers a long camp whose
 * start is well outside it.
 */
export async function fetchLiveEvents({
  limit = 12,
  now = Date.now(),
}: LiveEventsOptions = {}): Promise<SpecialEventCard[]> {
  const floorIso = new Date(now - (LINGER_DAYS + 1) * DAY_MS).toISOString();
  const { data, error } = await supabase
    .from('special_events')
    .select(CARD_COLS)
    .or(`ends_at.gte.${floorIso},event_at.gte.${floorIso},event_at.is.null`)
    .order('event_at', { ascending: true, nullsFirst: false });
  if (error) {
    console.warn(`${TAG} fetchLiveEvents:`, error.message);
    return [];
  }
  return (data ?? [])
    .filter((ev) => isPubliclyVisible(ev, now))
    .sort(compareByPhaseThenDate(now))
    .slice(0, limit);
}

export type SpecialEventLookup = { slug?: string | null; id?: string | null };

/** One registration event by slug (preferred) or id, with its album refs. */
export async function fetchSpecialEventBy({
  slug,
  id,
}: SpecialEventLookup = {}): Promise<SpecialEventDetail | null> {
  if (!slug && !id) return null;
  let q = supabase.from('special_events').select(`*,${ALBUM_EMBED}`);
  q = slug ? q.eq('slug', slug) : q.eq('id', id as string);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.warn(`${TAG} fetchSpecialEventBy:`, error.message);
    return null;
  }
  return data;
}

/** Every registration event in the hub's calendar projection, by start time. */
export async function fetchSpecialEventsForCalendar(): Promise<SpecialEventCalendarRow[]> {
  const { data, error } = await supabase
    .from('special_events')
    .select(CALENDAR_COLS)
    .order('event_at');
  if (error) {
    console.warn(`${TAG} fetchSpecialEventsForCalendar:`, error.message);
    return [];
  }
  return data ?? [];
}

/** Events an album can be attached to, newest first (admin gallery picker). */
export async function fetchSpecialEventOptions(): Promise<SpecialEventOption[]> {
  const { data, error } = await supabase
    .from('special_events')
    .select('id,title,event_at')
    .order('event_at', { ascending: false, nullsFirst: false });
  if (error) {
    console.warn(`${TAG} fetchSpecialEventOptions:`, error.message);
    return [];
  }
  return data ?? [];
}

/* ── Write: the public sign-up ─────────────────────────────────────────── */

/**
 * Insert one row per participant (the wizard shares `registration_group_id`
 * across them). Anon, `return=minimal` — NO `.select()` (G-006). The
 * `event_reg_insert` policy is the gate: a closed event fails here, which the
 * caller reports as "las inscripciones podrían estar cerradas".
 */
export async function submitRegistrations(rows: EventRegistrationInsert[]): Promise<WriteResult> {
  if (!rows.length) return { ok: false, error: 'No hay participantes que inscribir.' };
  const { error } = await supabase.from('event_registrations').insert(rows);
  if (error) {
    console.warn(`${TAG} submitRegistrations:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, data: undefined };
}
