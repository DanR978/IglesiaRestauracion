// S37 public-page cost — web/client-chunks.ts: which modules the client
// build's two groups take (boot: what entry/start imports; startup: what
// every page imports at startup), and the build guard that fails a build
// where a public page would load admin code or entry/start would load a
// module that reads Kit's payload before init(). A fake module graph and a
// fake bundle stand in for rolldown's.
import { describe, expect, it } from 'vitest';
import type { Rolldown } from 'vite';
import { CLIENT_CHUNK_GROUPS, clientChunkGuard } from '../../client-chunks';

const NM = 'C:/w/web/node_modules';
const SRC = 'C:/w/web/src';
const GEN = 'C:/w/web/.svelte-kit/generated/build/client-optimized';
const ID = {
  entry: `${NM}/@sveltejs/kit/src/runtime/client/entry.js`,
  payload: `${NM}/@sveltejs/kit/src/runtime/client/payload.js`,
  helper: '\0vite/preload-helper.js',
  clientEntry: `${NM}/@sveltejs/kit/src/runtime/client/client-entry.js`,
  client: `${NM}/@sveltejs/kit/src/runtime/client/client.js`,
  env: `${NM}/@sveltejs/kit/src/runtime/app/env/client.js`,
  svelte: `${NM}/svelte/src/internal/client/index.js`,
  app: `${GEN}/app.js`,
  rootLayout: `${SRC}/routes/+layout.svelte`,
  theme: `${SRC}/lib/theme.svelte.ts`,
  node6: `${GEN}/nodes/6.js`,
  kitPage: `${SRC}/routes/kit/button/+page.svelte`,
  button: `${SRC}/lib/components/Button.svelte`,
  adminPage: `${SRC}/routes/(admin)/admin/(app)/+page.svelte`,
  session: `${SRC}/lib/stores/session.svelte.ts`,
  manifest: `${GEN}/../app-manifest.js`,
} as const;

/** Who imports whom (static imports only), and which modules are entries. */
const IMPORTERS: Record<string, string[]> = {
  [ID.payload]: [ID.entry, ID.client, ID.env],
  [ID.client]: [ID.clientEntry],
  [ID.env]: [ID.client],
  [ID.svelte]: [ID.client, ID.rootLayout, ID.kitPage],
  [ID.rootLayout]: [],
  [ID.theme]: [ID.rootLayout],
  [ID.kitPage]: [ID.node6],
  [ID.button]: [ID.kitPage, ID.adminPage],
  [ID.manifest]: [ID.app],
};
const ENTRIES = new Set<string>([ID.entry, ID.payload, ID.app, ID.node6]);

const graph = {
  getModuleInfo: (id: string) => ({ importers: IMPORTERS[id] ?? [], isEntry: ENTRIES.has(id) }),
} as unknown as Rolldown.ChunkingContext;

type NameFn = (id: string, ctx: Rolldown.ChunkingContext) => string | null | undefined;
type TestFn = (id: string) => boolean | undefined | void;

const [boot, startup] = CLIENT_CHUNK_GROUPS;

describe('CLIENT_CHUNK_GROUPS', () => {
  it('boot takes exactly what entry/start imports: the payload and the preload helper', () => {
    const takes = boot.test as TestFn;
    expect(boot.name).toBe('boot');
    expect(takes(ID.payload)).toBe(true);
    expect(takes(ID.helper)).toBe(true);
    expect(takes(ID.client)).toBe(false);
    expect(takes(ID.env)).toBe(false);
  });

  it('boot outranks startup, so the payload never joins the chunk that reads it', () => {
    expect(boot.priority ?? 0).toBeGreaterThan(startup.priority ?? 0);
  });

  it('startup takes what Kit’s client, app.js and the root layout import, at any depth', () => {
    const name = startup.name as NameFn;
    expect(name(ID.client, graph)).toBe('startup');
    expect(name(ID.env, graph)).toBe('startup');
    expect(name(ID.svelte, graph)).toBe('startup');
    expect(name(ID.theme, graph)).toBe('startup');
  });

  it('startup leaves out the boot modules, entries, the root layout itself and page code', () => {
    const name = startup.name as NameFn;
    expect(name(ID.payload, graph)).toBeNull();
    expect(name(ID.helper, graph)).toBeNull();
    expect(name(ID.app, graph)).toBeNull();
    expect(name(ID.rootLayout, graph)).toBeNull();
    expect(name(ID.manifest, graph)).toBeNull();
    expect(name(ID.button, graph)).toBeNull();
    expect(name(ID.kitPage, graph)).toBeNull();
  });

  it('normalises Windows separators before matching', () => {
    const name = startup.name as NameFn;
    const windows = ID.theme.split('/').join('\\');
    const winGraph = {
      getModuleInfo: (id: string) => ({
        importers: id === windows ? [ID.rootLayout.split('/').join('\\')] : [],
        isEntry: false,
      }),
    } as unknown as Rolldown.ChunkingContext;
    expect(name(windows, winGraph)).toBe('startup');
  });
});

