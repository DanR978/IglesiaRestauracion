// S22 — repos/discipleship: query shape per legacy js/lib/discipleship.js and
// G-006 (no .select() on the anon interest insert). S22b — the ReadResult /
// WriteResult contract: a failed read is `{ ok: false }`, never an empty list,
// a delete that matched no row is `not_found` (D-027), and a staff-only call
// made signed out is `auth` before any query.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  NOT_FOUND,
  NO_SESSION,
  OFFLINE,
  RLS_DENIED,
  SIGNED_OUT,
  failure,
  invalidInput,
} from './results';
import { describeSessionGate } from './session-gate';
import * as discipleship from '#lib/repos/discipleship.js';
import {
  addMember,
  deleteGroup,
  fetchAllGroups,
  fetchGroupById,
  fetchInterests,
  fetchMembers,
  fetchMessages,
  fetchPublicGroupBy,
  fetchPublicGroups,
  markGroupCompleted,
  moveMember,
  removeMember,
  sendMessage,
  submitInterest,
  subscribeGroups,
  subscribeInterests,
  updateInterestStatus,
  upsertGroup,
} from '#lib/repos/discipleship.js';

const ERR = { message: 'boom' };

describe('repos/discipleship', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchPublicGroups (discipleship.js:98)', () => {
    it('published, status in (open, active), starts_on asc nulls last', async () => {
      mock.results.discipleship_groups = [{ data: [{ id: 'g' }] }];
      expect(await fetchPublicGroups()).toEqual({ ok: true, data: [{ id: 'g' }] });
      expect(mock.query().table).toBe('discipleship_groups');
      expect(mock.chain()).toEqual(['select', 'eq', 'in', 'order']);
      expect(mock.args('eq')).toEqual(['is_published', true]);
      expect(mock.args('in')).toEqual(['status', ['open', 'active']]);
      expect(mock.args('order')).toEqual(['starts_on', { ascending: true, nullsFirst: false }]);
    });
    it('a failed read is an error, never an empty list (D-032), tagged [discipulado]', async () => {
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      const res = await fetchPublicGroups();
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(warn).toHaveBeenCalledWith('[discipulado] fetchPublicGroups:', 'boom');
    });
    it('a dropped connection is a network error', async () => {
      mock.results.discipleship_groups = [OFFLINE];
      expect(await fetchPublicGroups()).toEqual(failure('network', 'TypeError: Failed to fetch'));
    });
  });

  describe('fetchAllGroups (discipleship.js:118)', () => {
    it('newest start first, then created_at desc', async () => {
      expect(await fetchAllGroups()).toEqual({ ok: true, data: [] });
      expect(mock.chain()).toEqual(['select', 'order', 'order']);
      expect(mock.query().calls[1].args).toEqual([
        'starts_on',
        { ascending: false, nullsFirst: false },
      ]);
      expect(mock.query().calls[2].args).toEqual(['created_at', { ascending: false }]);
    });
    it('a failed read is an error, never []', async () => {
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await fetchAllGroups()).toEqual(failure('unknown', 'boom'));
    });
  });

  describe('fetchGroupById / fetchPublicGroupBy (discipleship.js:129,136)', () => {
    it('admin lookup ignores is_published', async () => {
      await fetchGroupById('g');
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('eq')).toEqual(['id', 'g']);
    });
    it('public lookup requires is_published and applies both keys', async () => {
      await fetchPublicGroupBy({ id: 'g', slug: 's' });
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['is_published', true],
        ['id', 'g'],
        ['slug', 's'],
        [],
      ]);
    });
    it('a successful null without a query when no key is given', async () => {
      expect(await fetchGroupById('')).toEqual({ ok: true, data: null });
      expect(await fetchPublicGroupBy()).toEqual({ ok: true, data: null });
      expect(mock.queries).toHaveLength(0);
    });
    it('a failed lookup is an error, never a null group', async () => {
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await fetchPublicGroupBy({ slug: 's' })).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[discipulado] fetchPublicGroupBy:', 'boom');
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await fetchGroupById('g')).toEqual(failure('unknown', 'boom'));
    });
  });

  describe('upsertGroup / deleteGroup / markGroupCompleted', () => {
    it('inserts with a slug derived from the name', async () => {
      mock.results.discipleship_groups = [{ data: { id: 'n' } }];
      const res = await upsertGroup({ name: 'Grupo Jóvenes', level: 1 });
      expect(res).toEqual({ ok: true, data: { id: 'n' } });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')[0]).toMatchObject({ slug: 'grupo-jovenes' });
    });
    it('updates by id', async () => {
      mock.results.discipleship_groups = [{ data: { id: 'g' } }];
      await upsertGroup({ id: 'g', name: 'X', slug: 'x' });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
      expect(mock.args('eq')).toEqual(['id', 'g']);
    });
    it('markGroupCompleted is an update to status=completed', async () => {
      mock.results.discipleship_groups = [{ data: { id: 'g' } }];
      await markGroupCompleted('g');
      expect(mock.args('update')).toEqual([{ id: 'g', status: 'completed' }]);
    });
    it('returns the mapped error on failure', async () => {
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await upsertGroup({ name: 'X' })).toEqual(failure('unknown', 'boom'));
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await deleteGroup('g')).toEqual(failure('unknown', 'boom'));
    });
    it('deleteGroup deletes by id and must remove a row (D-027)', async () => {
      mock.results.discipleship_groups = [{ count: 1 }];
      expect(await deleteGroup('g')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('delete')).toEqual([{ count: 'exact' }]);
      mock.reset();
      mock.results.discipleship_groups = [{ count: 0 }];
      expect(await deleteGroup('g')).toEqual(NOT_FOUND);
      expect(warn).toHaveBeenCalledWith('[discipulado] deleteGroup:', 'no row was affected');
    });
  });

  describe('submitInterest (discipleship.js:180) — G-006', () => {
    it('inserts into discipleship_interests with NO .select() chained', async () => {
      const res = await submitInterest({ full_name: ' Ana ', phone: '617', source: 'x' });
      expect(res.ok).toBe(true);
      expect(mock.query().table).toBe('discipleship_interests');
      expect(mock.chain()).toEqual(['insert']);
      expect(mock.chain()).not.toContain('select');
    });

    it('normalises the row like legacy (trim, empty → null, defaults)', async () => {
      const res = await submitInterest({
        full_name: 'Ana López',
        email: '  ',
        phone: ' 617 ',
        experience_level: '3',
        message: ' hola ',
        can_host: false,
        has_transportation: null,
        bringing_family: '',
        home_address: ' 1 Main ',
      });
      const row = mock.args('insert')[0];
      expect(row).toEqual({
        full_name: 'Ana López',
        email: null,
        phone: '617',
        preferred_day: null,
        preferred_time: null,
        experience_level: 3,
        message: 'hola',
        source: 'public_form',
        target_group_id: null,
        can_host: false,
        home_address: '1 Main',
        has_transportation: null,
        bringing_family: null,
        age_range: null,
        gender: null,
      });
      expect(res).toEqual({ ok: true, data: row });
    });

    it('validates before touching the network', async () => {
      expect(await submitInterest({ phone: '1' })).toEqual(
        invalidInput('Por favor escribe tu nombre.'),
      );
      expect(await submitInterest({ full_name: 'A' })).toEqual(
        invalidInput('Necesitamos al menos un correo o teléfono para contactarte.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('maps the Supabase error — the raw message never reaches the visitor', async () => {
      mock.results.discipleship_interests = [{ data: null, error: ERR }];
      expect(await submitInterest({ full_name: 'A', email: 'a@b.c' })).toEqual(
        failure('unknown', 'boom'),
      );
      expect(warn).toHaveBeenCalledWith('[discipulado] submitInterest:', 'boom');
    });

    it('a dropped connection on the public form is a network error', async () => {
      mock.results.discipleship_interests = [OFFLINE];
      const res = await submitInterest({ full_name: 'A', email: 'a@b.c' });
      expect(res.ok === false && res.error.kind).toBe('network');
    });
  });

  describe('fetchInterests / updateInterestStatus', () => {
    it('newest first, optional status filter', async () => {
      await fetchInterests({ status: 'pending' });
      expect(mock.chain()).toEqual(['select', 'order', 'eq']);
      expect(mock.args('order')).toEqual(['created_at', { ascending: false }]);
      expect(mock.args('eq')).toEqual(['status', 'pending']);
      mock.reset();
      await fetchInterests();
      expect(mock.chain()).toEqual(['select', 'order']);
    });
    // RLS filters a SELECT, it does not refuse it: signed out, the anon key
    // reads `discipleship_interests` as an empty 200 — "no interests yet".
    it('signed out is auth before any query — never "no interests yet"', async () => {
      mock.session = SIGNED_OUT;
      const res = await fetchInterests();
      expect(res).toEqual(NO_SESSION);
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(mock.queries).toEqual([]);
    });
    // The session check cannot tell a live session that RLS filters down to
    // nothing (not staff, no `discipulado` tab) from a table with no rows:
    // both are an empty 200. That is RLS being the boundary (D-002); the view
    // decides who reaches this screen.
    it('signed in, an RLS-filtered read is indistinguishable from an empty one', async () => {
      mock.results.discipleship_interests = [{ data: [] }];
      expect(await fetchInterests()).toEqual({ ok: true, data: [] });
    });
    it('placed records the group + contacted_at; other statuses clear the group', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
      try {
        await updateInterestStatus('i', 'placed', 'g');
        expect(mock.args('update')).toEqual([
          { status: 'placed', assigned_group_id: 'g', contacted_at: '2026-08-24T12:00:00.000Z' },
        ]);
        mock.reset();
        await updateInterestStatus('i', 'approved');
        expect(mock.args('update')).toEqual([
          { status: 'approved', assigned_group_id: null, contacted_at: '2026-08-24T12:00:00.000Z' },
        ]);
        mock.reset();
        await updateInterestStatus('i', 'declined');
        expect(mock.args('update')).toEqual([{ status: 'declined', assigned_group_id: null }]);
        expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
      } finally {
        vi.useRealTimers();
      }
    });
    it('updateInterestStatus maps its error', async () => {
      mock.results.discipleship_interests = [{ data: null, error: ERR }];
      expect(await updateInterestStatus('i', 'declined')).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[discipulado] updateInterestStatus:', 'boom');
    });
  });

  describe('members + messages', () => {
    it('fetchMembers: group filter, role then name', async () => {
      await fetchMembers('g');
      expect(mock.query().table).toBe('discipleship_members');
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);
      expect(mock.query().calls[2].args).toEqual(['role', { ascending: true }]);
      expect(mock.query().calls[3].args).toEqual(['full_name', { ascending: true }]);
      expect(await fetchMembers('')).toEqual({ ok: true, data: [] });
    });
    it('fetchMembers: a failed read is an error, never an empty roster', async () => {
      mock.results.discipleship_members = [{ data: null, error: ERR }];
      expect(await fetchMembers('g')).toEqual(failure('unknown', 'boom'));
    });
    it('addMember / removeMember / moveMember', async () => {
      mock.results.discipleship_members = [{ data: { id: 'm' } }];
      expect(await addMember({ group_id: 'g', full_name: 'A' })).toEqual({
        ok: true,
        data: { id: 'm' },
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      mock.reset();
      mock.results.discipleship_members = [{ count: 1 }];
      expect(await removeMember('m')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('delete')).toEqual([{ count: 'exact' }]);
      mock.reset();
      expect(await moveMember('', 'g')).toEqual(
        invalidInput('Falta el miembro o el grupo de destino.'),
      );
      expect(mock.queries).toHaveLength(0);
      await moveMember('m', 'g2');
      expect(mock.args('update')).toEqual([{ group_id: 'g2' }]);
      expect(mock.args('eq')).toEqual(['id', 'm']);
    });
    it('removeMember: a delete that matched no member is not_found (D-027)', async () => {
      mock.results.discipleship_members = [{ count: 0 }];
      expect(await removeMember('m')).toEqual(NOT_FOUND);
    });
    it('addMember maps an RLS refusal to forbidden', async () => {
      mock.results.discipleship_members = [RLS_DENIED];
      const res = await addMember({ group_id: 'g', full_name: 'A' });
      expect(res.ok === false && res.error.kind).toBe('forbidden');
    });
    it('fetchMessages: newest first with a limit', async () => {
      await fetchMessages('g', 5);
      expect(mock.query().table).toBe('discipleship_messages');
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'limit']);
      expect(mock.args('order')).toEqual(['sent_at', { ascending: false }]);
      expect(mock.args('limit')).toEqual([5]);
      mock.reset();
      await fetchMessages('g');
      expect(mock.args('limit')).toEqual([25]);
      expect(await fetchMessages('')).toEqual({ ok: true, data: [] });
    });
    it('fetchMessages: a failed read is an error, never an empty thread', async () => {
      mock.results.discipleship_messages = [{ data: null, error: ERR }];
      expect(await fetchMessages('g')).toEqual(failure('unknown', 'boom'));
    });
    it('sendMessage rejects an empty body and trims', async () => {
      expect(await sendMessage({ groupId: 'g', body: '  ' })).toEqual(
        invalidInput('El mensaje no puede estar vacío.'),
      );
      expect(mock.queries).toHaveLength(0);
      mock.results.discipleship_messages = [{ data: { id: 'x' } }];
      expect(await sendMessage({ groupId: 'g', body: ' hola ' })).toEqual({
        ok: true,
        data: { id: 'x' },
      });
      expect(mock.args('insert')).toEqual([{ group_id: 'g', subject: null, body: 'hola' }]);
    });
  });

  describe('realtime under prerender (browser=false)', () => {
    it('opens no channel', () => {
      subscribeGroups(() => {})();
      subscribeInterests(() => {})();
      expect(mock.channels).toHaveLength(0);
    });
  });

  // RLS: groups are public only when published (`dgroups_public_read`) and
  // interests are anon INSERT-only; members, messages and every other write
  // are `to authenticated`.
  describeSessionGate(discipleship, '[discipulado]', {
    staffOnly: {
      fetchAllGroups: () => fetchAllGroups(),
      fetchGroupById: () => fetchGroupById('g'),
      upsertGroup: () => upsertGroup({ name: 'Grupo' }),
      deleteGroup: () => deleteGroup('g'),
      markGroupCompleted: () => markGroupCompleted('g'),
      fetchInterests: () => fetchInterests(),
      updateInterestStatus: () => updateInterestStatus('i', 'approved'),
      fetchMembers: () => fetchMembers('g'),
      addMember: () => addMember({ group_id: 'g', full_name: 'Ana' }),
      removeMember: () => removeMember('m'),
      moveMember: () => moveMember('m', 'g2'),
      fetchMessages: () => fetchMessages('g'),
      sendMessage: () => sendMessage({ groupId: 'g', body: 'hola' }),
    },
    publicCalls: {
      fetchPublicGroups: () => fetchPublicGroups(),
      fetchPublicGroupBy: () => fetchPublicGroupBy({ slug: 's' }),
      submitInterest: () => submitInterest({ full_name: 'Ana', email: 'a@b.c' }),
    },
    notRepoCalls: ['subscribeGroups', 'subscribeInterests'],
  });
});
