// S05b — the layer import boundaries (target-architecture §3), exercised
// through the REAL eslint.config.js, as no-raw-html.test.ts does: a rule that
// only worked under a RuleTester's inline config would prove nothing about CI.
//
// The PATH picks the config block, so every snippet is linted as if it lived
// at a probe path inside its layer. Each boundary is checked in both forms the
// code can take — a static `import … from` (`no-restricted-imports`) and a
// dynamic `import('…')`, string or template literal (`no-restricted-syntax`) —
// flagged where the layer forbids it and quiet where it allows it.
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const STATIC = 'no-restricted-imports';
const DYNAMIC = 'no-restricted-syntax';

/** The project config; probe files need not exist. */
const eslint = new ESLint();

/** Each layer's message, as eslint.config.js words it. */
const MESSAGE = {
  db: 'Primitives, platform helpers and pure libs stay off db/* (target-architecture §3).',
  dbClient: 'Only repos and the S38 session store import db/client (target-architecture §3).',
  repos: 'Primitives, platform helpers and pure libs never fetch (target-architecture §3).',
  platform: 'Primitives and pure libs stay context-agnostic (target-architecture §3).',
  components: 'Repos, stores, platform and pure libs never import UI (target-architecture §3).',
  stores: 'Repos, platform and pure libs never import app state (target-architecture §3).',
} as const;
type Layer = keyof typeof MESSAGE;

const wrap = (probe: string, code: string): string =>
  probe.endsWith('.svelte') ? `<script lang="ts">\n${code}</script>\n` : code;

const staticImport = (spec: string) =>
  `import * as mod from '${spec}';\nexport const used = mod;\n`;
const dynamicImport = (spec: string) => `export const load = () => import('${spec}');\n`;

async function boundaryReports(probe: string, code: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(wrap(probe, code), { filePath: probe });
  return result.messages.filter((m) => m.ruleId === STATIC || m.ruleId === DYNAMIC);
}

type Case = {
  layer: string;
  probe: string;
  forbidden: [spec: string, layer: Layer][];
  allowed: string[];
};

const CASES: Case[] = [
  {
    layer: 'a route',
    probe: 'src/routes/__layer-probe/+page.ts',
    forbidden: [
      ['#lib/db/client.js', 'dbClient'],
      ['$lib/db/client.ts', 'dbClient'],
      ['../../lib/db/client', 'dbClient'],
    ],
    allowed: [
      '#lib/repos/events.js',
      '#lib/db/database.types.js',
      '#lib/components/Button.svelte',
      '#lib/stores/toast.svelte.js',
    ],
  },
  {
    layer: 'a feature component',
    probe: 'src/lib/components/site/__layer-probe.ts',
    forbidden: [['#lib/db/client.js', 'dbClient']],
    allowed: ['#lib/repos/events.js', '#lib/stores/toast.svelte.js', '#lib/platform/device.js'],
  },
  {
    layer: 'a primitive (.ts)',
    probe: 'src/lib/components/__layer-probe.ts',
    forbidden: [
      ['#lib/db/client.js', 'db'],
      ['#lib/db/database.types.js', 'db'],
      ['../db/client.js', 'db'],
      ['#lib/repos/gallery.js', 'repos'],
      ['../repos/gallery.js', 'repos'],
      ['#lib/platform/device.js', 'platform'],
    ],
    allowed: [
      './button.js',
      '#lib/components/modal.js',
      '#lib/escape.js',
      '#lib/stores/toast.svelte.js',
    ],
  },
  {
    layer: 'a primitive (.svelte)',
    probe: 'src/lib/components/__layer-probe.svelte',
    forbidden: [
      ['#lib/repos/gallery.js', 'repos'],
      ['#lib/db/client.js', 'db'],
    ],
    allowed: ['./button.js', '#lib/focus-trap.js'],
  },
  {
    layer: 'a repo',
    probe: 'src/lib/repos/__layer-probe.ts',
    forbidden: [
      ['#lib/components/Button.svelte', 'components'],
      ['../components/button.js', 'components'],
      ['#lib/stores/toast.svelte.js', 'stores'],
    ],
    allowed: ['#lib/db/client.js', './errors', '#lib/money.js'],
  },
  {
    layer: 'a store',
    probe: 'src/lib/stores/__layer-probe.ts',
    forbidden: [
      ['#lib/components/Button.svelte', 'components'],
      ['#lib/db/client.js', 'dbClient'],
    ],
    allowed: ['#lib/repos/events.js', '#lib/db/database.types.js', '#lib/escape.js'],
  },
  {
    layer: "S38's session store",
    probe: 'src/lib/stores/session.svelte.ts',
    forbidden: [['#lib/components/Button.svelte', 'components']],
    allowed: ['#lib/db/client.js', '#lib/repos/errors.js'],
  },
  {
    layer: 'a platform helper',
    probe: 'src/lib/platform/__layer-probe.ts',
    forbidden: [
      ['#lib/components/Button.svelte', 'components'],
      ['#lib/stores/toast.svelte.js', 'stores'],
      ['#lib/repos/events.js', 'repos'],
      ['../db/client.js', 'db'],
    ],
    allowed: ['#lib/escape.js', '../date.js'],
  },
  {
    layer: 'a pure lib',
    probe: 'src/lib/__layer-probe.ts',
    forbidden: [
      ['#lib/components/Button.svelte', 'components'],
      ['./stores/toast.svelte.js', 'stores'],
      ['./repos/events.js', 'repos'],
      ['./db/database.types.js', 'db'],
      ['#lib/platform/device.js', 'platform'],
    ],
    allowed: ['./money.js', '#lib/escape.js'],
  },
];

