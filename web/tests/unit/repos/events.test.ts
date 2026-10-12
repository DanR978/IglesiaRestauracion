// S22 — repos/events: query shape per catalogued legacy query + never-throw.
// Legacy sources: js/main.js:135-139 · js/components/event-detail.js:41 ·
// js/pages/eventos/hub.js:56-57 · js/components/calendar.js:47-58.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  fetchCalendarActivities,
  fetchEventById,
  fetchEventsForCalendar,
  fetchUpcomingEvents,
  subscribeEvents,
} from '$lib/repos/events';

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
      const rows = await fetchUpcomingEvents(since);
      expect(rows).toEqual([{ id: '1' }]);
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

    it('never throws: warns with the [events] tag and returns []', async () => {
      mock.results.events = [{ data: null, error: ERR }];
      await expect(fetchUpcomingEvents(new Date())).resolves.toEqual([]);
      expect(warn).toHaveBeenCalledWith('[events] fetchUpcomingEvents:', 'boom');
    });
  });

  describe('fetchEventById (js/components/event-detail.js:41)', () => {
    it('selects * where id = ?, maybeSingle', async () => {
      mock.results.events = [{ data: { id: 'abc' } }];
      expect(await fetchEventById('abc')).toEqual({ id: 'abc' });
      expect(mock.query().table).toBe('events');
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('eq')).toEqual(['id', 'abc']);
    });

    it('returns null without querying for an empty id', async () => {
      expect(await fetchEventById('')).toBeNull();
      expect(mock.queries).toHaveLength(0);
    });

    it('returns null (not throw) on error', async () => {
      mock.results.events = [{ data: null, error: ERR }];
      expect(await fetchEventById('abc')).toBeNull();
      expect(warn).toHaveBeenCalledWith('[events] fetchEventById:', 'boom');
    });
  });

  describe('fetchEventsForCalendar (hub.js:57 / calendar.js:56)', () => {
    it('selects the hub projection ordered by starts_at', async () => {
      await fetchEventsForCalendar();
      expect(mock.query().table).toBe('events');
      expect(mock.chain()).toEqual(['select', 'order']);
      expect(mock.args('select')).toEqual([
        'id,title,starts_at,location,description,image_url,tag',
      ]);
      expect(mock.args('order')).toEqual(['starts_at']);
    });

    it('returns [] on error', async () => {
      mock.results.events = [{ data: null, error: ERR }];
      expect(await fetchEventsForCalendar()).toEqual([]);
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

    it('returns [] on error', async () => {
      mock.results.calendar_events = [{ data: null, error: ERR }];
      expect(await fetchCalendarActivities()).toEqual([]);
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
});
