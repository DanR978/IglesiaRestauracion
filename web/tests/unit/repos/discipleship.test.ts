// S22 — repos/discipleship: query shape per legacy js/lib/discipleship.js,
// the never-throw / WriteResult contracts, and G-006 (no .select() on the
// anon interest insert).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
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
} from '$lib/repos/discipleship';

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
      await fetchPublicGroups();
      expect(mock.query().table).toBe('discipleship_groups');
      expect(mock.chain()).toEqual(['select', 'eq', 'in', 'order']);
      expect(mock.args('eq')).toEqual(['is_published', true]);
      expect(mock.args('in')).toEqual(['status', ['open', 'active']]);
      expect(mock.args('order')).toEqual(['starts_on', { ascending: true, nullsFirst: false }]);
    });
    it('[] on error, tagged [discipulado]', async () => {
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await fetchPublicGroups()).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[discipulado] fetchPublicGroups:', 'boom');
    });
  });

  describe('fetchAllGroups (discipleship.js:118)', () => {
    it('newest start first, then created_at desc', async () => {
      await fetchAllGroups();
      expect(mock.chain()).toEqual(['select', 'order', 'order']);
      expect(mock.query().calls[1].args).toEqual([
        'starts_on',
        { ascending: false, nullsFirst: false },
      ]);
      expect(mock.query().calls[2].args).toEqual(['created_at', { ascending: false }]);
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
    it('null without a query when no key is given', async () => {
      expect(await fetchGroupById('')).toBeNull();
      expect(await fetchPublicGroupBy()).toBeNull();
      expect(mock.queries).toHaveLength(0);
    });
    it('null on error', async () => {
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await fetchPublicGroupBy({ slug: 's' })).toBeNull();
      expect(warn).toHaveBeenCalledWith('[discipulado] fetchPublicGroupBy:', 'boom');
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
    it('returns { ok:false, error } on failure', async () => {
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await upsertGroup({ name: 'X' })).toEqual({ ok: false, error: 'boom' });
      mock.results.discipleship_groups = [{ data: null, error: ERR }];
      expect(await deleteGroup('g')).toEqual({ ok: false, error: 'boom' });
    });
    it('deleteGroup deletes by id', async () => {
      expect(await deleteGroup('g')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
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
      expect(await submitInterest({ phone: '1' })).toEqual({
        ok: false,
        error: 'Por favor escribe tu nombre.',
      });
      expect(await submitInterest({ full_name: 'A' })).toEqual({
        ok: false,
        error: 'Necesitamos al menos un correo o teléfono para contactarte.',
      });
      expect(mock.queries).toHaveLength(0);
    });

    it('surfaces the Supabase message on error', async () => {
      mock.results.discipleship_interests = [{ data: null, error: ERR }];
      expect(await submitInterest({ full_name: 'A', email: 'a@b.c' })).toEqual({
        ok: false,
        error: 'boom',
      });
      expect(warn).toHaveBeenCalledWith('[discipulado] submitInterest:', 'boom');
    });
  });

  describe('fetchInterests / updateInterestStatus', () => {
    it('newest first, optional status filter', async () => {
      await fetchInterests({ status: 'new' });
      expect(mock.chain()).toEqual(['select', 'order', 'eq']);
      expect(mock.args('order')).toEqual(['created_at', { ascending: false }]);
      expect(mock.args('eq')).toEqual(['status', 'new']);
      mock.reset();
      await fetchInterests();
      expect(mock.chain()).toEqual(['select', 'order']);
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
        await updateInterestStatus('i', 'archived');
        expect(mock.args('update')).toEqual([{ status: 'archived', assigned_group_id: null }]);
        expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('members + messages', () => {
    it('fetchMembers: group filter, role then name', async () => {
      await fetchMembers('g');
      expect(mock.query().table).toBe('discipleship_members');
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);
      expect(mock.query().calls[2].args).toEqual(['role', { ascending: true }]);
      expect(mock.query().calls[3].args).toEqual(['full_name', { ascending: true }]);
      expect(await fetchMembers('')).toEqual([]);
    });
    it('addMember / removeMember / moveMember', async () => {
      mock.results.discipleship_members = [{ data: { id: 'm' } }];
      expect(await addMember({ group_id: 'g', full_name: 'A' })).toEqual({
        ok: true,
        data: { id: 'm' },
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      mock.reset();
      expect(await removeMember('m')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
      mock.reset();
      expect(await moveMember('', 'g')).toEqual({ ok: false, error: 'invalid-args' });
      await moveMember('m', 'g2');
      expect(mock.args('update')).toEqual([{ group_id: 'g2' }]);
      expect(mock.args('eq')).toEqual(['id', 'm']);
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
    });
    it('sendMessage rejects an empty body and trims', async () => {
      expect(await sendMessage({ groupId: 'g', body: '  ' })).toEqual({
        ok: false,
        error: 'El mensaje no puede estar vacío.',
      });
      expect(mock.queries).toHaveLength(0);
      mock.results.discipleship_messages = [{ data: { id: 'x' } }];
      await sendMessage({ groupId: 'g', body: ' hola ' });
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
});