describe('the boundaries are on, for both import forms, in the config CI runs', () => {
  it.each(CASES)(
    '$layer: the dynamic rule closes exactly what the static rule closes',
    async ({ probe }) => {
      const rules = (await eslint.calculateConfigForFile(probe)).rules ?? {};
      const [staticLevel, { patterns }] = rules[STATIC] as [
        number,
        { patterns: { message: string }[] },
      ];
      const [dynamicLevel, ...selectors] = rules[DYNAMIC] as [
        number,
        ...{ selector: string; message: string }[],
      ];
      expect([staticLevel, dynamicLevel]).toEqual([2, 2]);
      expect(selectors.every((s) => s.selector.startsWith('ImportExpression'))).toBe(true);
      const closedStatically = new Set(patterns.map((p) => p.message));
      expect(new Set(selectors.map((s) => s.message))).toEqual(closedStatically);
    },
  );
});

describe.each(CASES)('$layer ($probe)', ({ probe, forbidden, allowed }) => {
  it.each(forbidden)('flags a static import of %s', async (spec, layer) => {
    const reports = await boundaryReports(probe, staticImport(spec));
    expect(reports.map((r) => r.ruleId)).toContain(STATIC);
    expect(reports.every((r) => r.message.endsWith(MESSAGE[layer]))).toBe(true);
  });

  it.each(forbidden)('flags a dynamic import of %s', async (spec, layer) => {
    const reports = await boundaryReports(probe, dynamicImport(spec));
    expect(reports.map((r) => r.ruleId)).toContain(DYNAMIC);
    expect(reports.map((r) => r.message)).toContain(MESSAGE[layer]);
    expect(reports.every((r) => r.message === MESSAGE[layer])).toBe(true);
  });

  it.each(allowed)('allows %s, static and dynamic', async (spec) => {
    expect(await boundaryReports(probe, staticImport(spec))).toEqual([]);
    expect(await boundaryReports(probe, dynamicImport(spec))).toEqual([]);
  });
});

describe('a template-literal import() is matched on its leading text', () => {
  const PRIMITIVE = 'src/lib/components/__layer-probe.ts';

  it.each([
    ['#lib/repos/${name}.js', MESSAGE.repos],
    ['../repos/${name}.js', MESSAGE.repos],
    ['#lib/db/${name}.js', MESSAGE.db],
  ])('flags `%s` in a primitive', async (template, message) => {
    const code = `export const load = (name: string) => import(\`${template}\`);\n`;
    const reports = await boundaryReports(PRIMITIVE, code);
    expect(reports.map((r) => [r.ruleId, r.message])).toContainEqual([DYNAMIC, message]);
  });

  it('flags a substitution-free template of db/client in a route', async () => {
    const code = 'export const load = () => import(`#lib/db/client.js`);\n';
    const reports = await boundaryReports('src/routes/__layer-probe/+page.ts', code);
    expect(reports.map((r) => [r.ruleId, r.message])).toEqual([[DYNAMIC, MESSAGE.dbClient]]);
  });

  it('leaves a template into an allowed folder alone', async () => {
    const code = 'export const load = (name: string) => import(`./icons/${name}.js`);\n';
    expect(await boundaryReports(PRIMITIVE, code)).toEqual([]);
  });
});
