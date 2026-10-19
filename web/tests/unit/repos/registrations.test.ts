// S22 — repos/registrations: query shape per legacy js/lib/special-events.js
// + js/pages/eventos/hub.js:58 + registro-wizard.js:478, and G-006. S22b —
// the ReadResult / WriteResult contract: a failed read is `{ ok: false }`,
// never an empty list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { OFFLINE, RLS_DENIED, failure, invalidInput } from './results';
import {
  fetchLiveEvents,
  fetchSpecialEventBy,
  fetchSpecialEventOptions,
  fetchSpecialEventsForCalendar,
  submitRegistrations,
  type EventRegistrationInsert,
} from '#lib/repos/registrations.js';
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
        if (!out.ok) throw new Error(`expected rows, got ${out.error.kind}`);
        expect(out.data.map((e) => e.id)).toEqual(v.expected);
      });
    });

    it('no live events is an empty SUCCESS', async () => {
      mock.results.special_events = [{ data: [] }];
      expect(await fetchLiveEvents({ now: NOW })).toEqual({ ok: true, data: [] });
    });

    it('a failed read is an error, never an empty rail (D-032), warned [registrations]', async () => {
      mock.results.special_events = [{ data: null, error: ERR }];
      const res = await fetchLiveEvents({ now: NOW });
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(warn).toHaveBeenCalledWith('[registrations] fetchLiveEvents:', 'boom');
    });

    it('a prerender with no network is a network error (the page renders loading, not empty)', async () => {
      mock.results.special_events = [
        { data: null, error: { message: 'TypeError: fetch failed', code: '' }, status: 0 },
      ];
      expect(await fetchLiveEvents({ now: NOW })).toEqual(
        failure('network', 'TypeError: fetch failed'),
      );
    });
  });

  describe('fetchSpecialEventBy (special-events.js:188)', () => {
    it('slug wins over id; embeds album refs; maybeSingle', async () => {
      mock.results.special_events = [{ data: { id: 'e' } }];
      expect(await fetchSpecialEventBy({ slug: 'vbs', id: 'e' })).toEqual({
        ok: true,
        data: { id: 'e' },
      });
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('select')).toEqual([`*,${ALBUM_EMBED}`]);
      expect(mock.args('eq')).toEqual(['slug', 'vbs']);
    });
    it('falls back to id', async () => {
      await fetchSpecialEventBy({ id: 'e' });
      expect(mock.args('eq')).toEqual(['id', 'e']);
    });
    it('a successful null without a query when no key; an error on failure', async () => {
      expect(await fetchSpecialEventBy({})).toEqual({ ok: true, data: null });
      expect(mock.queries).toHaveLength(0);
      mock.results.special_events = [{ data: null, error: ERR }];
      const res = await fetchSpecialEventBy({ slug: 'x' });
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: null });
      expect(warn).toHaveBeenCalledWith('[registrations] fetchSpecialEventBy:', 'boom');
    });
  });

  describe('fetchSpecialEventsForCalendar (hub.js:58)', () => {
    it('selects the hub projection ordered by event_at', async () => {
      expect(await fetchSpecialEventsForCalendar()).toEqual({ ok: true, data: [] });
      expect(mock.query().table).toBe('special_events');
      expect(mock.chain()).toEqual(['select', 'order']);
      expect(mock.args('select')).toEqual([
        'id,title,slug,image_url,description,event_at,ends_at,location,registration_open',
      ]);
      expect(mock.args('order')).toEqual(['event_at']);
    });
    it('a failed read is an error, never []', async () => {
      mock.results.special_events = [{ data: null, error: ERR }];
      expect(await fetchSpecialEventsForCalendar()).toEqual(failure('unknown', 'boom'));
    });
  });

  describe('fetchSpecialEventOptions (special-events.js:198)', () => {
    it('id,title,event_at newest first, nulls last', async () => {
      await fetchSpecialEventOptions();
      expect(mock.chain()).toEqual(['select', 'order']);
      expect(mock.args('select')).toEqual(['id,title,event_at']);
      expect(mock.args('order')).toEqual(['event_at', { ascending: false, nullsFirst: false }]);
    });
    it('a failed read is an error, never an empty picker', async () => {
      mock.results.special_events = [OFFLINE];
      expect(await fetchSpecialEventOptions()).toEqual(
        failure('network', 'TypeError: Failed to fetch'),
      );
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
      expect(await submitRegistrations([])).toEqual(
        invalidInput('No hay participantes que inscribir.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('a closed event (the event_reg_insert policy) is kind forbidden; the raw text stays in detail', async () => {
      mock.results.event_registrations = [RLS_DENIED];
      const res = await submitRegistrations([row]);
      expect(res).toEqual(
        failure('forbidden', '42501: new row violates row-level security policy'),
      );
      expect(warn).toHaveBeenCalledWith(
        '[registrations] submitRegistrations:',
        '42501: new row violates row-level security policy',
      );
    });
  });
});
