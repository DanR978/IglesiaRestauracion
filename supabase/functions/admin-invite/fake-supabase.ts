// supabase/functions/admin-invite/fake-supabase.ts
// ─────────────────────────────────────────────────────────────────────────────
// Test double for the slice of supabase-js that handler.ts uses: in-memory
// tables behind a small PostgREST-style builder (column projection, eq/in
// filters, order, limit, single/maybeSingle, count+head, the unique and NOT
// NULL constraints the function relies on), the GoTrue user/admin calls,
// rpc(), an ordered call log and error injection. Test-only: nothing the
// function deploys imports it.
//
// Usage:
//   const db = new FakeSupabase();
//   db.addUser({ id, email, email_confirmed_at: null });
//   db.table("profiles").push({ id, display_name: "Ana", role: "admin", allowed_tabs: [] });
//   db.failOn("update:profiles", { message: "boom" });   // or "auth.deleteUser", "rpc:<name>"…
//   handleRequest(req, { createAdminClient: () => db, … });
//   db.log  // ["auth.getUser", "select:profiles", "rpc:admin_revoke_user_sessions", …]
// ─────────────────────────────────────────────────────────────────────────────

import type { AdminClient } from "./handler.ts";

export type Row = Record<string, unknown>;

export interface FakeError {
  message: string;
  code?: string;
  status?: number;
}

export interface FakeFactor {
  id: string;
  status: "verified" | "unverified";
  factor_type?: string;
}

export interface FakeUser {
  id: string;
  email?: string;
  email_confirmed_at: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string;
  invited_at?: string;
  user_metadata?: Row;
  factors?: FakeFactor[];
}

export interface Result {
  data: unknown;
  error: FakeError | null;
  count?: number | null;
}

const UUID_TABLES = new Set(["role_presets", "invitations", "audit_log", "ministries"]);
const STAMPED_TABLES = new Set(["role_presets", "invitations", "audit_log"]);

function project(row: Row, columns: string): Row {
  if (columns.trim() === "*") return structuredClone(row);
  const out: Row = {};
  for (const col of columns.split(",").map((s) => s.trim()).filter(Boolean)) {
    out[col] = structuredClone(row[col] ?? null);
  }
  return out;
}

