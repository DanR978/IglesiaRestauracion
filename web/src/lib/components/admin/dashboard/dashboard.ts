/* ============================================================================
 * web/src/lib/components/admin/dashboard/dashboard.ts — what Inicio shows (S41)
 * ----------------------------------------------------------------------------
 * The non-visual half of the admin Inicio (routes/(admin)/admin/(app)/
 * +page.svelte). Retires js/pages/admin/dashboard.js loadDashboard(): its
 * all-or-nothing Promise.all, the `count ?? 0` that showed a failed count as
 * 0, the isAdmin() switch, and autoBalance() (G-010 — the grid is pure CSS).
 *
 * TILES are static KPIs — a count, what it counts and the honest scope of
 * the number; no trend, no sparkline. Each has a `visible` rule read from
 * perms (D-006, UX only): RLS answers a staff member without the tab with an
 * EMPTY result, not an error, so an ungated tile would show a misleading 0.
 *   Próximos eventos        any staff      calendar events from today on plus
 *                                          special events starting today or
 *                                          later, one count ("Desde hoy" holds
 *                                          for both kinds)
 *   Eventos este mes        any staff      calendar events this month
 *   Interesados pendientes  discipulado    warn + icon + words when > 0
 *   Álbumes                 galeria        every album, drafts included
 *   Balance                 church-books   this month's church books
 * Calendar and special events are public rows, so their counts are the same
 * for every role — "any staff" is `inicio`, which perms grants only to a
 * signed-in, two-step-verified staff account.
 *
 * Each load takes the Instant of that load, so a page left open across
 * midnight or a month end counts the new day or month on its next refresh.
 *
 * Usage:
 *   import { TILES, instantOf } from '#lib/components/admin/dashboard/dashboard.js';
 *   const shown = TILES.filter((tile) => tile.visible(perms));
 *   const result = await shown[0].read(instantOf(new Date()));
 * ========================================================================== */

import type { Capability, SurfaceKey } from '#lib/auth/surfaces.js';
import { isoDate } from '#lib/date.js';
import { formatUSD } from '#lib/money.js';
import { countPendingInterests } from '#lib/repos/discipleship.js';
import { countCalendarEvents, countUpcomingSpecialEvents } from '#lib/repos/events.js';
import { countAlbums } from '#lib/repos/gallery.js';
import { fetchBooksSummary } from '#lib/repos/treasury/index.js';
import { monthKeyOf, monthRange, type DateRange } from '#lib/repos/treasury/shared.js';
import type { ReadResult } from '#lib/repos/types.js';

/** The legacy panel at the site root — never under /app (the one "manage" link). */
export const LEGACY_PANEL_URL = '/admin/';

/** A tab coming back into view refetches at most this often. */
export const REFRESH_MS = 60_000;

export const NEXT_EVENTS_LIMIT = 6;
export const ACTIVITY_LIMIT = 8;

/* ── The moment a card loads ───────────────────────────────────────────── */

export interface Instant {
  /** Today in the viewer's time zone, 'YYYY-MM-DD'. */
  readonly today: string;
  /** The viewer's midnight today, as an ISO instant. */
  readonly dayStart: string;
  /** The current calendar month, inclusive 'YYYY-MM-DD' bounds. */
  readonly month: DateRange;
}

/** The day and month `now` falls in, in the viewer's time zone (G-002: dates stay strings). */
export function instantOf(now: Date): Instant {
  const today = isoDate(now);
  return {
    today,
    dayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    month: monthRange(monthKeyOf(today)),
  };
}

/* ── KPI tiles ─────────────────────────────────────────────────────────── */

export type TileKey = 'upcoming' | 'month' | 'interests' | 'albums' | 'balance';

/** `warn` = needs someone's attention; `negative` = a money figure below zero. */
export type TileTone = 'warn' | 'negative';

export interface TileValue {
  /** The figure, formatted for display. */
  readonly text: string;
  /** A currency figure: longer than a count, so it is sized to fit its tile. */
  readonly money?: boolean;
  readonly tone?: TileTone;
  /** Words that say why the tile is emphasised — never colour alone. */
  readonly attention?: string;
}

