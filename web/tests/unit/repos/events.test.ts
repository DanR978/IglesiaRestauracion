// S22 — repos/events: query shape per catalogued legacy query. S22b — the
// ReadResult contract: a failed read is `{ ok: false }`, never an empty list
// or a throw, and every read here is public (no session asked).
// Legacy sources: js/main.js:135-139 · js/components/event-detail.js:41 ·
// js/pages/eventos/hub.js:56-57 · js/components/calendar.js:47-58.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { OFFLINE, failure, invalidInput } from './results';
import { describeSessionGate } from './session-gate';
import * as events from '#lib/repos/events.js';
import {
  fetchCalendarActivities,
  fetchEventById,
  fetchEventsForCalendar,
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

  describe('subscribeEvents under prerender (browser=false)', () => {
    it('opens no channel and returns a no-op unsubscribe', () => {
      const off = subscribeEvents(() => {});
      expect(mock.channels).toHaveLength(0);
      expect(() => off()).not.toThrow();
    });
  });

  // RLS: `events_public_read` and `calevents_public_read` let anon read every row.
  describeSessionGate(events, '[events]', {
    publicCalls: {
      fetchUpcomingEvents: () => fetchUpcomingEvents(new Date(2026, 7, 24)),
      fetchEventById: () => fetchEventById('abc'),
      fetchEventsForCalendar: () => fetchEventsForCalendar(),
      fetchCalendarActivities: () => fetchCalendarActivities(),
    },
    notRepoCalls: ['subscribeEvents'],
  });
});
