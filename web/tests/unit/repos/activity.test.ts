// S40 — repos/activity: the audit log for Inicio (S41) and Actividad (S42).
// Legacy source: js/pages/admin/activity-tab.js loadActivity() — one query
// capped at 100 rows with no way past it (PORT-DEBT S42). Pages are keyset on
// (created_at, id). Staff-only (developer tier).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NO_SESSION, OFFLINE, RLS_DENIED, SIGNED_OUT, failure, invalidInput } from './results';
import { describeSessionGate } from './session-gate';
import * as activity from '#lib/repos/activity.js';
import { ACTIVITY_PAGE_SIZE, fetchActivityPage, fetchRecentActivity } from '#lib/repos/activity.js';

const COLS = 'id,actor_id,actor_name,action,entity,entity_id,label,created_at';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n: number) => ({
  id: id(n),
  actor_id: null,
  actor_name: 'Ana',
  action: 'UPDATE',
  entity: 'events',
  entity_id: 'e1',
  label: null,
  created_at: `2026-10-${String(30 - n).padStart(2, '0')}T12:00:00.123456+00:00`,
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));

describe('repos/activity', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchRecentActivity', () => {
    it('reads the latest rows newest first, 10 by default', async () => {
      mock.results.audit_log = [{ data: rows(2) }];
      expect(await fetchRecentActivity()).toEqual({ ok: true, data: rows(2) });
      expect(mock.query().table).toBe('audit_log');
      expect(mock.chain()).toEqual(['select', 'order', 'order', 'limit']);
      expect(mock.args('select')).toEqual([COLS]);
      expect(mock.query().calls[1].args).toEqual(['created_at', { ascending: false }]);
      expect(mock.query().calls[2].args).toEqual(['id', { ascending: false }]);
      expect(mock.args('limit')).toEqual([10]);
    });

    it.each([
      [5, 5],
      [0, 1],
      [-3, 1],
      [2.7, 2],
      [1000, 100],
      [Number.NaN, 10],
    ])('limit %s → %s rows', async (limit, expected) => {
      await fetchRecentActivity({ limit });
      expect(mock.args('limit')).toEqual([expected]);
    });

    it('no activity is an empty SUCCESS; a failed read is an error, never []', async () => {
      expect(await fetchRecentActivity()).toEqual({ ok: true, data: [] });
      mock.results.audit_log = [OFFLINE];
      const res = await fetchRecentActivity();
      expect(res).toEqual(failure('network', 'TypeError: Failed to fetch'));
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(warn).toHaveBeenCalledWith(
        '[activity] fetchRecentActivity:',
        'TypeError: Failed to fetch',
      );
    });

    it('signed out is an auth failure — never "no activity yet"', async () => {
      mock.session = SIGNED_OUT;
      expect(await fetchRecentActivity()).toEqual(NO_SESSION);
      expect(mock.queries).toHaveLength(0);
    });

    it('a tier refusal (42501) is forbidden', async () => {
      mock.results.audit_log = [RLS_DENIED];
      expect((await fetchRecentActivity()).ok).toBe(false);
    });
  });

  describe('fetchActivityPage', () => {
    it('first page: no cursor filter, one row past the page size', async () => {
      mock.results.audit_log = [{ data: rows(3) }];
      expect(await fetchActivityPage()).toEqual({
        ok: true,
        data: { entries: rows(3), next: null },
      });
      expect(mock.chain()).toEqual(['select', 'order', 'order', 'limit']);
      expect(mock.args('limit')).toEqual([ACTIVITY_PAGE_SIZE + 1]);
    });

    it('a full page plus one row says there is more: next is the last row shown', async () => {
      mock.results.audit_log = [{ data: rows(3) }];
      const res = await fetchActivityPage({ limit: 2 });
      expect(res).toEqual({
        ok: true,
        data: { entries: rows(2), next: { created_at: row(2).created_at, id: row(2).id } },
      });
      expect(mock.args('limit')).toEqual([3]);
    });

    it('exactly a full page is the last page', async () => {
      mock.results.audit_log = [{ data: rows(2) }];
      const res = await fetchActivityPage({ limit: 2 });
      expect(res.ok && res.data.next).toBeNull();
    });

    it('a cursor continues strictly after (created_at, id), quoting the timestamp', async () => {
      const before = { created_at: row(2).created_at, id: row(2).id };
      await fetchActivityPage({ before, limit: 2 });
      expect(mock.chain()).toEqual(['select', 'or', 'order', 'order', 'limit']);
      const at = `"${before.created_at}"`;
      expect(mock.args('or')).toEqual([
        `created_at.lt.${at},and(created_at.eq.${at},id.lt.${before.id})`,
      ]);
    });

    it.each([
      ['a non-timestamp', { created_at: 'yesterday', id: id(1) }],
      [
        'a filter smuggled into the timestamp',
        { created_at: '2026-10-01T00:00:00Z",id.gt.0', id: id(1) },
      ],
      ['a non-UUID id', { created_at: row(1).created_at, id: '1),or(id.gt.0' }],
    ])('refuses %s before any request', async (_label, before) => {
      expect(await fetchActivityPage({ before })).toEqual(
        invalidInput('No pudimos cargar más actividad. Recarga la página e inténtalo de nuevo.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed page is an error, never an empty page', async () => {
      mock.results.audit_log = [{ data: null, error: { message: 'boom' } }];
      const res = await fetchActivityPage();
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: { entries: [], next: null } });
    });

    it('signed out is an auth failure', async () => {
      mock.session = SIGNED_OUT;
      expect(await fetchActivityPage()).toEqual(NO_SESSION);
    });
  });
  // RLS: `audit_log` reads need has_system_tab('activity') in an aal2 session.
  describeSessionGate(activity, '[activity]', {
    staffOnly: {
      fetchRecentActivity: () => fetchRecentActivity(),
      fetchActivityPage: () => fetchActivityPage({ limit: 2 }),
    },
  });
});
