// S41 — the non-visual half of Inicio (components/admin/dashboard/dashboard.ts):
// the day and month a load counts (month edges, leap years, the viewer's zone,
// G-002), each tile's read and who sees it (D-006 — an ungated tile would show
// RLS's empty answer as a misleading 0), the greeting and the event dates.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capability, SurfaceKey } from '#lib/auth/surfaces.js';
import {
  PENDING_ATTENTION,
  TILES,
  eventDay,
  greeting,
  instantOf,
} from '#lib/components/admin/dashboard/dashboard.js';

const h = vi.hoisted(() => ({
  countCalendarEvents: vi.fn(),
  countUpcomingSpecialEvents: vi.fn(),
  countPendingInterests: vi.fn(),
  countAlbums: vi.fn(),
  fetchBooksSummary: vi.fn(),
}));

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
vi.mock('#lib/repos/events.js', () => ({
  countCalendarEvents: h.countCalendarEvents,
  countUpcomingSpecialEvents: h.countUpcomingSpecialEvents,
}));
vi.mock('#lib/repos/discipleship.js', () => ({ countPendingInterests: h.countPendingInterests }));
vi.mock('#lib/repos/gallery.js', () => ({ countAlbums: h.countAlbums }));
vi.mock('#lib/repos/treasury/index.js', () => ({ fetchBooksSummary: h.fetchBooksSummary }));

const ok = <T>(data: T) => ({ ok: true as const, data });
const failed = (message = 'No pudimos conectar con el servidor.') => ({
  ok: false as const,
  error: { kind: 'network' as const, message },
});

const tile = (key: string) => {
  const found = TILES.find((t) => t.key === key);
  if (!found) throw new Error(`no tile ${key}`);
  return found;
};

/** Run `fn` with the process in another zone (Node re-reads TZ on assignment). */
function inZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

const access = (keys: SurfaceKey[], capabilities: Capability[] = []) => ({
  has: (key: SurfaceKey) => keys.includes(key),
  can: (capability: Capability) => capabilities.includes(capability),
});

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('instantOf — the day and month a load counts', () => {
  const NY = 'America/New_York';

  it.each([
    [
      'the last moment of January',
      [2026, 0, 31, 23, 59, 59, 999],
      '2026-01-31',
      '2026-01-01',
      '2026-01-31',
    ],
    [
      'the first moment of February',
      [2026, 1, 1, 0, 0, 0, 0],
      '2026-02-01',
      '2026-02-01',
      '2026-02-28',
    ],
    [
      'February of a leap year',
      [2028, 1, 15, 12, 0, 0, 0],
      '2028-02-15',
      '2028-02-01',
      '2028-02-29',
    ],
    [
      'a 30-day month, on its last day',
      [2026, 3, 30, 22, 0, 0, 0],
      '2026-04-30',
      '2026-04-01',
      '2026-04-30',
    ],
    ['New Year’s Eve', [2026, 11, 31, 23, 59, 0, 0], '2026-12-31', '2026-12-01', '2026-12-31'],
    ['New Year’s Day', [2027, 0, 1, 0, 0, 0, 0], '2027-01-01', '2027-01-01', '2027-01-31'],
  ])('%s', (_label, parts, today, start, end) => {
    inZone(NY, () => {
      const [y, m, d, hh, mm, ss, ms] = parts;
      const at = instantOf(new Date(y, m, d, hh, mm, ss, ms));
      expect(at.today).toBe(today);
      expect(at.month).toEqual({ start, end });
    });
  });

  it('reads the month in the viewer’s zone, not UTC', () => {
    const instant = new Date('2026-11-01T03:30:00Z');
    expect(inZone(NY, () => instantOf(instant)).month).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(inZone('Asia/Tokyo', () => instantOf(instant)).month).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
  });

  it('starts the day at local midnight, across both DST changes', () => {
    inZone(NY, () => {
      expect(instantOf(new Date(2026, 2, 8, 10)).dayStart).toBe('2026-03-08T05:00:00.000Z');
      expect(instantOf(new Date(2026, 2, 9, 10)).dayStart).toBe('2026-03-09T04:00:00.000Z');
      expect(instantOf(new Date(2026, 10, 1, 23)).dayStart).toBe('2026-11-01T04:00:00.000Z');
      expect(instantOf(new Date(2026, 10, 2, 0, 30)).dayStart).toBe('2026-11-02T05:00:00.000Z');
    });
  });
});

describe('TILES — who sees what', () => {
  const visibleTo = (a: ReturnType<typeof access>) =>
    TILES.filter((t) => t.visible(a)).map((t) => t.key);

  it('lists the five tiles in a fixed order, each with an honest scope', () => {
    expect(TILES.map((t) => [t.key, t.label, t.scope])).toEqual([
      ['upcoming', 'Próximos eventos', 'Desde hoy'],
      ['month', 'Eventos este mes', 'Calendario · este mes'],
      ['interests', 'Interesados pendientes', 'Discipulado · por contactar'],
      ['albums', 'Álbumes', 'Galería · incluye borradores'],
      ['balance', 'Balance', 'Este mes · libros de la iglesia'],
    ]);
  });

  it('shows nothing to an account perms has not cleared', () => {
    expect(visibleTo(access([]))).toEqual([]);
  });

  it('shows the calendar counts to any staff account', () => {
    expect(visibleTo(access(['inicio', 'cuenta']))).toEqual(['upcoming', 'month']);
  });

  it('gates each other tile on its own key or capability', () => {
    expect(visibleTo(access(['inicio', 'discipulado']))).toEqual([
      'upcoming',
      'month',
      'interests',
    ]);
    expect(visibleTo(access(['inicio', 'galeria']))).toEqual(['upcoming', 'month', 'albums']);
    expect(visibleTo(access(['inicio', 'treasury']))).toEqual(['upcoming', 'month']);
    expect(visibleTo(access(['inicio'], ['church-books']))).toEqual([
      'upcoming',
      'month',
      'balance',
    ]);
  });
});