/** What the tiles need from perms (#lib/stores/perms). */
export interface DashboardAccess {
  has(key: SurfaceKey): boolean;
  can(capability: Capability): boolean;
}

export interface TileSpec {
  readonly key: TileKey;
  /** What is counted. */
  readonly label: string;
  /** The honest scope of the figure. */
  readonly scope: string;
  /** Font Awesome solid glyph (decorative). */
  readonly icon: string;
  readonly visible: (access: DashboardAccess) => boolean;
  readonly read: (at: Instant) => Promise<ReadResult<TileValue>>;
}

export const PENDING_ATTENTION = 'Requiere atención';

const anyStaff = (access: DashboardAccess): boolean => access.has('inicio');

const asCount = (n: number): TileValue => ({ text: String(n) });

function mapData<T, U>(result: ReadResult<T>, map: (data: T) => U): ReadResult<U> {
  return result.ok ? { ok: true, data: map(result.data) } : result;
}

export const TILES: readonly TileSpec[] = [
  {
    key: 'upcoming',
    label: 'Próximos eventos',
    scope: 'Desde hoy',
    icon: 'calendar-day',
    visible: anyStaff,
    async read(at) {
      const [calendar, special] = await Promise.all([
        countCalendarEvents({ from: at.today }),
        countUpcomingSpecialEvents(at.dayStart),
      ]);
      if (!calendar.ok) return calendar;
      if (!special.ok) return special;
      return { ok: true, data: asCount(calendar.data + special.data) };
    },
  },
  {
    key: 'month',
    label: 'Eventos este mes',
    scope: 'Calendario · este mes',
    icon: 'calendar-week',
    visible: anyStaff,
    async read(at) {
      const result = await countCalendarEvents({ from: at.month.start, to: at.month.end });
      return mapData(result, asCount);
    },
  },
  {
    key: 'interests',
    label: 'Interesados pendientes',
    scope: 'Discipulado · por contactar',
    icon: 'hand-holding-heart',
    visible: (access) => access.has('discipulado'),
    async read() {
      return mapData(await countPendingInterests(), (n): TileValue =>
        n > 0 ? { text: String(n), tone: 'warn', attention: PENDING_ATTENTION } : asCount(n),
      );
    },
  },
  {
    key: 'albums',
    label: 'Álbumes',
    scope: 'Galería · incluye borradores',
    icon: 'images',
    visible: (access) => access.has('galeria'),
    async read() {
      return mapData(await countAlbums(), asCount);
    },
  },
  {
    key: 'balance',
    label: 'Balance',
    scope: 'Este mes · libros de la iglesia',
    icon: 'scale-balanced',
    visible: (access) => access.can('church-books'),
    async read(at) {
      return mapData(await fetchBooksSummary(at.month), ({ balanceCents }): TileValue => ({
        text: formatUSD(balanceCents),
        money: true,
        ...(balanceCents < 0 && { tone: 'negative' }),
      }));
    },
  },
];

/* ── Words ─────────────────────────────────────────────────────────────── */

/** "Hola, Ana" from the display name's first word (legacy dashboard.js:20-24). */
export function greeting(displayName: string | null | undefined): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? `Hola, ${first}` : 'Hola';
}

const MONTHS_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export interface EventDay {
  readonly day: number;
  /** Three-letter month, as legacy cut it from MONTHS ("Oct", "Sep"). */
  readonly month: string;
  readonly weekday: string;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The parts of a calendar date ('YYYY-MM-DD') the next-events list shows.
 * Read as a calendar date, not an instant: the weekday never depends on the
 * viewer's time zone. null for anything that is not a real date.
 */
export function eventDay(date: string): EventDay | null {
  const parts = CALENDAR_DATE.exec(date);
  if (!parts) return null;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { day, month: MONTHS_SHORT[month - 1], weekday: WEEKDAYS[utc.getUTCDay()] };
}
