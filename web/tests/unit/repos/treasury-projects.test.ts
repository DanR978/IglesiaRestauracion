// S52 — repos/treasury/projects: the `fin_projects` containers
// (project-treasury.js:58-107, 328-360), including the D-019 ministry-scoped
// read the S56b widening will start returning rows for. S22b — the ReadResult
// / WriteResult contract, D-027 (RLS refusing an update/delete on a ministry
// row matches no row, which must come back as `not_found`), and `auth` signed
// out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NOT_FOUND, failure, invalidInput } from './results';
import { describeSessionGate } from './session-gate';
import * as projects from '#lib/repos/treasury/projects.js';
import {
  createProject,
  deleteProject,
  fetchBudgetedMinistryIds,
  fetchProjects,
  updateProject,
} from '#lib/repos/treasury/index.js';

const ERR = { message: 'boom' };
const MIN_A = '11111111-1111-1111-1111-111111111111';
const MIN_B = '22222222-2222-2222-2222-222222222222';
const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const project = (over: Record<string, unknown> = {}) => ({
  id: 'pr1',
  owner_id: OWNER,
  name: 'Jóvenes',
  color: '#345a65',
  icon: 'fa-folder',
  archived: false,
  created_at: '2026-01-01T12:00:00Z',
  ministry_id: null,
  ...over,
});

