// S22 — repos/events: query shape per catalogued legacy query. S22b — the
// ReadResult contract: a failed read is `{ ok: false }`, never an empty list
// or a throw, and every read here is public (no session asked).
// Legacy sources: js/main.js:135-139 · js/components/event-detail.js:41 ·
// js/pages/eventos/hub.js:56-57 · js/components/calendar.js:47-58.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NO_SESSION, OFFLINE, SIGNED_OUT, failure, invalidInput } from './results';
import { describeSessionGate } from './session-gate';
import * as events from '#lib/repos/events.js';
import {
  countCalendarEvents,
  countUpcomingSpecialEvents,
  fetchCalendarActivities,
  fetchEventById,
  fetchEventsForCalendar,
  fetchNextCalendarEvents,
  fetchUpcomingEvents,
  subscribeEvents,
} from '#lib/repos/events.js';

const ERR = { message: 'boom' };

describe('repos/events', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchUpcomingEvents (js/main.js:135)', () => {
    it('selects * from events, starts_at >= start-of-day ISO, ascending', async () => {
      const since = new Date(2026, 7, 24, 0, 0, 0, 0);
      mock.results.events = [{ data: [{ id: '1' }] }];
      expect(await fetchUpcomingEvents(since)).toEqual({ ok: true, data: [{ id: '1' }] });
      const q = mock.query();
      expect(q.table).toBe('events');
      expect(mock.chain()).toEqual(['select', 'gte', 'order']);
      expect(mock.args('select')).toEqual(['*']);
      expect(mock.args('gte')).toEqual(['starts_at', since.toISOString()]);
      expect(mock.args('order')).toEqual(['starts_at', { ascending: true }]);
    });

    it('defaults `since` to the local start of today', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 24, 15, 45, 12, 500));
      try {
        await fetchUpcomingEvents();
        expect(mock.args('gte')[1]).toBe(new Date(2026, 7, 24, 0, 0, 0, 0).toISOString());
      } finally {
        vi.useRealTimers();
      }
    });

    it('no upcoming events is an empty SUCCESS', async () => {
      mock.results.events = [{ data: [] }];
      expect(await fetchUpcomingEvents(new Date())).toEqual({ ok: true, data: [] });
      expect(warn).not.toHaveBeenCalled();
    });

    it('a failed read is an error, never an empty list (D-032), warned under [events]', async () => {
      mock.results.events = [{ data: null, error: ERR }];
      const res = await fetchUpcomingEvents(new Date());
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(warn).toHaveBeenCalledWith('[events] fetchUpcomingEvents:', 'boom');
    });

    it('a dropped connection is a network error the view can offer Retry for', async () => {
      mock.results.events = [OFFLINE];
      expect(await fetchUpcomingEvents(new Date())).toEqual(
        failure('network', 'TypeError: Failed to fetch'),
      );
    });

    it('an Invalid Date is refused as invalid, without a query — never a RangeError', async () => {
      await expect(fetchUpcomingEvents(new Date('no es una fecha'))).resolves.toEqual(
        invalidInput('Fecha inválida.'),
      );
      expect(mock.queries).toEqual([]);
    });
  });

  describe('fetchEventById (js/components/event-detail.js:41)', () => {
    it('selects * where id = ?, maybeSingle', async () => {
      mock.results.events = [{ data: { id: 'abc' } }];
      expect(await fetchEventById('abc')).toEqual({ ok: true, data: { id: 'abc' } });
      expect(mock.query().table).toBe('events');
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('eq')).toEqual(['id', 'abc']);
    });

    it('a missing event is a successful null (the not-found page), not an error', async () => {
      mock.results.events = [{ data: null }];
      expect(await fetchEventById('abc')).toEqual({ ok: true, data: null });
    });

    it('an empty id has nothing to look up: null without querying', async () => {
      expect(await fetchEventById('')).toEqual({ ok: true, data: null });
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed lookup is an error, never a null event', async () => {
      mock.results.events = [{ data: null, error: ERR }];
      const res = await fetchEventById('abc');
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: null });
      expect(warn).toHaveBeenCalledWith('[events] fetchEventById:', 'boom');
    });
  });

  describe('fetchEventsForCalendar (hub.js:57 / calendar.js:56)', () => {
    it('selects the hub projection ordered by starts_at', async () => {
      expect(await fetchEventsForCalendar()).toEqual({ ok: true, data: [] });
      expect(mock.query().table).toBe('events');
      expect(mock.chain()).toEqual(['select', 'order']);
      expect(mock.args('select')).toEqual([
        'id,title,starts_at,location,description,image_url,tag',
      ]);
      expect(mock.args('order')).toEqual(['starts_at']);
    });

    it('a failed read is an error, never []', async () => {
      mock.results.events = [{ data: null, error: ERR }];
      expect(await fetchEventsForCalendar()).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[events] fetchEventsForCalendar:', 'boom');
    });
  });

  describe('fetchCalendarActivities (hub.js:56 / calendar.js:48)', () => {
    it('selects the calendar_events projection ordered by date', async () => {
      await fetchCalendarActivities();
      expect(mock.query().table).toBe('calendar_events');
      expect(mock.chain()).toEqual(['select', 'order']);
      expect(mock.args('select')).toEqual([
        'id,title,date,time,location,description,category,cancelled',
      ]);
      expect(mock.args('order')).toEqual(['date']);
    });

    it('a failed read is an error, never []', async () => {
      mock.results.calendar_events = [{ data: null, error: ERR }];
      expect(await fetchCalendarActivities()).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[events] fetchCalendarActivities:', 'boom');
    });
  });

  // S40 — the admin Inicio (js/pages/admin/dashboard.js:38-53). A count that
  // fails or carries no number is `{ ok: false }`, never 0.
  describe('countCalendarEvents (dashboard.js:39-42)', () => {
    it('a head count over [from, to]', async () => {
      mock.results.calendar_events = [{ data: null, count: 7 }];
      expect(await countCalendarEvents({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
        ok: true,
        data: 7,
      });
      expect(mock.query().table).toBe('calendar_events');
      expect(mock.chain()).toEqual(['select', 'gte', 'lte']);
      expect(mock.args('select')).toEqual(['id', { count: 'exact', head: true }]);
      expect(mock.args('gte')).toEqual(['date', '2026-10-01']);
      expect(mock.args('lte')).toEqual(['date', '2026-10-31']);
    });

    it('either bound is optional; zero is a real count', async () => {
      mock.results.calendar_events = [{ data: null, count: 0 }];
      expect(await countCalendarEvents({ from: '2026-10-19' })).toEqual({ ok: true, data: 0 });
      expect(mock.chain()).toEqual(['select', 'gte']);
    });

    it('no count in the answer is a failure, never 0', async () => {
      mock.results.calendar_events = [{ data: null }];
      const res = await countCalendarEvents();
      expect(res).toEqual(failure('unknown', 'the response carried no count'));
      expect(res).not.toEqual({ ok: true, data: 0 });
      expect(warn).toHaveBeenCalledWith(
        '[events] countCalendarEvents:',
        'the response carried no count',
      );
    });

    it('a failed count is an error', async () => {
      mock.results.calendar_events = [OFFLINE];
      expect(await countCalendarEvents()).toEqual(failure('network', 'TypeError: Failed to fetch'));
    });

    it('a malformed date is refused before any request', async () => {
      expect(await countCalendarEvents({ to: '31/10/2026' })).toEqual(
        invalidInput('Las fechas no son válidas.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('is a public read: it works signed out', async () => {
      mock.session = SIGNED_OUT;
      mock.results.calendar_events = [{ data: null, count: 3 }];
      expect(await countCalendarEvents()).toEqual({ ok: true, data: 3 });
    });
  });

  describe('countUpcomingSpecialEvents (dashboard.js:43-45)', () => {
    it('counts events starting at or after the given instant', async () => {
      mock.results.events = [{ data: null, count: 2 }];
      const now = '2026-10-19T14:00:00.000Z';
      expect(await countUpcomingSpecialEvents(now)).toEqual({ ok: true, data: 2 });
      expect(mock.query().table).toBe('events');
      expect(mock.chain()).toEqual(['select', 'gte']);
      expect(mock.args('select')).toEqual(['id', { count: 'exact', head: true }]);
      expect(mock.args('gte')).toEqual(['starts_at', now]);
    });

    it('no count is a failure; a bad instant is refused', async () => {
      mock.results.events = [{ data: null }];
      expect((await countUpcomingSpecialEvents('2026-10-19T14:00:00Z')).ok).toBe(false);
      mock.reset();
      expect(await countUpcomingSpecialEvents('soon')).toEqual(
        invalidInput('La fecha no es válida.'),
      );
      expect(mock.queries).toHaveLength(0);
    });
  });

  describe('fetchNextCalendarEvents (dashboard.js:52-54)', () => {
    it('the next activities from a day, soonest first, with the ministries embed', async () => {
      const rows = [{ id: 'c1', title: 'Culto', ministries: { name: 'Alabanza', color: null } }];
      mock.results.calendar_events = [{ data: rows }];
      expect(await fetchNextCalendarEvents(6, '2026-10-19')).toEqual({ ok: true, data: rows });
      expect(mock.chain()).toEqual(['select', 'gte', 'order', 'limit']);
      expect(mock.args('select')).toEqual([
        'id,title,date,time,location,cancelled,ministries(name,color)',
      ]);
      expect(mock.args('gte')).toEqual(['date', '2026-10-19']);
      expect(mock.args('order')).toEqual(['date', { ascending: true }]);
      expect(mock.args('limit')).toEqual([6]);
    });

    it("defaults to six from the viewer's local today", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 19, 23, 30));
      try {
        await fetchNextCalendarEvents();
        expect(mock.args('gte')).toEqual(['date', '2026-10-19']);
        expect(mock.args('limit')).toEqual([6]);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      [0, 1],
      [500, 50],
      [Number.NaN, 6],
    ])('limit %s → %s', async (limit, expected) => {
      await fetchNextCalendarEvents(limit, '2026-10-19');
      expect(mock.args('limit')).toEqual([expected]);
    });

    it('staff-only: signed out it asks nothing (the embed is not public)', async () => {
      mock.session = SIGNED_OUT;
      expect(await fetchNextCalendarEvents()).toEqual(NO_SESSION);
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed read is an error, never []', async () => {
      mock.results.calendar_events = [{ data: null, error: ERR }];
      const res = await fetchNextCalendarEvents(6, '2026-10-19');
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
    });

    it('a malformed day is refused', async () => {
      expect(await fetchNextCalendarEvents(6, 'hoy')).toEqual(
        invalidInput('La fecha no es válida.'),
      );
    });
  });

  describe('subscribeEvents under prerender (browser=false)', () => {
    it('opens no channel and returns a no-op unsubscribe', () => {
      const off = subscribeEvents(() => {});
      expect(mock.channels).toHaveLength(0);
      expect(() => off()).not.toThrow();
    });
  });

  // RLS: `events_public_read` and `calevents_public_read` let anon read every
  // row; `ministries` has no anon policy, so the embed makes
  // fetchNextCalendarEvents staff-only.
  describeSessionGate(events, '[events]', {
    staffOnly: {
      fetchNextCalendarEvents: () => fetchNextCalendarEvents(6, '2026-10-19'),
    },
    publicCalls: {
      fetchUpcomingEvents: () => fetchUpcomingEvents(new Date(2026, 7, 24)),
      fetchEventById: () => fetchEventById('abc'),
      fetchEventsForCalendar: () => fetchEventsForCalendar(),
      fetchCalendarActivities: () => fetchCalendarActivities(),
      countCalendarEvents: () => {
        mock.results.calendar_events = [{ data: null, count: 3 }];
        return countCalendarEvents({ from: '2026-10-19' });
      },
      countUpcomingSpecialEvents: () => {
        mock.results.events = [{ data: null, count: 1 }];
        return countUpcomingSpecialEvents('2026-10-19T14:00:00.000Z');
      },
    },
    notRepoCalls: ['subscribeEvents'],
  });
});
