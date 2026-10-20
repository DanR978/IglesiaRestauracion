/* ============================================================================
 * web/tests/unit/repos/mock-client.ts — recording stand-in for `#lib/db/client.js`
 * ----------------------------------------------------------------------------
 * Repo tests assert QUERY SHAPE (table, select columns, filters, order) and the
 * never-throw / ReadResult / WriteResult contracts — never real Supabase
 * behaviour (VERIFICATION.md: RLS is covered by staging, not unit tests).
 *
 * `supabase.from(table)` returns a chainable proxy that records every method
 * call and is thenable, resolving to the canned result queued for that table.
 * Like postgrest-js, the result carries the HTTP `status` (200 by default, 500
 * when the canned result has an `error`) and the `count` a `{ count: 'exact' }`
 * write reports — a delete/update that must affect a row needs `count: 1`.
 *
 * `supabase.auth.getSession()` answers a signed-in session (user `TEST_USER_ID`)
 * unless a test sets `mock.session` (staff-only repos check it first —
 * repos/session.ts).
 *
 * `supabase.rpc(fn, args)` records a query on the table `rpc:<fn>` (its one
 * call is `rpc` with `[fn, args]`) and resolves to `mock.results['rpc:<fn>']`.
 * `supabase.storage.from(bucket)` records the bucket in `mock.storage.buckets`.
 *
 * Usage (top of a test file, before importing the repo):
 *   vi.mock('#lib/db/client.js', () => import('./mock-client'));
 *   import { mock } from './mock-client';
 *   mock.reset(); mock.results.events = [{ data: [...], error: null }];
 * ========================================================================== */
import { vi } from 'vitest';

export type Call = { method: string; args: unknown[] };
export type CannedError = { message: string; code?: string; details?: string; hint?: string };
export type Canned = {
  data?: unknown;
  error?: CannedError | null;
  count?: number | null;
  status?: number;
};
export type Query = { table: string; calls: Call[] };
/** A Storage API error as storage-js builds it (`statusCode` is the body's status). */
export type StorageFailure = {
  message: string;
  name?: string;
  status?: number;
  statusCode?: string;
};

type Results = Record<string, Canned[]>;
/** What `auth.getSession()` resolves to. */
export type SessionResult = {
  data: { session: { access_token: string; user: { id: string } } | null };
  error: { name?: string; message: string; status?: number } | null;
};

/** The signed-in user of the default session. */
export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

const SIGNED_IN: SessionResult = {
  data: { session: { access_token: 'test-token', user: { id: TEST_USER_ID } } },
  error: null,
};

const state = {
  queries: [] as Query[],
  results: {} as Results,
  storage: {
    calls: [] as Call[],
    buckets: [] as string[],
    uploadError: null as StorageFailure | null,
  },
  channels: [] as { name: string; on: unknown[]; subscribed: boolean }[],
  removed: [] as string[],
  session: SIGNED_IN as SessionResult,
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
            status: next.status ?? (next.error ? 500 : 200),
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
  auth: { getSession: vi.fn(async () => state.session) },
  from: vi.fn((table: string) => {
    const q: Query = { table, calls: [] };
    state.queries.push(q);
    return queryProxy(q);
  }),
  rpc: vi.fn((fn: string, args?: unknown) => {
    const q: Query = { table: `rpc:${fn}`, calls: [{ method: 'rpc', args: [fn, args] }] };
    state.queries.push(q);
    return queryProxy(q);
  }),
  storage: {
    from: vi.fn((name?: string) => {
      if (name !== undefined) state.storage.buckets.push(name);
      return bucket;
    }),
  },
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
  /** Set to `{ data: { session: null }, error: null }` for a signed-out client. */
  set session(value: SessionResult) {
    state.session = value;
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
    state.storage.buckets = [];
    state.storage.uploadError = null;
    state.channels = [];
    state.removed = [];
    state.session = SIGNED_IN;
    supabase.auth.getSession.mockClear();
    supabase.from.mockClear();
    supabase.rpc.mockClear();
    supabase.storage.from.mockClear();
    supabase.channel.mockClear();
    supabase.removeChannel.mockClear();
    bucket.upload.mockClear();
    bucket.remove.mockClear();
  },
};