describe('repos/treasury/projects', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchProjects (project-treasury.js:58-62)', () => {
    it('owner scope: unarchived, oldest first — the legacy query', async () => {
      mock.results.fin_projects = [{ data: [project()] }];
      const res = await fetchProjects({ ownerId: OWNER });
      expect(res.ok && res.data).toHaveLength(1);
      expect(mock.query().table).toBe('fin_projects');
      expect(mock.chain()).toEqual(['select', 'eq', 'eq', 'order']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['owner_id', OWNER],
        ['archived', false],
        ['created_at'],
      ]);
    });

    it('D-019 ministry scope aggregates by ministry, not by owner', async () => {
      await fetchProjects({ ministryIds: [MIN_A, MIN_B] });
      expect(mock.chain()).toEqual(['select', 'in', 'eq', 'order']);
      expect(mock.args('in')).toEqual(['ministry_id', [MIN_A, MIN_B]]);
      expect(mock.args('eq')).toEqual(['archived', false]);
    });

    it('includeArchived drops the archived filter; no scope leaves it to RLS', async () => {
      await fetchProjects({ ownerId: OWNER, includeArchived: true });
      expect(mock.chain()).toEqual(['select', 'eq', 'order']);
      expect(mock.args('eq')).toEqual(['owner_id', OWNER]);

      mock.reset();
      await fetchProjects();
      expect(mock.chain()).toEqual(['select', 'eq', 'order']);
      expect(mock.args('eq')).toEqual(['archived', false]);
    });

    it('a failed read is an error + warn, never "no projects" (D-032)', async () => {
      mock.results.fin_projects = [{ data: null, error: ERR }];
      const res = await fetchProjects({ ownerId: OWNER });
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(warn).toHaveBeenCalledWith('[treasury] fetchProjects:', 'boom');
    });
  });

  describe('fetchBudgetedMinistryIds (project-treasury.js:84-89)', () => {
    it('unions the active-recurring and church-expense probes, de-duplicated', async () => {
      mock.results.fin_recurring = [{ data: [{ ministry_id: MIN_A }] }];
      mock.results.fin_expenses = [
        { data: [{ ministry_id: MIN_A }, { ministry_id: MIN_B }, { ministry_id: null }] },
      ];
      expect(await fetchBudgetedMinistryIds([MIN_A, MIN_B])).toEqual({
        ok: true,
        data: [MIN_A, MIN_B],
      });
      expect(mock.queries.map((q) => q.table)).toEqual(['fin_recurring', 'fin_expenses']);
      expect(mock.chain(0)).toEqual(['select', 'in', 'eq']);
      expect(mock.query(0).calls.map((c) => c.args)).toEqual([
        ['ministry_id'],
        ['ministry_id', [MIN_A, MIN_B]],
        ['active', true],
      ]);
      expect(mock.chain(1)).toEqual(['select', 'is', 'in']);
      expect(mock.query(1).calls.map((c) => c.args)).toEqual([
        ['ministry_id'],
        ['project_id', null],
        ['ministry_id', [MIN_A, MIN_B]],
      ]);
    });

    it('no ministries means no query: an empty success', async () => {
      expect(await fetchBudgetedMinistryIds([])).toEqual({ ok: true, data: [] });
      expect(mock.queries).toHaveLength(0);
    });

    it('ONE failing probe fails the read — a partial list would hide a budget tab', async () => {
      mock.results.fin_recurring = [{ data: null, error: ERR }];
      mock.results.fin_expenses = [{ data: [{ ministry_id: MIN_B }] }];
      expect(await fetchBudgetedMinistryIds([MIN_A, MIN_B])).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchBudgetedMinistryIds recurring:', 'boom');

      mock.reset();
      mock.results.fin_recurring = [{ data: [{ ministry_id: MIN_A }] }];
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchBudgetedMinistryIds([MIN_A])).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchBudgetedMinistryIds expenses:', 'boom');
    });
  });

  describe('writes', () => {
    it('create requires an owner and a name', async () => {
      expect(await createProject({ owner_id: '', name: 'x' })).toEqual(
        invalidInput('Falta el propietario del proyecto.'),
      );
      expect(await createProject({ owner_id: OWNER, name: '   ' })).toEqual(
        invalidInput('El proyecto necesita un nombre.'),
      );
      expect(mock.queries).toHaveLength(0);

      mock.results.fin_projects = [{ data: project() }];
      const res = await createProject({
        owner_id: OWNER,
        name: 'Jóvenes',
        color: '#345a65',
        icon: 'fa-folder',
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(res.ok && res.data.name).toBe('Jóvenes');
    });

    it('update covers both the rename and the ministry attach', async () => {
      mock.results.fin_projects = [{ data: project({ name: 'Niños' }) }];
      await updateProject('pr1', { name: 'Niños' });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
      expect(mock.args('update')).toEqual([{ name: 'Niños' }]);
      expect(mock.args('eq')).toEqual(['id', 'pr1']);

      mock.reset();
      mock.results.fin_projects = [{ data: project({ ministry_id: MIN_A }) }];
      await updateProject('pr1', { ministry_id: MIN_A });
      expect(mock.args('update')).toEqual([{ ministry_id: MIN_A }]);
    });

    it('D-027: an update RLS refuses on a ministry row matches nothing → not_found', async () => {
      mock.results.fin_projects = [
        {
          data: null,
          error: {
            message: 'JSON object requested, multiple (or no) rows returned',
            code: 'PGRST116',
          },
          status: 406,
        },
      ];
      const res = await updateProject('pr1', { ministry_id: MIN_A });
      expect(res).toEqual(
        failure('not_found', 'PGRST116: JSON object requested, multiple (or no) rows returned'),
      );
    });

    it('delete filters by id, counted, and guards a missing one', async () => {
      mock.results.fin_projects = [{ count: 1 }];
      expect(await deleteProject('pr1')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('delete')).toEqual([{ count: 'exact' }]);
      expect(mock.args('eq')).toEqual(['id', 'pr1']);

      expect(await updateProject('', {})).toEqual(
        invalidInput('Falta el identificador del proyecto.'),
      );
      expect(await deleteProject('')).toEqual(invalidInput('Falta el identificador del proyecto.'));
    });

    it('D-027: a delete RLS refuses on a ministry row deletes nothing → not_found, never success', async () => {
      mock.results.fin_projects = [{ count: 0 }];
      expect(await deleteProject('pr1')).toEqual(NOT_FOUND);
      expect(warn).toHaveBeenCalledWith('[treasury] deleteProject:', 'no row was affected');
    });

    it('write errors come back as the mapped error branch', async () => {
      mock.results.fin_projects = [{ data: null, error: ERR }];
      expect(await createProject({ owner_id: OWNER, name: 'x' })).toEqual(
        failure('unknown', 'boom'),
      );
      expect(warn).toHaveBeenCalledWith('[treasury] createProject:', 'boom');
    });
  });

  // RLS: every `fin_*` policy is `to authenticated`.
  describeSessionGate(projects, '[treasury]', {
    staffOnly: {
      fetchProjects: () => fetchProjects({ ownerId: OWNER }),
      fetchBudgetedMinistryIds: () => fetchBudgetedMinistryIds([MIN_A]),
      createProject: () => createProject({ owner_id: OWNER, name: 'Jóvenes' }),
      updateProject: () => updateProject('pr1', { name: 'x' }),
      deleteProject: () => deleteProject('pr1'),
    },
  });
});
