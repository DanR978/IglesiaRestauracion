// S41 golden parity for #lib/activity-format vs legacy js/pages/admin/activity-tab.js.
// The fixture is what the LEGACY tab rendered (loadActivity's `.act__text` and
// `.act__time`), captured by tests/unit/capture-activity-format.test.ts under
// TZ=America/New_York with the clock pinned — never hand-written, never from
// the port. A week-old row renders a local date, so this suite pins the same
// zone.
//
// Byte-identical except the approved S41 diffs below (S41-dashboard.md,
// "Approved behaviour diffs"). Each diff is checked on BOTH sides: the
// fixture must still say what legacy said, and the port must say the new
// words — so the diff cannot widen silently in either direction.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { itGolden, type GoldenVector } from '#lib/test/golden.js';
import {
  ACTIVITY_EMPTY,
  ACTIVITY_ENTITY_FALLBACK,
  ACTIVITY_VERB_FALLBACK,
  ACTIVITY_VERBS,
  activityPredicate,
  formatActivity,
  type ActivityRow,
} from '#lib/activity-format.js';
import fixtureJson from '../fixtures/activity-format.json';

type Rendered = { text: string; time: string };
type Fixture = {
  tz: string;
  rows: GoldenVector<{ row: ActivityRow; now: string }, Rendered>[];
  empty: string;
};

const fx = fixtureJson as unknown as Fixture;

/** What a row renders: the actor, a space, the predicate — legacy activity-tab.js:76 as text. */
const port = ({ row, now }: { row: ActivityRow; now: string }): Rendered => {
  const line = formatActivity(row, Date.parse(now));
  return { text: `${line.who} ${activityPredicate(line)}`, time: line.when };
};

/** S41 diff 1 — audited tables legacy left as "un registro". */
const NEW_ENTITIES: Readonly<Record<string, string>> = {
  profiles: 'una cuenta',
  role_presets: 'un preset de acceso',
  special_events: 'un evento con registro',
  event_registrations: 'una inscripción',
  fin_funds: 'un fondo',
  fin_income_categories: 'una categoría de ingresos',
  fin_expense_categories: 'una categoría de gastos',
};

/** S41 diff 2 — an operation outside INSERT/UPDATE/DELETE (legacy: its code, lower-cased). */
const isUnknownAction = (row: ActivityRow): boolean =>
  !Object.hasOwn(ACTIVITY_VERBS, row.action ?? '');

/** S41 diff 3 — an unreadable timestamp (legacy: "Invalid Date"). */
const isUnreadable = (row: ActivityRow): boolean => Number.isNaN(Date.parse(row.created_at));

const approved = ({ input: { row } }: GoldenVector<{ row: ActivityRow }, Rendered>): boolean =>
  (row.entity !== null && Object.hasOwn(NEW_ENTITIES, row.entity)) ||
  isUnknownAction(row) ||
  isUnreadable(row);

describe('activity-format golden (legacy js/pages/admin/activity-tab.js)', () => {
  const previousTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = fx.tz;
  });

  afterAll(() => {
    process.env.TZ = previousTz;
  });

  it('was captured in the zone this suite pins', () => {
    expect(fx.tz).toBe('America/New_York');
    expect(fx.rows.length).toBeGreaterThan(50);
  });

  itGolden(
    'activity row',
    fx.rows.filter((v) => !approved(v)),
    port,
  );

  it('keeps the legacy empty-state copy', () => {
    expect(ACTIVITY_EMPTY).toBe(fx.empty);
  });

  describe('approved S41 diffs', () => {
    const entityVectors = fx.rows.filter(
      ({ input: { row } }) => row.entity !== null && Object.hasOwn(NEW_ENTITIES, row.entity),
    );

    it('covers every new phrase with a captured vector', () => {
      expect(new Set(entityVectors.map(({ input }) => input.row.entity))).toEqual(
        new Set(Object.keys(NEW_ENTITIES)),
      );
    });

    for (const vector of entityVectors) {
      const entity = vector.input.row.entity as string;
      it(`${entity}: legacy "${ACTIVITY_ENTITY_FALLBACK}" → "${NEW_ENTITIES[entity]}"`, () => {
        const legacy = vector.expected.text;
        expect(legacy).toContain(` ${ACTIVITY_ENTITY_FALLBACK}`);
        expect(port(vector.input)).toEqual({
          text: legacy.replace(` ${ACTIVITY_ENTITY_FALLBACK}`, ` ${NEW_ENTITIES[entity]}`),
          time: vector.expected.time,
        });
      });
    }

    const actionVectors = fx.rows.filter(({ input: { row } }) => isUnknownAction(row));

    it('captured the three shapes of an unknown operation', () => {
      expect(actionVectors.map(({ input }) => input.row.action)).toEqual(['TRUNCATE', '', null]);
    });

    for (const vector of actionVectors) {
      const { row } = vector.input;
      it(`operation ${JSON.stringify(row.action)}: legacy raw code → "${ACTIVITY_VERB_FALLBACK}"`, () => {
        const who = row.actor_name || 'Alguien';
        const legacyVerb = row.action?.toLowerCase() || '';
        const legacy = vector.expected.text;
        expect(legacy.startsWith(`${who} ${legacyVerb} `)).toBe(true);
        expect(port(vector.input)).toEqual({
          text: legacy.replace(`${who} ${legacyVerb} `, `${who} ${ACTIVITY_VERB_FALLBACK} `),
          time: vector.expected.time,
        });
      });
    }

    const timeVectors = fx.rows.filter(({ input: { row } }) => isUnreadable(row));

    it('an unreadable timestamp: legacy "Invalid Date" → no time at all', () => {
      expect(timeVectors).toHaveLength(1);
      const [vector] = timeVectors;
      expect(vector.expected.time).toBe('Invalid Date');
      expect(port(vector.input)).toEqual({ text: vector.expected.text, time: '' });
    });
  });
});
