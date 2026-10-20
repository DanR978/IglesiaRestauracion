// S41 — RecentActivity, Inicio's "Actividad reciente". The rendered sentence
// and time of every row must read exactly as the legacy Actividad tab
// rendered them: the rows come from the S41 golden fixture (captured from
// js/pages/admin/activity-tab.js under TZ=America/New_York, clock pinned) —
// the approved S41 diffs are covered by tests/golden/activity-format.test.ts.
// Plus the actor's initials, and the loading, empty and error states.
import { render } from '@testing-library/svelte';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RecentActivity from '#lib/components/admin/dashboard/RecentActivity.svelte';
import { ACTIVITY_LIMIT } from '#lib/components/admin/dashboard/dashboard.js';
import { ACTIVITY_EMPTY, ACTIVITY_VERBS } from '#lib/activity-format.js';
import type { AuditEntry } from '#lib/repos/activity.js';
import fixtureJson from '../fixtures/activity-format.json';

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));

type Row = Pick<AuditEntry, 'actor_name' | 'action' | 'entity' | 'label' | 'created_at'>;
type Vector = { input: { row: Row; now: string }; expected: { text: string; time: string } };
const fx = fixtureJson as unknown as { tz: string; rows: Vector[] };

const LEGACY_ENTITIES = new Set([
  'events',
  'calendar_events',
  'calendar_presets',
  'ministries',
  'discipleship_groups',
  'discipleship_members',
  'discipleship_messages',
  'gallery_albums',
  'leader_sections',
  'leader_members',
  'app_settings',
  'invitations',
  'fin_income',
  'fin_expenses',
  'fin_budgets',
  'fin_payables',
  'fin_recurring',
  'fin_notes',
]);

/** The vectors S41 renders exactly as legacy did (see the golden for the rest). */
const parity = fx.rows.filter(
  ({ input: { row } }) =>
    Object.hasOwn(ACTIVITY_VERBS, row.action ?? '') &&
    !Number.isNaN(Date.parse(row.created_at)) &&
    (row.entity === null || LEGACY_ENTITIES.has(row.entity) || row.entity === 'unknown_table'),
);

const entry = (row: Row, i: number): AuditEntry => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  actor_id: null,
  entity_id: null,
  ...row,
});

const onRetry = () => vi.fn(async () => {});

describe('RecentActivity', () => {
  const previousTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = fx.tz;
  });

  afterAll(() => {
    process.env.TZ = previousTz;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is a card with its own h2', () => {
    const { getByRole } = render(RecentActivity, { result: null, onRetry: onRetry() });
    expect(getByRole('heading', { level: 2, name: 'Actividad reciente' })).toBeInTheDocument();
  });

  it('loads as a list skeleton the length of the list', () => {
    const { container, getByRole } = render(RecentActivity, { result: null, onRetry: onRetry() });
    expect(container.querySelectorAll('.ird-state--list .ird-state__item')).toHaveLength(
      ACTIVITY_LIMIT,
    );
    expect(getByRole('status')).toHaveTextContent('Cargando actividad reciente…');
  });

  it('reads every row exactly as the legacy Actividad tab did', () => {
    expect(parity.length).toBeGreaterThan(40);
    expect(new Set(parity.map((v) => v.input.now)).size).toBe(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(parity[0].input.now));
    const { container } = render(RecentActivity, {
      result: { ok: true, data: parity.map((v, i) => entry(v.input.row, i)) },
      onRetry: onRetry(),
    });
    const rows = [...container.querySelectorAll('.feed__row')];
    expect(rows).toHaveLength(parity.length);
    rows.forEach((row, i) => {
      const { expected, input } = parity[i];
      expect(row.querySelector('.feed__text')?.textContent, JSON.stringify(input.row)).toBe(
        expected.text,
      );
      const time = row.querySelector('time');
      expect(time?.textContent).toBe(expected.time);
      expect(time).toHaveAttribute('datetime', input.row.created_at);
    });
  });

  it('leads each row with the actor’s initials, hidden beside the visible name', () => {
    const { container } = render(RecentActivity, {
      result: {
        ok: true,
        data: [
          entry(
            {
              actor_name: 'Ana Pérez',
              action: 'UPDATE',
              entity: 'role_presets',
              label: 'Tesorería',
              created_at: new Date().toISOString(),
            },
            1,
          ),
        ],
      },
      onRetry: onRetry(),
    });
    const avatar = container.querySelector('.feed__row .ird-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveTextContent('AP');
    expect(container.querySelector('.feed__text')?.textContent).toBe(
      'Ana Pérez editó un preset de acceso “Tesorería”',
    );
  });

  it('leaves the time out for an unreadable timestamp', () => {
    const { container } = render(RecentActivity, {
      result: {
        ok: true,
        data: [
          entry(
            {
              actor_name: 'Ana',
              action: 'INSERT',
              entity: 'events',
              label: null,
              created_at: 'no es una fecha',
            },
            1,
          ),
        ],
      },
      onRetry: onRetry(),
    });
    expect(container.querySelector('.feed__text')?.textContent).toBe('Ana creó un evento especial');
    expect(container.querySelector('time')).toBeNull();
  });

  it('says so when nothing has happened yet', () => {
    const { getByText } = render(RecentActivity, {
      result: { ok: true, data: [] },
      onRetry: onRetry(),
    });
    expect(getByText(ACTIVITY_EMPTY)).toBeInTheDocument();
  });

  it('shows a failed read as an error with Retry, never as "no activity"', () => {
    const message = 'No tienes permiso para realizar esta acción.';
    const { getByRole, queryByText } = render(RecentActivity, {
      result: { ok: false, error: { kind: 'forbidden', message } },
      onRetry: onRetry(),
    });
    expect(getByRole('alert')).toHaveTextContent(message);
    expect(getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(queryByText(ACTIVITY_EMPTY)).toBeNull();
  });
});
