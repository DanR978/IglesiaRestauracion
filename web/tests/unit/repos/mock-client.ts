/* ============================================================================
 * web/tests/unit/repos/mock-client.ts — recording stand-in for `$lib/db/client`
 * ----------------------------------------------------------------------------
 * Repo tests assert QUERY SHAPE (table, select columns, filters, order) and the
 * never-throw / WriteResult contracts — never real Supabase behaviour
 * (VERIFICATION.md: RLS is covered by staging, not unit tests).
 *
 * `supabase.from(table)` returns a chainable proxy that records every method
 * call and is thenable, resolving to the canned result queued for that table.
 *
 * Usage (top of a test file, before importing the repo):
 *   vi.mock('$lib/db/client', () => import('./mock-client'));
 *   import { mock } from './mock-client';
 *   mock.reset(); mock.results.events = [{ data: [...], error: null }];
 * ========================================================================== */
import { vi } from 'vitest';

export type Call = { method: string; args: unknown[] };
export type Canned = { data?: unknown; error?: { message: string } | null; count?: number | null };
export type Query = { table: string; calls: Call[] };

type Results = Record<string, Canned[]>;

const state = {
  queries: [] as Query[],
  results: {} as Results,
  storage: { calls: [] as Call[], uploadError: null as { message: string } | null },
  channels: [] as { name: string; on: unknown[]; subscribed: boolean }[],
  removed: [] as string[],
};

function queryProxy(q: Query): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        if (prop === 'then') {
          const queue = state.results[q.table] ?? [];
          const next: Canned = queue.length ? (queue.shift() as Canned) : { data: [], error: null };
          const resolved = {
            data: next.data ?? null,
            error: next.error ?? null,
            count: next.count ?? null,
          };
          return (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve(resolved).then(onFulfilled);
        }
        if (typeof prop !== 'string') return undefined;
        return (...args: unknown[]) => {
          q.calls.push({ method: prop, args });
          return proxy;
        };
      },
    },
  );
  return proxy;
}

const bucket = {
  upload: vi.fn(async (...args: unknown[]) => {
    state.storage.calls.push({ method: 'upload', args });
    return { data: null, error: state.storage.uploadError };
  }),
  remove: vi.fn(async (...args: unknown[]) => {
    state.storage.calls.push({ method: 'remove', args });
    return { data: null, error: null };
  }),
  getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } })),
};

export const supabase = {
  from: vi.fn((table: string) => {
    const q: Query = { table, calls: [] };
    state.queries.push(q);
    return queryProxy(q);
  }),
  storage: { from: vi.fn(() => bucket) },
  channel: vi.fn((name: string) => {
    const rec = { name, on: [] as unknown[], subscribed: false };
    state.channels.push(rec);
    const ch = {
      on: vi.fn((...args: unknown[]) => {
        rec.on.push(args);
        return ch;
      }),
      subscribe: vi.fn(() => {
        rec.subscribed = true;
        return ch;
      }),
      topic: name,
    };
    return ch;
  }),
  removeChannel: vi.fn(async (ch: { topic: string }) => {
    state.removed.push(ch.topic);
    return 'ok';
  }),
};

export const mock = {
  get queries(): Query[] {
    return state.queries;
  },
  get results(): Results {
    return state.results;
  },
  get storage() {
    return state.storage;
  },
  get channels() {
    return state.channels;
  },
  get removed(): string[] {
    return state.removed;
  },
  /** The n-th query issued (default: the only one). */
  query(n = 0): Query {
    const q = state.queries[n];
    if (!q) throw new Error(`no query #${n} recorded (have ${state.queries.length})`);
    return q;
  },
  /** Method names in call order, e.g. ['select','eq','order']. */
  chain(n = 0): string[] {
    return mock.query(n).calls.map((c) => c.method);
  },
  /** The args of the first call to `method` on query n. */
  args(method: string, n = 0): unknown[] {
    const c = mock.query(n).calls.find((x) => x.method === method);
    if (!c) throw new Error(`query #${n} never called .${method}()`);
    return c.args;
  },
  reset(): void {
    state.queries = [];
    state.results = {};
    state.storage.calls = [];
    state.storage.uploadError = null;
    state.channels = [];
    state.removed = [];
    supabase.from.mockClear();
    supabase.channel.mockClear();
    supabase.removeChannel.mockClear();
    bucket.upload.mockClear();
    bucket.remove.mockClear();
  },
};
