// S41 capture harness — generates web/tests/fixtures/activity-format.json by
// RUNNING THE LEGACY js/pages/admin/activity-tab.js (D-012), the S07 way.
//
// Disabled unless CAPTURE=1:
//   CAPTURE=1 npx vitest run tests/unit/capture-activity-format.test.ts
// (set LEGACY_ROOT when web/ is not inside the legacy checkout).
//
// Mechanics: the tab's verb map, entity map and timeAgo() are module-private,
// so the capture drives what the tab exports — loadActivity() — and records
// what it renders. The legacy source is copied into web/tests/.capture-tmp/
// with ONLY its import specifiers rewritten, same bytes otherwise:
//   '/js/utils/escape.js'       → the real legacy file, by relative path
//   '/js/components/states.js'  → a copy of the real legacy file whose own
//                                 escape.js import is rewritten the same way
//   './state.js'                → a stub whose `sb` answers the audit query
//                                 with the vector's row (the real one opens a
//                                 Supabase client)
// The clock is pinned to NOW with fake timers and the zone to
// America/New_York: rows a week old or more render a local date. The port is
// NEVER imported here.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const CAPTURE = process.env.CAPTURE === '1';
const TZ = 'America/New_York';
const NOW = '2026-10-19T14:00:00.000Z';
const SECONDS = 1000;
const DAY_SECONDS = 86_400;

type Row = {
  actor_name: string | null;
  action: string | null;
  entity: string | null;
  label: string | null;
  created_at: string;
};

/** A row five minutes old; each vector overrides what it is about. */
const BASE: Row = {
  actor_name: 'Ana Pérez',
  action: 'INSERT',
  entity: 'calendar_events',
  label: 'Culto dominical',
  created_at: '2026-10-19T13:55:00.000Z',
};

const ago = (seconds: number): string =>
  new Date(Date.parse(NOW) - seconds * SECONDS).toISOString();

/** Every key the legacy ENTITY map holds (activity-tab.js:17-36). */
const LEGACY_ENTITIES = [
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
];

/** Audited tables the legacy map lacks, and one that is not a table at all. */
const UNMAPPED_ENTITIES = [
  'profiles',
  'role_presets',
  'special_events',
  'event_registrations',
  'fin_funds',
  'fin_income_categories',
  'fin_expense_categories',
  'unknown_table',
];

// Inputs only — the expected values are whatever the LEGACY tab renders at
// capture time. Never hand-edit the fixture.
const VECTORS: { row: Partial<Row>; note: string }[] = [
  { row: { action: 'INSERT' }, note: 'INSERT → creó' },
  { row: { action: 'UPDATE' }, note: 'UPDATE → editó' },
  { row: { action: 'DELETE' }, note: 'DELETE → eliminó' },
  { row: { action: 'TRUNCATE' }, note: 'an unknown operation: its code, lower-cased' },
  { row: { action: '' }, note: 'an empty operation: no verb' },
  { row: { action: null }, note: 'no operation: no verb' },
  ...LEGACY_ENTITIES.map((entity) => ({ row: { entity }, note: `entity ${entity}` })),
  ...UNMAPPED_ENTITIES.map((entity) => ({
    row: { entity },
    note: `entity ${entity} — not in the legacy map`,
  })),
  { row: { entity: null }, note: 'no entity' },
  { row: { actor_name: null }, note: 'no actor → Alguien' },
  { row: { actor_name: '' }, note: 'an empty actor → Alguien' },
  { row: { actor_name: 'Sistema' }, note: 'a trigger without a session' },
  {
    row: { actor_name: '<b>Ana</b> & "Luis"' },
    note: 'markup in the actor is text',
  },
  { row: { label: null }, note: 'no label' },
  { row: { label: '' }, note: 'an empty label' },
  {
    row: { action: 'UPDATE', entity: 'profiles', label: 'Ana · rol: admin · páginas: users' },
    note: 'an access change, as the PR-B trigger labels it',
  },
  {
    row: { label: '<img src=x onerror=alert(1)>' },
    note: 'markup in the label is text',
  },
  { row: { label: "“Citado” y 'apóstrofo'" }, note: 'quotes in the label' },
  { row: { created_at: ago(0) }, note: '0 s ago' },
  { row: { created_at: ago(1) }, note: '1 s ago' },
  { row: { created_at: ago(59) }, note: '59 s ago — still a moment' },
  { row: { created_at: ago(60) }, note: '60 s ago — 1 min' },
  { row: { created_at: ago(61) }, note: '61 s ago' },
  { row: { created_at: ago(59 * 60 + 59) }, note: '59 min 59 s ago' },
  { row: { created_at: ago(60 * 60) }, note: '60 min ago — 1 h' },
  { row: { created_at: ago(23 * 3600 + 3599) }, note: '23 h 59 min 59 s ago' },
  { row: { created_at: ago(DAY_SECONDS) }, note: '24 h ago — 1 d' },
  { row: { created_at: ago(DAY_SECONDS + 1) }, note: '1 d 1 s ago' },
  { row: { created_at: ago(7 * DAY_SECONDS - 1) }, note: '7 d minus 1 s — 6 d' },
  { row: { created_at: ago(7 * DAY_SECONDS) }, note: '7 d ago — the date' },
  { row: { created_at: ago(400 * DAY_SECONDS) }, note: '400 d ago — last year' },
  {
    row: { created_at: new Date(Date.parse(NOW) + 5 * 60 * SECONDS).toISOString() },
    note: 'five minutes ahead — a moment',
  },
  {
    row: { created_at: '2026-10-01T03:30:00.000Z' },
    note: 'a week+ ago, 1 Oct in UTC but 30 Sep in New York',
  },
  {
    row: { created_at: '2026-01-01T02:00:00.000Z' },
    note: 'New Year in UTC, still 2025 in New York',
  },
  {
    row: { created_at: '2026-10-19T09:29:59.123456+00:00' },
    note: 'as PostgREST sends it (microseconds, offset): 4 h ago',
  },
  { row: { created_at: 'no es una fecha' }, note: 'an unreadable timestamp' },
];