describe('TILES — reads', () => {
  const at = {
    today: '2026-10-19',
    dayStart: '2026-10-19T04:00:00.000Z',
    month: { start: '2026-10-01', end: '2026-10-31' },
  };

  it('Próximos eventos: calendar events from today plus special events from today’s start, as one count', async () => {
    h.countCalendarEvents.mockResolvedValue(ok(7));
    h.countUpcomingSpecialEvents.mockResolvedValue(ok(2));
    expect(await tile('upcoming').read(at)).toEqual(ok({ text: '9' }));
    expect(h.countCalendarEvents).toHaveBeenCalledWith({ from: '2026-10-19' });
    expect(h.countUpcomingSpecialEvents).toHaveBeenCalledWith('2026-10-19T04:00:00.000Z');
  });

  it('Próximos eventos: either count failing fails the tile — never a partial sum', async () => {
    h.countCalendarEvents.mockResolvedValue(failed('calendario'));
    h.countUpcomingSpecialEvents.mockResolvedValue(ok(2));
    expect(await tile('upcoming').read(at)).toEqual(failed('calendario'));

    h.countCalendarEvents.mockResolvedValue(ok(7));
    h.countUpcomingSpecialEvents.mockResolvedValue(failed('especiales'));
    expect(await tile('upcoming').read(at)).toEqual(failed('especiales'));
  });

  it('Eventos este mes: the calendar between the month’s first and last day', async () => {
    h.countCalendarEvents.mockResolvedValue(ok(12));
    expect(await tile('month').read(at)).toEqual(ok({ text: '12' }));
    expect(h.countCalendarEvents).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('Interesados pendientes: warn emphasis with words only while someone waits', async () => {
    h.countPendingInterests.mockResolvedValue(ok(3));
    expect(await tile('interests').read(at)).toEqual(
      ok({ text: '3', tone: 'warn', attention: PENDING_ATTENTION }),
    );
    h.countPendingInterests.mockResolvedValue(ok(0));
    expect(await tile('interests').read(at)).toEqual(ok({ text: '0' }));
  });

  it('Álbumes: the album count', async () => {
    h.countAlbums.mockResolvedValue(ok(14));
    expect(await tile('albums').read(at)).toEqual(ok({ text: '14' }));
  });

  it('Balance: this month’s church books in dollars, negative in its own tone', async () => {
    const summary = (balanceCents: number) =>
      ok({
        incomeCents: 0,
        expensesCents: 0,
        balanceCents,
        openPayablesCents: 0,
        byAllocation: {},
      });
    h.fetchBooksSummary.mockResolvedValue(summary(345_000));
    expect(await tile('balance').read(at)).toEqual(ok({ text: '$3,450.00', money: true }));
    expect(h.fetchBooksSummary).toHaveBeenCalledWith({ start: '2026-10-01', end: '2026-10-31' });

    h.fetchBooksSummary.mockResolvedValue(summary(-12_550));
    expect(await tile('balance').read(at)).toEqual(
      ok({ text: '-$125.50', money: true, tone: 'negative' }),
    );
    h.fetchBooksSummary.mockResolvedValue(summary(0));
    expect(await tile('balance').read(at)).toEqual(ok({ text: '$0.00', money: true }));
  });

  it('passes every failure through as the error, never as a figure', async () => {
    h.countCalendarEvents.mockResolvedValue(failed());
    h.countPendingInterests.mockResolvedValue(failed());
    h.countAlbums.mockResolvedValue(failed());
    h.fetchBooksSummary.mockResolvedValue(failed());
    for (const key of ['month', 'interests', 'albums', 'balance']) {
      expect(await tile(key).read(at), key).toEqual(failed());
    }
  });
});

describe('greeting', () => {
  it('greets by the display name’s first word, as legacy did', () => {
    expect(greeting('Ana María López')).toBe('Hola, Ana');
    expect(greeting('  Luis\tGarcía ')).toBe('Hola, Luis');
    expect(greeting('Pastor Raúl García')).toBe('Hola, Pastor');
  });

  it('says only "Hola" without a name', () => {
    for (const name of [null, undefined, '', '   ']) expect(greeting(name)).toBe('Hola');
  });
});

describe('eventDay — a calendar date in words', () => {
  it('gives the day, the legacy three-letter month and the weekday', () => {
    expect(eventDay('2026-10-19')).toEqual({ day: 19, month: 'Oct', weekday: 'Lunes' });
    expect(eventDay('2026-09-06')).toEqual({ day: 6, month: 'Sep', weekday: 'Domingo' });
    expect(eventDay('2028-02-29')).toEqual({ day: 29, month: 'Feb', weekday: 'Martes' });
  });

  it('does not move with the viewer’s zone', () => {
    for (const tz of [
      'America/New_York',
      'Asia/Tokyo',
      'Pacific/Kiritimati',
      'Pacific/Pago_Pago',
    ]) {
      expect(
        inZone(tz, () => eventDay('2026-03-08')),
        tz,
      ).toEqual({
        day: 8,
        month: 'Mar',
        weekday: 'Domingo',
      });
    }
  });

  it('refuses what is not a real date', () => {
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-10-32', '19/10/2026', '']) {
      expect(eventDay(bad), bad).toBeNull();
    }
  });
});