function subOf(jwt: string): string | null {
  try {
    const seg = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(seg.padEnd(seg.length + ((4 - (seg.length % 4)) % 4), "=")));
    return typeof claims?.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

export class FakeSupabase implements AdminClient {
  tables: Record<string, Row[]> = {};
  users = new Map<string, FakeUser>();
  log: string[] = [];
  sentInvites: string[] = [];
  revokedSessions: string[] = [];
  // Binds a token to a user other than its `sub` (to fake a mismatch).
  tokenOwners = new Map<string, string>();
  private failures = new Map<string, { error: FakeError; skip: number }>();
  private rpcs = new Map<string, (args: Row) => Result>();
  private clock = Date.parse("2026-10-18T12:00:00Z");

  constructor() {
    this.rpcs.set("admin_revoke_user_sessions", (args) => {
      this.revokedSessions.push(String(args.p_user_id));
      return { data: null, error: null };
    });
  }

  // Calls to `op` fail with `error` — all of them, or all after the first
  // `skip` (e.g. skip 1 on "select:profiles" spares the caller's own lookup).
  failOn(op: string, error: FakeError, skip = 0): this {
    this.failures.set(op, { error, skip });
    return this;
  }

  // Simulates a database without the function (e.g. migration not applied).
  dropRpc(name: string): this {
    this.rpcs.delete(name);
    return this;
  }

  failure(op: string): FakeError | undefined {
    const f = this.failures.get(op);
    if (!f) return undefined;
    if (f.skip > 0) {
      f.skip--;
      return undefined;
    }
    return f.error;
  }

  table(name: string): Row[] {
    return this.tables[name] ??= [];
  }

  addUser(user: FakeUser): void {
    this.users.set(user.id, structuredClone({ factors: [], user_metadata: {}, ...user }));
  }

  now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  withDefaults(table: string, row: Row): Row {
    const out = { ...row };
    if (UUID_TABLES.has(table) && out.id === undefined) out.id = crypto.randomUUID();
    if (STAMPED_TABLES.has(table) && out.created_at === undefined) out.created_at = this.now();
    if (table === "invitations" && out.status === undefined) out.status = "pending";
    return out;
  }

  // The constraints of the real schema that the function's logic depends on.
  violation(table: string, row: Row, others: Row[]): FakeError | null {
    const dup = { code: "23505", message: `duplicate key value violates unique constraint on ${table}` };
    const notNull = (col: string) =>
      row[col] === null || row[col] === undefined
        ? { code: "23502", message: `null value in column "${col}" of relation "${table}"` }
        : null;
    switch (table) {
      case "profiles":
        if (others.some((r) => r.id === row.id)) return dup;
        return notNull("display_name") ?? notNull("role");
      case "role_presets":
        if (others.some((r) => r.slug === row.slug)) return dup;
        return notNull("name") ?? notNull("slug") ?? notNull("base_role");
      case "invitations": {
        const email = String(row.email ?? "").toLowerCase();
        if (row.status === "pending" &&
          others.some((r) => r.status === "pending" && String(r.email ?? "").toLowerCase() === email)) return dup;
        return notNull("email");
      }
      case "audit_log":
        return notNull("action") ?? notNull("entity");
      default:
        return null;
    }
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  rpc(name: string, args: Row): Promise<Result> {
    this.log.push(`rpc:${name}`);
    const injected = this.failure(`rpc:${name}`);
    if (injected) return Promise.resolve({ data: null, error: injected });
    const fn = this.rpcs.get(name);
    if (!fn) {
      return Promise.resolve({
        data: null,
        error: { code: "PGRST202", message: `Could not find the function public.${name} in the schema cache` },
      });
    }
    return Promise.resolve(fn(args));
  }

  private userOrMissing(id: string): { data: { user: FakeUser | null }; error: FakeError | null } {
    const user = this.users.get(id);
    return user
      ? { data: { user: structuredClone(user) }, error: null }
      : { data: { user: null }, error: { status: 404, code: "user_not_found", message: "User not found" } };
  }

  auth: AdminClient["auth"] = {
    getUser: (jwt: string) => {
      this.log.push("auth.getUser");
      const injected = this.failure("auth.getUser");
      if (injected) return Promise.resolve({ data: { user: null }, error: injected });
      const sub = this.tokenOwners.get(jwt) ?? subOf(jwt);
      const user = sub ? this.users.get(sub) : undefined;
      return Promise.resolve(
        user
          ? { data: { user: structuredClone(user) }, error: null }
          : { data: { user: null }, error: { status: 403, code: "bad_jwt", message: "invalid JWT" } },
      );
    },
    admin: {
      getUserById: (id: string) => {
        this.log.push("auth.getUserById");
        const injected = this.failure(`auth.getUserById:${id}`) ?? this.failure("auth.getUserById");
        if (injected) return Promise.resolve({ data: { user: null }, error: injected });
        return Promise.resolve(this.userOrMissing(id));
      },
      // Like GoTrue's GET /admin/users, the list carries no MFA factors; only
      // getUserById does.
      listUsers: (_opts?: { page?: number; perPage?: number }) => {
        this.log.push("auth.listUsers");
        const injected = this.failure("auth.listUsers");
        if (injected) return Promise.resolve({ data: { users: [] }, error: injected });
        const users = [...this.users.values()].map(({ factors: _factors, ...u }) => structuredClone(u));
        return Promise.resolve({ data: { users }, error: null });
      },
      inviteUserByEmail: (email: string, opts?: { data?: Row; redirectTo?: string }) => {
        this.log.push("auth.inviteUserByEmail");
        const injected = this.failure("auth.inviteUserByEmail");
        if (injected) return Promise.resolve({ data: { user: null }, error: injected });
        const existing = [...this.users.values()].find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
        if (existing?.email_confirmed_at) {
          return Promise.resolve({
            data: { user: null },
            error: { status: 422, code: "email_exists", message: "A user with this email address has already been registered" },
          });
        }
        // GoTrue re-sends to an existing unconfirmed user and creates one otherwise.
        const user = existing ?? {
          id: crypto.randomUUID(),
          email,
          email_confirmed_at: null,
          created_at: this.now(),
          user_metadata: structuredClone(opts?.data ?? {}),
          factors: [],
        };
        user.invited_at = this.now();
        this.users.set(user.id, user);
        this.sentInvites.push(email);
        return Promise.resolve({ data: { user: structuredClone(user) }, error: null });
      },
      deleteUser: (id: string) => {
        this.log.push("auth.deleteUser");
        const injected = this.failure("auth.deleteUser");
        if (injected) return Promise.resolve({ data: { user: null }, error: injected });
        if (!this.users.delete(id)) {
          return Promise.resolve({ data: { user: null }, error: { status: 404, code: "user_not_found", message: "User not found" } });
        }
        // profiles.id → auth.users ON DELETE CASCADE
        const profiles = this.table("profiles");
        for (let i = profiles.length - 1; i >= 0; i--) if (profiles[i].id === id) profiles.splice(i, 1);
        return Promise.resolve({ data: { user: null }, error: null });
      },
      mfa: {
        deleteFactor: ({ id, userId }: { id: string; userId: string }) => {
          this.log.push("auth.mfa.deleteFactor");
          const injected = this.failure("auth.mfa.deleteFactor");
          if (injected) return Promise.resolve({ data: null, error: injected });
          const user = this.users.get(userId);
          if (user) user.factors = (user.factors ?? []).filter((f) => f.id !== id);
          return Promise.resolve({ data: { id }, error: null });
        },
      },
    },
  };
}

type Op = "select" | "insert" | "update" | "upsert" | "delete";

export class FakeQuery {
  private op: Op = "select";
  private columns = "*";
  private payload: Row | Row[] = {};
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<[string, boolean]> = [];
  private max: number | null = null;
  private returning: string | null = null;
  private head = false;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private conflictKey = "id";

  constructor(private db: FakeSupabase, private name: string) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }): this {
    if (this.op === "select") {
      this.columns = columns;
      this.head = !!opts?.head;
    } else {
      this.returning = columns;
    }
    return this;
  }

  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.payload = rows;
    return this;
  }

  update(values: Row): this {
    this.op = "update";
    this.payload = values;
    return this;
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = "upsert";
    this.payload = rows;
    this.conflictKey = opts?.onConflict ?? "id";
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orders.push([column, opts?.ascending !== false]);
    return this;
  }

  limit(n: number): this {
    this.max = n;
    return this;
  }

  single(): this {
    this.mode = "single";
    return this;
  }

  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }

  private run(): Result {
    const key = `${this.op}:${this.name}`;
    this.db.log.push(key);
    const injected = this.db.failure(key);
    if (injected) return { data: null, error: injected };

    const rows = this.db.table(this.name);
    const matching = () => rows.filter((row) => this.filters.every((f) => f(row)));
    const inputs = () => (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => structuredClone(r));

    switch (this.op) {
      case "select": {
        let out = matching();
        for (const [col, asc] of [...this.orders].reverse()) {
          out = [...out].sort((a, b) => {
            const x = a[col] as string | number | boolean, y = b[col] as string | number | boolean;
            return x === y ? 0 : (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (this.max !== null) out = out.slice(0, this.max);
        if (this.head) return { data: null, error: null, count: out.length };
        return this.shape(out, this.columns);
      }
      case "insert": {
        const added: Row[] = [];
        for (const input of inputs()) {
          const row = this.db.withDefaults(this.name, input);
          const err = this.db.violation(this.name, row, rows);
          if (err) return { data: null, error: err };
          rows.push(row);
          added.push(row);
        }
        return this.returning === null ? { data: null, error: null } : this.shape(added, this.returning);
      }
      case "update": {
        const hit = matching();
        for (const row of hit) {
          const next = { ...row, ...inputs()[0] };
          const err = this.db.violation(this.name, next, rows.filter((r) => r !== row));
          if (err) return { data: null, error: err };
          Object.assign(row, next);
        }
        return this.returning === null ? { data: null, error: null } : this.shape(hit, this.returning);
      }
      case "upsert": {
        for (const input of inputs()) {
          const existing = rows.find((r) => r[this.conflictKey] === input[this.conflictKey]);
          const next = existing ? { ...existing, ...input } : this.db.withDefaults(this.name, input);
          const err = this.db.violation(this.name, next, rows.filter((r) => r !== existing));
          if (err) return { data: null, error: err };
          if (existing) Object.assign(existing, next);
          else rows.push(next);
        }
        return { data: null, error: null };
      }
      case "delete": {
        const hit = new Set(matching());
        for (let i = rows.length - 1; i >= 0; i--) if (hit.has(rows[i])) rows.splice(i, 1);
        return { data: null, error: null };
      }
    }
  }

  private shape(rows: Row[], columns: string): Result {
    const picked = rows.map((row) => project(row, columns));
    if (this.mode === "many") return { data: picked, error: null };
    if (picked.length > 1 || (this.mode === "single" && picked.length === 0)) {
      return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
    }
    return { data: picked[0] ?? null, error: null };
  }
}