type LegacyActivity = { loadActivity: () => Promise<void> };

describe.runIf(CAPTURE)('CAPTURE: activity-format golden from LEGACY (D-012)', () => {
  const previousTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = TZ;
  });

  afterAll(() => {
    process.env.TZ = previousTz;
    vi.useRealTimers();
  });

  it('runs the legacy Actividad tab over the vectors and writes the fixture', async () => {
    const HERE = path.dirname(fileURLToPath(import.meta.url)); // web/tests/unit
    const TESTS = path.resolve(HERE, '..'); // web/tests
    const REPO = process.env.LEGACY_ROOT || path.resolve(HERE, '../../..');
    const tmpDir = path.join(TESTS, '.capture-tmp');
    const specifier = (target: string): string => {
      const rel = path.relative(tmpDir, target).replace(/\\/g, '/');
      return rel.startsWith('.') ? rel : `./${rel}`;
    };
    const rewrite = (src: string, from: string, to: string): string => {
      const out = src.replace(from, to);
      expect(out, `import ${from} not found — wrong source?`).not.toBe(src);
      return out;
    };

    const escapePath = path.join(REPO, 'js', 'utils', 'escape.js');
    const tab = readFileSync(path.join(REPO, 'js', 'pages', 'admin', 'activity-tab.js'), 'utf8');
    const states = readFileSync(path.join(REPO, 'js', 'components', 'states.js'), 'utf8');

    mkdirSync(tmpDir, { recursive: true });
    try {
      writeFileSync(
        path.join(tmpDir, 'states.legacy.mjs'),
        rewrite(states, "'/js/utils/escape.js'", `'${specifier(escapePath)}'`),
      );
      writeFileSync(
        path.join(tmpDir, 'state.stub.mjs'),
        // The one query the tab runs: from().select().order().limit().
        'export const sb = { from: () => ({ select: () => ({ order: () => ({ ' +
          'limit: async () => globalThis.__S41_AUDIT__ }) }) }) };\n',
      );
      let source = rewrite(tab, "'/js/utils/escape.js'", `'${specifier(escapePath)}'`);
      source = rewrite(source, "'./state.js'", "'./state.stub.mjs'");
      source = rewrite(source, "'/js/components/states.js'", "'./states.legacy.mjs'");
      const tmpFile = path.join(tmpDir, 'activity-tab.legacy.mjs');
      writeFileSync(tmpFile, source);

      const legacy = (await import(
        /* @vite-ignore */ pathToFileURL(tmpFile).href
      )) as LegacyActivity;

      document.body.innerHTML = '<div id="activityList"></div>';
      const list = document.getElementById('activityList')!;
      const audit = globalThis as unknown as { __S41_AUDIT__: unknown };
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(NOW));

      const rows = [];
      for (const { row: over, note } of VECTORS) {
        const row: Row = { ...BASE, ...over };
        audit.__S41_AUDIT__ = { data: [row], error: null };
        await legacy.loadActivity();
        const text = list.querySelector('.act__text')?.textContent;
        const time = list.querySelector('.act__time')?.textContent;
        expect(typeof text, note).toBe('string');
        expect(typeof time, note).toBe('string');
        rows.push({ input: { row, now: NOW }, expected: { text, time }, note });
      }

      audit.__S41_AUDIT__ = { data: [], error: null };
      await legacy.loadActivity();
      const empty = list.querySelector('.empty-state p')?.textContent;
      expect(typeof empty).toBe('string');

      const fixture = {
        $comment:
          'Captured by tests/unit/capture-activity-format.test.ts from js/pages/admin/activity-tab.js ' +
          `(loadActivity's rendered text), TZ=${TZ}, clock pinned to "now". Never hand-edit.`,
        tz: TZ,
        rows,
        empty,
      };
      const outPath = path.join(TESTS, 'fixtures', 'activity-format.json');
      writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
      console.warn(`[capture-activity-format] wrote ${outPath}: ${rows.length} rows + empty`);
    } finally {
      vi.useRealTimers();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe.runIf(!CAPTURE)('capture-activity-format (disabled)', () => {
  it.skip('set CAPTURE=1 to (re)generate the activity-format golden fixture from legacy', () => {
    /* intentionally skipped in normal runs */
  });
});