describe('clientChunkGuard', () => {
  interface FakeChunk {
    fileName: string;
    name: string;
    isEntry: boolean;
    facadeModuleId: string | null;
    imports: string[];
    moduleIds: string[];
  }
  const chunk = (fileName: string, part: Partial<FakeChunk> = {}): [string, object] => [
    fileName,
    {
      type: 'chunk',
      fileName,
      name: fileName,
      isEntry: false,
      facadeModuleId: null,
      imports: [],
      moduleIds: [],
      ...part,
    },
  ];
  /** The route files each node entry imports. */
  const NODE_ROUTES: Record<string, string[]> = {
    [`${GEN}/nodes/0.js`]: [ID.rootLayout],
    [`${GEN}/nodes/6.js`]: [ID.kitPage],
    [`${GEN}/nodes/7.js`]: [ID.adminPage],
  };

  function bundle(overrides: Record<string, Partial<FakeChunk>> = {}) {
    const chunks = [
      chunk('start.js', {
        name: 'entry/start',
        isEntry: true,
        imports: ['boot.js'],
        moduleIds: [ID.entry],
      }),
      chunk('boot.js', { moduleIds: [ID.payload, ID.helper] }),
      chunk('startup.js', { imports: ['boot.js'], moduleIds: [ID.clientEntry, ID.client, ID.env] }),
      chunk('app.js', {
        name: 'entry/app',
        isEntry: true,
        imports: ['boot.js', 'startup.js'],
        moduleIds: [ID.app],
      }),
      chunk('node0.js', {
        name: 'nodes/0',
        isEntry: true,
        facadeModuleId: `${GEN}/nodes/0.js`,
        imports: ['startup.js'],
      }),
      chunk('node6.js', {
        name: 'nodes/6',
        isEntry: true,
        facadeModuleId: `${GEN}/nodes/6.js`,
        imports: ['startup.js', 'button.js'],
      }),
      chunk('button.js', { moduleIds: [ID.button] }),
      chunk('node7.js', {
        name: 'nodes/7',
        isEntry: true,
        facadeModuleId: `${GEN}/nodes/7.js`,
        imports: ['startup.js', 'button.js', 'admin.js'],
      }),
      chunk('admin.js', { moduleIds: [ID.session] }),
      ['startup.css', { type: 'asset', fileName: 'startup.css' }] as [string, object],
    ];
    const out = Object.fromEntries(chunks);
    for (const [file, part] of Object.entries(overrides)) Object.assign(out[file], part);
    return out;
  }

  function run(environment: string, bundleArg: Record<string, object>): void {
    const plugin = clientChunkGuard();
    const context = {
      environment: { name: environment },
      getModuleInfo: (id: string) => ({ importedIds: NODE_ROUTES[id] ?? [] }),
      error: (message: string) => {
        throw new Error(message);
      },
    };
    (plugin.generateBundle as (this: unknown, ...args: unknown[]) => void).call(
      context,
      {},
      bundleArg,
      false,
    );
  }

  it('passes a build where admin code stays with the admin', () => {
    expect(() => run('client', bundle())).not.toThrow();
  });

  it('fails when a public page would load admin code, naming page, module and chunk', () => {
    expect(() =>
      run('client', bundle({ 'node6.js': { imports: ['startup.js', 'button.js', 'admin.js'] } })),
    ).toThrow(/nodes\/6 loads admin code .*stores\/session\.svelte\.ts \(admin\.js\)/);
  });

  it('fails when admin code lands in a chunk every page loads', () => {
    expect(() =>
      run('client', bundle({ 'startup.js': { moduleIds: [ID.client, ID.session] } })),
    ).toThrow(/entry\/app loads admin code/);
  });

  it('fails when entry/start would load a payload reader before init()', () => {
    expect(() =>
      run('client', bundle({ 'start.js': { imports: ['boot.js', 'startup.js'] } })),
    ).toThrow(/entry\/start loads .*runtime\/client\/client\.js before init\(\)/);
  });

  it('leaves the server build alone', () => {
    expect(() => run('ssr', bundle({ 'node6.js': { imports: ['admin.js'] } }))).not.toThrow();
  });
});
