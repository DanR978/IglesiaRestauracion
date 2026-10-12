// S22 — repos/registrations: query shape per legacy js/lib/special-events.js
// + js/pages/eventos/hub.js:58 + registro-wizard.js:478, and G-006.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  fetchLiveEvents,
  fetchSpecialEventBy,
  fetchSpecialEventOptions,
  fetchSpecialEventsForCalendar,
  submitRegistrations,
  type EventRegistrationInsert,
} from '$lib/repos/registrations';
import fixtureJson from '../../fixtures/special-events.json';

const ERR = { message: 'boom' };
const NOW = Date.parse('2026-08-24T18:00:00Z');
const ALBUM_EMBED = 'gallery_albums(id,slug,title,photo_count,is_published)';

type LiveVector = {
  input: { rows: Record<string, unknown>[]; now: number; limit: number };
  expected: string[];
  note?: string;
};
const liveVectors = (fixtureJson as unknown as { fetchLiveEvents: LiveVector[] }).fetchLiveEvents;

describe('repos/registrations', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchLiveEvents (special-events.js:173)', () => {
    it('selects the card projection with the linger-window .or() and event_at asc', async () => {
      await fetchLiveEvents({ now: NOW });
      expect(mock.query().table).toBe('special_events');
      expect(mock.chain()).toEqual(['select', 'or', 'order']);
      expect(mock.args('select')).toEqual([
        `id,title,slug,image_url,event_at,ends_at,location,registration_open,status,${ALBUM_EMBED}`,
      ]);
      // floor = now − (LINGER_DAYS + 1) days = 8 days
      const floor = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(mock.args('or')).toEqual([
        `ends_at.gte.${floor},event_at.gte.${floor},event_at.is.null`,
      ]);
      expect(mock.args('order')).toEqual(['event_at', { ascending: true, nullsFirst: false }]);
    });

    it('defaults `now` to Date.now()', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(NOW));
      try {
        await fetchLiveEvents();
        const floor = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString();
        expect(String(mock.args('or')[0])).toContain(`ends_at.gte.${floor}`);
      } finally {
        vi.useRealTimers();
      }
    });

    // Golden: the legacy client-side pipeline (visibility filter → phase/date
    // sort → limit) run over the same canned rows with Date.now pinned.
    liveVectors.forEach((v, i) => {
      it(`golden: filter/sort/limit [${i}]${v.note ? ` — ${v.note}` : ''}`, async () => {
        mock.results.special_events = [{ data: v.input.rows }];
        const out = await fetchLiveEvents({ now: v.input.now, limit: v.input.limit });
        expect(out.map((e) => e.id)).toEqual(v.expected);
      });
    });

    it('[] and a [registrations] warning on error', async () => {
      mock.results.special_events = [{ data: null, error: ERR }];
      expect(await fetchLiveEvents({ now: NOW })).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[registrations] fetchLiveEvents:', 'boom');
    });
  });

  describe('fetchSpecialEventBy (special-events.js:188)', () => {
    it('slug wins over id; embeds album refs; maybeSingle', async () => {
      mock.results.special_events = [{ data: { id: 'e' } }];
      expect(await fetchSpecialEventBy({ slug: 'vbs', id: 'e' })).toEqual({ id: 'e' });
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('select')).toEqual([`*,${ALBUM_EMBED}`]);
      expect(mock.args('eq')).toEqual(['slug', 'vbs']);
    });
    it('falls back to id', async () => {
      await fetchSpecialEventBy({ id: 'e' });
      expect(mock.args('eq')).toEqual(['id', 'e']);
    });
    it('null without a query when no key, null on error', async () => {
      expect(await fetchSpecialEventBy({})).toBeNull();
      expect(mock.queries).toHaveLength(0);
      mock.results.special_events = [{ data: null, error: ERR }];
      expect(await fetchSpecialEventBy({ slug: 'x' })).toBeNull();
      expect(warn).toHaveBeenCalledWith('[registrations] fetchSpecialEventBy:', 'boom');
    });
  });

  describe('fetchSpecialEventsForCalendar (hub.js:58)', () => {
    it('selects the hub projection ordered by event_at', async () => {
      await fetchSpecialEventsForCalendar();
      expect(mock.query().table).toBe('special_events');
      expect(mock.chain()).toEqual(['select', 'order']);
      expect(mock.args('select')).toEqual([
        'id,title,slug,image_url,description,event_at,ends_at,location,registration_open',
      ]);
      expect(mock.args('order')).toEqual(['event_at']);
    });
    it('[] on error', async () => {
      mock.results.special_events = [{ data: null, error: ERR }];
      expect(await fetchSpecialEventsForCalendar()).toEqual([]);
    });
  });

  describe('fetchSpecialEventOptions (special-events.js:198)', () => {
    it('id,title,event_at newest first, nulls last', async () => {
      await fetchSpecialEventOptions();
      expect(mock.chain()).toEqual(['select', 'order']);
      expect(mock.args('select')).toEqual(['id,title,event_at']);
      expect(mock.args('order')).toEqual(['event_at', { ascending: false, nullsFirst: false }]);
    });
    it('[] on error', async () => {
      mock.results.special_events = [{ data: null, error: ERR }];
      expect(await fetchSpecialEventOptions()).toEqual([]);
    });
  });

  describe('submitRegistrations (registro-wizard.js:478) — G-006', () => {
    const row: EventRegistrationInsert = {
      event_id: 'e',
      first_name: 'Ana',
      last_name: 'López',
      age: 9,
      contact_name: 'Luis',
      contact_phone: '617',
      relationship: 'Padre',
    };

    it('inserts every row in ONE call with NO .select() chained', async () => {
      const res = await submitRegistrations([row, { ...row, first_name: 'Eva' }]);
      expect(res).toEqual({ ok: true, data: undefined });
      expect(mock.queries).toHaveLength(1);
      expect(mock.query().table).toBe('event_registrations');
      expect(mock.chain()).toEqual(['insert']);
      expect(mock.chain()).not.toContain('select');
      expect(mock.args('insert')).toEqual([[row, { ...row, first_name: 'Eva' }]]);
    });

    it('rejects an empty batch without a network call', async () => {
      expect((await submitRegistrations([])).ok).toBe(false);
      expect(mock.queries).toHaveLength(0);
    });

    it('returns { ok:false, error } with the RLS message when the event is closed', async () => {
      mock.results.event_registrations = [
        { data: null, error: { message: 'new row violates row-level security policy' } },
      ];
      expect(await submitRegistrations([row])).toEqual({
        ok: false,
        error: 'new row violates row-level security policy',
      });
      expect(warn).toHaveBeenCalledWith(
        '[registrations] submitRegistrations:',
        'new row violates row-level security policy',
      );
    });
  });
});
