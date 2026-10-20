// supabase/functions/admin-invite/handler.test.ts
// End-to-end tests of handleRequest against FakeSupabase: the authorization
// gate for every action, each action's guards, the order of destructive steps
// and the { code, error } contract. Run: deno test supabase/functions

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { handleRequest } from "./handler.ts";
import { type Action, ACTIONS, type ErrorCode, ERRORS, errorBody, SEED_PRESETS } from "./lib.ts";
import { FakeSupabase, type FakeUser, type Row } from "./fake-supabase.ts";

const NOW = new Date("2026-10-18T12:00:00Z");
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const DEV1 = uuid(1);        // the caller in most tests
const DEV2 = uuid(2);
const ADMIN = uuid(3);       // Administrador: admin without the system tabs
const LEADER = uuid(4);
const TREASURER = uuid(5);
const PENDING = uuid(6);     // invited, not yet accepted
const NO_PROFILE = uuid(7);
const M1 = uuid(0x101);
const M2 = uuid(0x102);
const P_DEV = uuid(0x201);
const P_ADMIN = uuid(0x202);
const P_TES = uuid(0x203);
const P_MEDIOS = uuid(0x204);
const P_CUSTOM = uuid(0x205);
const MISSING = uuid(0xfff);

const DEV_TABS = ["ministries", "users", "activity", "settings"];
const MEDIOS_TABS = ["upcoming", "calendario", "special-events", "galeria"];
const CONFIRMED_AT = "2026-01-01T00:00:00Z";
const ORIGIN = "https://www.irdlex.org";

function world(): FakeSupabase {
  const db = new FakeSupabase();
  const user = (id: string, email: string, extra: Partial<FakeUser> = {}) =>
    db.addUser({
      id, email, email_confirmed_at: CONFIRMED_AT, banned_until: null, created_at: CONFIRMED_AT,
      factors: [{ id: `${id.slice(0, -3)}f00`, status: "verified", factor_type: "totp" }], ...extra,
    });
  user(DEV1, "dev1@irdlex.org");
  user(DEV2, "dev2@irdlex.org");
  user(ADMIN, "admin@irdlex.org");
  user(LEADER, "luis@irdlex.org");
  user(TREASURER, "tere@irdlex.org");
  user(PENDING, "nuevo@irdlex.org", { email_confirmed_at: null, factors: [], user_metadata: { display_name: "Nuevo" } });
  user(NO_PROFILE, "sinperfil@irdlex.org");

  const profile = (id: string, display_name: string, role: string, allowed_tabs: string[], preset_id: string, ministry_ids: string[] = []) =>
    ({ id, display_name, role, allowed_tabs, preset_id, ministry_ids, ministry_id: ministry_ids[0] ?? null, avatar_url: null });
  db.table("profiles").push(
    profile(DEV1, "Dev Uno", "admin", DEV_TABS, P_DEV),
    profile(DEV2, "Dev Dos", "admin", DEV_TABS, P_DEV),
    profile(ADMIN, "Ana Admin", "admin", [], P_ADMIN),
    profile(LEADER, "Luis Líder", "ministry_leader", MEDIOS_TABS, P_MEDIOS, [M1]),
    profile(TREASURER, "Tere Tesorera", "treasurer", [], P_TES),
    profile(PENDING, "Nuevo", "ministry_leader", MEDIOS_TABS, P_MEDIOS),
  );
  db.table("ministries").push({ id: M1, name: "Jóvenes" }, { id: M2, name: "Niños" });
  const presetIds: Record<string, string> = { developer: P_DEV, administrador: P_ADMIN, tesoreria: P_TES, medios: P_MEDIOS };
  for (const p of SEED_PRESETS) {
    db.table("role_presets").push({ ...structuredClone(p), allowed_tabs: [...p.allowed_tabs], id: presetIds[p.slug], created_at: CONFIRMED_AT });
  }
  db.table("role_presets").push({
    id: P_CUSTOM, name: "Ujieres", slug: "ujieres", base_role: "ministry_leader", allowed_tabs: ["upcoming"],
    icon: "fa-users", color: "#123456", is_system: false, created_at: CONFIRMED_AT,
  });
  db.table("app_settings").push({ key: "features", value: { pause_invites: false, maintenance: false } });
  // The row reads 'accepted' although the account is still pending.
  db.table("invitations").push({ id: uuid(0x301), email: "nuevo@irdlex.org", status: "accepted", role: "ministry_leader", created_at: "2026-10-10T00:00:00Z" });
  return db;
}

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims: Row) => `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(claims))}.c2ln`;
const claimsFor = (sub: string, aal = "aal2") => ({ sub, aal, role: "authenticated", session_id: uuid(0x999) });

interface CallOpts {
  claims?: Row;
  token?: string | null;
  method?: string;
  origin?: string | null;
  env?: Record<string, string | undefined>;
  rawBody?: string;
}

async function call(db: FakeSupabase, body: unknown, opts: CallOpts = {}) {
  const method = opts.method ?? "POST";
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = opts.token === undefined ? jwt(opts.claims ?? claimsFor(DEV1)) : opts.token;
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  if (opts.origin !== null) headers.set("Origin", opts.origin ?? ORIGIN);
  const req = new Request("http://localhost:54321/functions/v1/admin-invite", {
    method,
    headers,
    body: method === "POST" ? (opts.rawBody ?? JSON.stringify(body)) : undefined,
  });
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    ...opts.env,
  };
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const res = await handleRequest(req, {
      env: (name) => env[name],
      createAdminClient: () => db,
      now: () => NOW,
    });
    const text = await res.text();
    return { res, status: res.status, body: text ? JSON.parse(text) : null, text, logs };
  } finally {
    console.error = original;
  }
}

function assertFails(r: { status: number; body: unknown }, code: ErrorCode) {
  assertEquals(r.body, errorBody(code));
  assertEquals(r.status, ERRORS[code].status);
}

const WRITE_RE = /^(insert|update|upsert|delete):|^auth\.(inviteUserByEmail|deleteUser|mfa)|^rpc:/;
const writes = (db: FakeSupabase) => db.log.filter((k) => WRITE_RE.test(k));
const snapshot = (db: FakeSupabase) => JSON.stringify({ tables: db.tables, users: [...db.users.entries()] });
const profileOf = (db: FakeSupabase, id: string) => db.table("profiles").find((p) => p.id === id);
const auditRows = (db: FakeSupabase) => db.table("audit_log");

// A request each action accepts from a developer at aal2 (positive control
// for the gate tests: the refusals below come from the gate, not the input).
const VALID: Record<Action, Row> = {
  "list": {},
  "invite": { email: "otro@irdlex.org", display_name: "Otro Nuevo", preset_id: P_MEDIOS, ministry_ids: [M1] },
  "resend": { user_id: PENDING },
  "revoke": { user_id: PENDING },
  "set-role": { user_id: LEADER, preset_id: P_ADMIN, ministry_ids: [] },
  "delete": { user_id: LEADER },
  "reset-mfa": { user_id: DEV2 },
  "list-presets": {},
  "save-preset": { id: P_MEDIOS, name: "Medios", base_role: "ministry_leader", allowed_tabs: ["upcoming"], icon: "fa-photo-film", color: "#2a4a9e" },
  "delete-preset": { id: P_CUSTOM },
};

// ── Transport: CORS, method, configuration ───────────────────────────────────
Deno.test("OPTIONS short-circuits with CORS for an allowed origin, before any auth", async () => {
  const db = world();
  const r = await call(db, null, { method: "OPTIONS", origin: "http://localhost:5173" });
  assertEquals(r.status, 204);
  assertEquals(r.res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
  assertEquals(r.res.headers.get("Vary"), "Origin");
  assertEquals(r.res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assertEquals(db.log, []);
});

Deno.test("a disallowed origin gets no Allow-Origin header, on preflight or response", async () => {
  const pre = await call(world(), null, { method: "OPTIONS", origin: "https://evil.example" });
  assertEquals(pre.res.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(pre.res.headers.get("Vary"), "Origin");
  const res = await call(world(), { action: "list" }, { origin: "https://evil.example" });
  assertEquals(res.res.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("ALLOWED_ORIGINS replaces the default origin list", async () => {
  const env = { ALLOWED_ORIGINS: "https://staging.irdlex.org" };
  const ok = await call(world(), null, { method: "OPTIONS", origin: "https://staging.irdlex.org", env });
  assertEquals(ok.res.headers.get("Access-Control-Allow-Origin"), "https://staging.irdlex.org");
  const prod = await call(world(), null, { method: "OPTIONS", origin: ORIGIN, env });
  assertEquals(prod.res.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("error responses carry CORS + JSON + no-store headers", async () => {
  const r = await call(world(), { action: "list" }, { claims: claimsFor(DEV1, "aal1") });
  assertFails(r, "aal2_required");
  assertEquals(r.res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assertEquals(r.res.headers.get("Content-Type"), "application/json");
  assertEquals(r.res.headers.get("Cache-Control"), "no-store");
});

Deno.test("non-POST methods are refused", async () => {
  for (const method of ["GET", "PUT", "DELETE"]) {
    assertFails(await call(world(), null, { method }), "method_not_allowed");
  }
});

Deno.test("missing service configuration fails closed", async () => {
  const db = world();
  const r = await call(db, { action: "list" }, { env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
  assertFails(r, "not_configured");
  assertEquals(db.log, []);
  assert(r.logs.some((l) => l.startsWith("[admin-invite]")));
});

// ── Authentication ───────────────────────────────────────────────────────────
Deno.test("no bearer token → unauthorized, nothing called", async () => {
  const db = world();
  assertFails(await call(db, { action: "list" }, { token: null }), "unauthorized");
  assertFails(await call(db, { action: "list" }, { token: "" }), "unauthorized");
  assertEquals(db.log, []);
});

Deno.test("a token GoTrue rejects → invalid_session", async () => {
  const db = world();
  assertFails(await call(db, { action: "list" }, { claims: claimsFor(MISSING) }), "invalid_session");
  assertEquals(db.log, ["auth.getUser"]);
});

Deno.test("GoTrue unavailable → internal (not a session error), detail only in the log", async () => {
  const db = world().failOn("auth.getUser", { status: 503, message: "upstream secret detail" });
  const r = await call(db, { action: "list" });
  assertFails(r, "internal");
  assertFalse(r.text.includes("secret"));
  assert(r.logs.some((l) => l.includes("[admin-invite]") && l.includes("upstream secret detail")));
});

Deno.test("claims that do not belong to the verified user → invalid_session", async () => {
  const db = world();
  const token = jwt(claimsFor(DEV2));
  db.tokenOwners.set(token, DEV1);     // GoTrue says DEV1, the payload says DEV2
  assertFails(await call(db, { action: "list" }, { token }), "invalid_session");
  const garbage = "not-a-jwt";
  db.tokenOwners.set(garbage, DEV1);
  assertFails(await call(db, { action: "list" }, { token: garbage }), "invalid_session");
});

// ── The gate, for EVERY action ───────────────────────────────────────────────
Deno.test("positive control: a developer at aal2 can run every action", async () => {
  for (const action of ACTIONS) {
    const r = await call(world(), { action, ...VALID[action] });
    assertEquals(r.status, 200, `${action}: ${r.text}`);
  }
});

Deno.test("aal1 (or no aal claim) is refused for every action and changes nothing", async () => {
  for (const claims of [claimsFor(DEV1, "aal1"), { sub: DEV1, role: "authenticated" }]) {
    for (const action of [...ACTIONS, "bogus"]) {
      const db = world();
      const before = snapshot(db);
      const r = await call(db, { action, ...VALID[action as Action] }, { claims });
      assertFails(r, "aal2_required");
      assertEquals(snapshot(db), before, action);
      assertEquals(writes(db), [], action);
    }
  }
});

Deno.test("non-developer tiers are refused for every action, even at aal2", async () => {
  const forgeLeader = (db: FakeSupabase) => { profileOf(db, LEADER)!.allowed_tabs = [...MEDIOS_TABS, "users"]; };
  const cases: Array<[string, string, (db: FakeSupabase) => void]> = [
    ["Administrador", ADMIN, () => {}],
    ["Tesorería", TREASURER, () => {}],
    ["leader", LEADER, () => {}],
    ["leader with a 'users' tab", LEADER, forgeLeader],
    ["account without a profile", NO_PROFILE, () => {}],
    ["developer not confirmed", DEV2, (db) => { db.users.get(DEV2)!.email_confirmed_at = null; }],
    ["developer banned", DEV2, (db) => { db.users.get(DEV2)!.banned_until = "2027-01-01T00:00:00Z"; }],
    ["developer with an unreadable ban", DEV2, (db) => { db.users.get(DEV2)!.banned_until = "forever"; }],
    ["developer soft-deleted", DEV2, (db) => { db.users.get(DEV2)!.deleted_at = "2026-10-01T00:00:00Z"; }],
  ];
  for (const [label, caller, setup] of cases) {
    for (const action of [...ACTIONS, "bogus"]) {
      const db = world();
      setup(db);
      const before = snapshot(db);
      const r = await call(db, { action, ...VALID[action as Action] }, { claims: claimsFor(caller) });
      assertFails(r, "forbidden");
      assertEquals(snapshot(db), before, `${label} / ${action}`);
      assertEquals(writes(db), [], `${label} / ${action}`);
    }
  }
});

Deno.test("an expired ban does not block a developer", async () => {
  const db = world();
  db.users.get(DEV1)!.banned_until = "2026-01-01T00:00:00Z";
  assertEquals((await call(db, { action: "list" })).status, 200);
});

Deno.test("failing to load the caller fails closed as internal", async () => {
  const a = world().failOn("select:profiles", { message: "db secret" });
  const ra = await call(a, { action: "list" });
  assertFails(ra, "internal");
  assertFalse(ra.text.includes("secret"));
  const b = world().failOn(`auth.getUserById:${DEV1}`, { status: 500, message: "gotrue secret" });
  assertFails(await call(b, { action: "list" }), "internal");
  // The caller vanished between the two GoTrue calls → not a developer.
  const c = world().failOn(`auth.getUserById:${DEV1}`, { status: 404, code: "user_not_found", message: "User not found" });
  assertFails(await call(c, { action: "list" }), "forbidden");
});

// ── Body / dispatch ──────────────────────────────────────────────────────────
Deno.test("malformed bodies and unknown actions are refused after the gate", async () => {
  assertFails(await call(world(), null, { rawBody: "{nope" }), "invalid_request");
  assertFails(await call(world(), null, { rawBody: "[]" }), "invalid_request");
  assertFails(await call(world(), null, { rawBody: '"list"' }), "invalid_request");
  assertFails(await call(world(), null, { rawBody: JSON.stringify({ action: "list", pad: "x".repeat(40_000) }) }), "payload_too_large");
  for (const action of ["bogus", "", "constructor", "__proto__", "toString", "hasOwnProperty", 42, null]) {
    assertFails(await call(world(), { action }), "unknown_action");
  }
  // An aal1 caller learns nothing about the body: the gate answers first.
  assertFails(await call(world(), null, { rawBody: "{nope", claims: claimsFor(DEV1, "aal1") }), "aal2_required");
});

// ── list ─────────────────────────────────────────────────────────────────────
Deno.test("list: legacy fields plus invitation_status reconciled from the auth user", async () => {
  const db = world();
  // A confirmed account whose invitation row was never updated (OAuth acceptance).
  db.table("invitations").push({ id: uuid(0x302), email: "luis@irdlex.org", status: "pending", created_at: "2026-09-01T00:00:00Z" });
  db.users.get(TREASURER)!.factors = [{ id: "tere-f00", status: "unverified" }];
  // A pending invitation has no factor to read: looking it up would fail here.
  db.failOn(`auth.getUserById:${PENDING}`, { status: 500, message: "not expected" });
  const r = await call(db, { action: "list" });
  assertEquals(r.status, 200);
  const users = r.body.users as Row[];
  const byId = new Map(users.map((u) => [u.id, u]));
  const leader = byId.get(LEADER)!;
  assertEquals(leader.invitation_status, "accepted");
  assertEquals(leader.confirmed, true);
  assertEquals(leader.ministries, ["Jóvenes"]);
  assertEquals(leader.preset, "Medios");
  // The listUsers rows carry no factors; mfa comes from each account's own read.
  assertEquals(leader.mfa, true);
  assertEquals(byId.get(TREASURER)!.mfa, false);        // only a verified factor counts
  const pending = byId.get(PENDING)!;
  assertEquals(pending.invitation_status, "pending");   // row says 'accepted'
  assertEquals(pending.confirmed, false);
  assertEquals(pending.mfa, false);
  assertEquals(Object.keys(leader).sort(), [
    "allowed_tabs", "avatar_url", "confirmed", "created_at", "display_name", "email", "id", "invitation_status",
    "last_sign_in", "mfa", "ministries", "ministry", "ministry_id", "ministry_ids", "preset", "preset_id", "role",
  ]);
  assertEquals(writes(db), []);
});

Deno.test("list: a failed read is an error, never a partial list", async () => {
  for (const op of ["auth.listUsers", "select:ministries", "select:role_presets", "select:invitations"]) {
    const r = await call(world().failOn(op, { message: "secret" }), { action: "list" });
    assertFails(r, "internal");
  }
  // An account's factor read failing would misreport its 2FA state.
  const r = await call(world().failOn(`auth.getUserById:${LEADER}`, { status: 500, message: "secret" }), { action: "list" });
  assertFails(r, "internal");
  assertFalse(r.text.includes("secret"));
});

Deno.test("list: an account deleted between the list and its factor read shows no 2FA", async () => {
  const db = world().failOn(`auth.getUserById:${LEADER}`, { status: 404, code: "user_not_found", message: "User not found" });
  const r = await call(db, { action: "list" });
  assertEquals(r.status, 200);
  assertEquals((r.body.users as Row[]).find((u) => u.id === LEADER)!.mfa, false);
});

// ── invite ───────────────────────────────────────────────────────────────────
Deno.test("invite: paused invitations refuse first, before validation and any call", async () => {
  const db = world();
  db.table("app_settings")[0].value = { pause_invites: true };
  for (const body of [VALID.invite, { email: "bad", display_name: "" }]) {
    db.log.length = 0;
    const r = await call(db, { action: "invite", ...body });
    assertFails(r, "invites_paused");
    assertEquals(db.log.slice(db.log.indexOf("select:app_settings") + 1), []);   // nothing after the check
  }
});

Deno.test("invite: unreadable settings fail closed", async () => {
  const db = world().failOn("select:app_settings", { message: "secret" });
  assertFails(await call(db, { action: "invite", ...VALID.invite }), "internal");
  assertEquals(writes(db), []);
});

Deno.test("invite: input validation", async () => {
  const base = VALID.invite;
  const cases: Array<[Row, ErrorCode]> = [
    [{ ...base, email: "no-at-sign" }, "invalid_email"],
    [{ ...base, email: undefined }, "invalid_email"],
    [{ ...base, display_name: "A" }, "invalid_display_name"],
    [{ ...base, display_name: "x".repeat(81) }, "invalid_display_name"],
    [{ ...base, display_name: undefined }, "invalid_display_name"],
    [{ ...base, preset_id: "not-a-uuid" }, "invalid_preset_id"],
    [{ ...base, preset_id: MISSING }, "preset_not_found"],
    [{ ...base, preset_id: undefined, role: "owner" }, "invalid_role"],
    [{ ...base, ministry_ids: ["x"] }, "invalid_ministry"],
    [{ ...base, ministry_ids: [M1, MISSING] }, "invalid_ministry"],
    [{ ...base, email: "LUIS@irdlex.org" }, "email_taken"],
  ];
  for (const [body, code] of cases) {
    const db = world();
    const r = await call(db, { action: "invite", ...body });
    assertFails(r, code);
    assertEquals(writes(db), [], code);
  }
});

Deno.test("invite: creates the account with the preset's access and an attributed audit row", async () => {
  const db = world();
  const r = await call(db, { action: "invite", ...VALID.invite, email: " Otro@IRDLEX.org ", ministry_ids: [M1, M2, M1.toUpperCase()] });
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true });
  const created = [...db.users.values()].find((u) => u.email === "otro@irdlex.org")!;
  assertEquals(created.email_confirmed_at, null);
  assertEquals(created.user_metadata, { display_name: "Otro Nuevo" });
  const p = profileOf(db, created.id)!;
  assertEquals([p.role, p.allowed_tabs, p.preset_id, p.ministry_ids, p.ministry_id, p.display_name],
    ["ministry_leader", MEDIOS_TABS, P_MEDIOS, [M1, M2], M1, "Otro Nuevo"]);
  const inv = db.table("invitations").find((i) => i.email === "otro@irdlex.org")!;
  assertEquals([inv.status, inv.invited_by, inv.role], ["pending", DEV1, "ministry_leader"]);
  assertEquals(auditRows(db), [{
    actor_id: DEV1, actor_name: "Dev Uno", action: "INSERT", entity: "invitations", entity_id: created.id,
    label: "Otro Nuevo (otro@irdlex.org)", id: auditRows(db)[0].id, created_at: auditRows(db)[0].created_at,
  }]);
});

Deno.test("invite: preset access is resolved server-side; client tabs are ignored", async () => {
  const db = world();
  await call(db, { action: "invite", ...VALID.invite, preset_id: P_TES, allowed_tabs: ["users"], role: "admin", ministry_ids: [M1] });
  const created = [...db.users.values()].find((u) => u.email === "otro@irdlex.org")!;
  const p = profileOf(db, created.id)!;
  assertEquals([p.role, p.allowed_tabs, p.ministry_ids], ["treasurer", [], []]);
});

Deno.test("invite: legacy raw role is still honoured and sanitized", async () => {
  const db = world();
  const r = await call(db, {
    action: "invite", email: "otro@irdlex.org", display_name: "Otro", role: "ministry_leader",
    allowed_tabs: ["galeria", "users"], ministry_id: M2,
  });
  assertEquals(r.status, 200);
  const created = [...db.users.values()].find((u) => u.email === "otro@irdlex.org")!;
  const p = profileOf(db, created.id)!;
  assertEquals([p.role, p.allowed_tabs, p.preset_id, p.ministry_ids], ["ministry_leader", ["galeria"], null, [M2]]);
});

Deno.test("invite: a stale pending row for the address is retired, not a conflict", async () => {
  const db = world();
  db.table("invitations").push({ id: uuid(0x303), email: "otro@irdlex.org", status: "pending", created_at: "2026-09-01T00:00:00Z" });
  const r = await call(db, { action: "invite", ...VALID.invite });
  assertEquals(r.status, 200);
  const rows = db.table("invitations").filter((i) => i.email === "otro@irdlex.org");
  assertEquals(rows.map((i) => i.status).sort(), ["expired", "pending"]);
});

Deno.test("invite: a failed send rolls back the invitation row and maps the code", async () => {
  const cases: Array<[Row, ErrorCode]> = [
    [{ status: 429, code: "over_email_send_rate_limit", message: "secret" }, "email_rate_limited"],
    [{ status: 422, code: "email_exists", message: "secret" }, "email_taken"],
    [{ status: 500, code: "unexpected_failure", message: "smtp secret" }, "invite_failed"],
  ];
  for (const [err, code] of cases) {
    const db = world().failOn("auth.inviteUserByEmail", err as { message: string });
    const r = await call(db, { action: "invite", ...VALID.invite });
    assertFails(r, code);
    assertFalse(r.text.includes("secret"));
    assertEquals(db.table("invitations").filter((i) => i.email === "otro@irdlex.org"), []);
    assertEquals(auditRows(db), []);
  }
});

Deno.test("invite: a failed profile write deletes the new account and the row", async () => {
  const db = world().failOn("upsert:profiles", { code: "42501", message: "rls secret" });
  const r = await call(db, { action: "invite", ...VALID.invite });
  assertFails(r, "internal");
  assertFalse(r.text.includes("secret"));
  assertEquals([...db.users.values()].filter((u) => u.email === "otro@irdlex.org"), []);
  assertEquals(db.table("invitations").filter((i) => i.email === "otro@irdlex.org"), []);
  assertEquals(auditRows(db), []);
});

Deno.test("invite: a concurrent pending row (unique violation) is email_taken", async () => {
  const db = world().failOn("insert:invitations", { code: "23505", message: "duplicate" });
  assertFails(await call(db, { action: "invite", ...VALID.invite }), "email_taken");
  assertFalse(db.log.includes("auth.inviteUserByEmail"));
});

Deno.test("invite: an audit write failure is logged and does not undo the invite", async () => {
  const db = world().failOn("insert:audit_log", { message: "audit secret" });
  const r = await call(db, { action: "invite", ...VALID.invite });
  assertEquals(r.status, 200);
  assert(r.logs.some((l) => l.includes("[admin-invite] audit_log")));
});

// ── resend ───────────────────────────────────────────────────────────────────
Deno.test("resend: paused invitations refuse before touching the account", async () => {
  const db = world();
  db.table("app_settings")[0].value = { pause_invites: true };
  assertFails(await call(db, { action: "resend", user_id: PENDING }), "invites_paused");
  assertEquals(db.log.slice(db.log.indexOf("select:app_settings") + 1), []);   // nothing after the check
  assert(db.users.has(PENDING));
});

Deno.test("resend: re-invites the same pending account in place", async () => {
  const db = world();
  const r = await call(db, { action: "resend", user_id: PENDING.toUpperCase() });
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true });
  assertEquals(db.sentInvites, ["nuevo@irdlex.org"]);
  assert(db.users.has(PENDING));
  assertEquals(profileOf(db, PENDING)?.preset_id, P_MEDIOS);
  assertFalse(db.log.includes("auth.deleteUser"));
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.entity_id, row.label, row.actor_id],
    ["UPDATE", "invitations", PENDING, "Nuevo (nuevo@irdlex.org) · reenviada", DEV1]);
});

Deno.test("resend: guards", async () => {
  assertFails(await call(world(), { action: "resend", user_id: "x" }), "invalid_user_id");
  assertFails(await call(world(), { action: "resend", user_id: MISSING }), "user_not_found");
  assertFails(await call(world(), { action: "resend", user_id: LEADER }), "already_active");
  const failing = world().failOn("auth.inviteUserByEmail", { status: 500, message: "smtp secret" });
  const r = await call(failing, { action: "resend", user_id: PENDING });
  assertFails(r, "invite_failed");
  assert(failing.users.has(PENDING));
});

// ── revoke ───────────────────────────────────────────────────────────────────
Deno.test("revoke: deletes the pending account and marks its newest invitation row", async () => {
  const db = world();
  db.table("invitations").push({ id: uuid(0x304), email: "nuevo@irdlex.org", status: "accepted", created_at: "2025-01-01T00:00:00Z" });
  const r = await call(db, { action: "revoke", user_id: PENDING });
  assertEquals(r.status, 200);
  assertFalse(db.users.has(PENDING));
  assertEquals(profileOf(db, PENDING), undefined);
  const rows = db.table("invitations").filter((i) => i.email === "nuevo@irdlex.org");
  assertEquals(rows.find((i) => i.id === uuid(0x301))?.status, "revoked");
  assertEquals(rows.find((i) => i.id === uuid(0x304))?.status, "accepted");   // older history untouched
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.label], ["DELETE", "invitations", "Nuevo (nuevo@irdlex.org)"]);
});

Deno.test("revoke: guards", async () => {
  assertFails(await call(world(), { action: "revoke", user_id: 7 }), "invalid_user_id");
  assertFails(await call(world(), { action: "revoke", user_id: MISSING }), "user_not_found");
  const db = world();
  assertFails(await call(db, { action: "revoke", user_id: LEADER }), "account_active");
  assert(db.users.has(LEADER));
});

// ── set-role ─────────────────────────────────────────────────────────────────
Deno.test("set-role: revokes the target's sessions BEFORE changing its access", async () => {
  const db = world();
  const r = await call(db, { action: "set-role", user_id: LEADER, preset_id: P_ADMIN, ministry_ids: [M1] });
  assertEquals(r.status, 200);
  assertEquals(db.revokedSessions, [LEADER]);
  assert(db.log.indexOf("rpc:admin_revoke_user_sessions") < db.log.indexOf("update:profiles"));
  const p = profileOf(db, LEADER)!;
  assertEquals([p.role, p.allowed_tabs, p.preset_id, p.ministry_ids, p.ministry_id], ["admin", [], P_ADMIN, [], null]);
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.entity_id, row.label],
    ["UPDATE", "profiles", LEADER, "Luis Líder · preset: Administrador · rol: admin · páginas: ninguna"]);
});

Deno.test("set-role: the database's last-developer trigger maps to last_developer", async () => {
  const db = world().failOn("update:profiles", {
    code: "P0001", message: "Debe quedar al menos un usuario con acceso de desarrollador.",
  });
  assertFails(await call(db, { action: "set-role", user_id: DEV2, preset_id: P_ADMIN }), "last_developer");
  assertEquals(auditRows(db), []);
});

Deno.test("set-role: revocation unavailable → nothing changes", async () => {
  for (const db of [world().dropRpc("admin_revoke_user_sessions"), world().failOn("rpc:admin_revoke_user_sessions", { message: "x" })]) {
    const before = snapshot(db);
    const r = await call(db, { action: "set-role", user_id: LEADER, preset_id: P_ADMIN });
    assertFails(r, "revoke_unavailable");
    assertEquals(snapshot(db), before);
    assertFalse(db.log.includes("update:profiles"));
  }
});

Deno.test("set-role: no revocation when access is unchanged or the target is the caller", async () => {
  const same = world();
  assertEquals((await call(same, { action: "set-role", user_id: LEADER, preset_id: P_MEDIOS, ministry_ids: [M2] })).status, 200);
  assertEquals(same.revokedSessions, []);
  assertEquals(profileOf(same, LEADER)?.ministry_ids, [M2]);

  // Self-demotion while another developer remains; an upper-case id is still "self".
  const self = world();
  assertEquals((await call(self, { action: "set-role", user_id: DEV1.toUpperCase(), preset_id: P_ADMIN })).status, 200);
  assertEquals(self.revokedSessions, []);
  assertEquals(profileOf(self, DEV1)?.allowed_tabs, []);
});

Deno.test("set-role: never removes the last developer", async () => {
  const db = world();
  db.users.get(DEV2)!.email_confirmed_at = null;     // DEV2 no longer counts as a developer
  const before = snapshot(db);
  assertFails(await call(db, { action: "set-role", user_id: DEV1, preset_id: P_ADMIN }), "last_developer");
  assertEquals(snapshot(db), before);
  assertEquals(writes(db), []);
  // With DEV2 confirmed again, demoting DEV2 is fine (DEV1 remains).
  const ok = world();
  assertEquals((await call(ok, { action: "set-role", user_id: DEV2, preset_id: P_ADMIN })).status, 200);
  assertEquals(ok.revokedSessions, [DEV2]);
});

Deno.test("set-role: a developer whose auth lookup fails blocks the change (fail closed)", async () => {
  const db = world().failOn(`auth.getUserById:${DEV2}`, { status: 500, message: "secret" });
  assertFails(await call(db, { action: "set-role", user_id: DEV1, preset_id: P_ADMIN }), "internal");
  assertEquals(writes(db), []);
});

Deno.test("set-role: guards", async () => {
  assertFails(await call(world(), { action: "set-role", user_id: "nope", preset_id: P_ADMIN }), "invalid_user_id");
  assertFails(await call(world(), { action: "set-role", user_id: NO_PROFILE, preset_id: P_ADMIN }), "user_not_found");
  assertFails(await call(world(), { action: "set-role", user_id: LEADER, preset_id: MISSING }), "preset_not_found");
  assertFails(await call(world(), { action: "set-role", user_id: LEADER, preset_id: P_MEDIOS, ministry_ids: [MISSING] }), "invalid_ministry");
  const failing = world().failOn("update:profiles", { message: "db secret" });
  const r = await call(failing, { action: "set-role", user_id: LEADER, preset_id: P_ADMIN });
  assertFails(r, "internal");
  assertFalse(r.text.includes("secret"));
});

// ── delete ───────────────────────────────────────────────────────────────────
Deno.test("delete: revokes sessions BEFORE deleting, then audits", async () => {
  const db = world();
  const r = await call(db, { action: "delete", user_id: LEADER });
  assertEquals(r.status, 200);
  assertEquals(db.revokedSessions, [LEADER]);
  assert(db.log.indexOf("rpc:admin_revoke_user_sessions") < db.log.indexOf("auth.deleteUser"));
  assertFalse(db.users.has(LEADER));
  assertEquals(profileOf(db, LEADER), undefined);
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.entity_id, row.label, row.actor_name],
    ["DELETE", "profiles", LEADER, "Luis Líder (luis@irdlex.org)", "Dev Uno"]);
});

Deno.test("delete: refuses the caller's own account (any casing) and unknown users", async () => {
  for (const id of [DEV1, DEV1.toUpperCase(), ` ${DEV1} `]) {
    const db = world();
    assertFails(await call(db, { action: "delete", user_id: id }), "self_forbidden");
    assertEquals(writes(db), []);
  }
  assertFails(await call(world(), { action: "delete", user_id: MISSING }), "user_not_found");
  assertFails(await call(world(), { action: "delete", user_id: "" }), "invalid_user_id");
});

Deno.test("delete: revocation unavailable → the account stays", async () => {
  const db = world().dropRpc("admin_revoke_user_sessions");
  assertFails(await call(db, { action: "delete", user_id: LEADER }), "revoke_unavailable");
  assert(db.users.has(LEADER));
  assertFalse(db.log.includes("auth.deleteUser"));
});

Deno.test("delete: a GoTrue failure is internal, without its detail", async () => {
  const db = world().failOn("auth.deleteUser", { status: 500, message: "Database error deleting user: fk secret" });
  const r = await call(db, { action: "delete", user_id: LEADER });
  assertFails(r, "internal");
  assertFalse(r.text.includes("secret"));
  assertEquals(auditRows(db), []);
});

// ── reset-mfa ────────────────────────────────────────────────────────────────
Deno.test("reset-mfa: refuses the caller's own account", async () => {
  for (const id of [DEV1, DEV1.toUpperCase()]) {
    const db = world();
    assertFails(await call(db, { action: "reset-mfa", user_id: id }), "self_forbidden");
    assertEquals(db.users.get(DEV1)?.factors?.length, 1);
    assertEquals(writes(db), []);
  }
});

Deno.test("reset-mfa: revokes sessions BEFORE removing factors, then audits", async () => {
  const db = world();
  db.users.get(DEV2)!.factors!.push({ id: "extra-factor", status: "unverified" });
  const r = await call(db, { action: "reset-mfa", user_id: DEV2 });
  assertEquals(r.status, 200);
  assertEquals(db.revokedSessions, [DEV2]);
  assert(db.log.indexOf("rpc:admin_revoke_user_sessions") < db.log.indexOf("auth.mfa.deleteFactor"));
  assertEquals(db.users.get(DEV2)?.factors, []);
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.entity_id, row.label],
    ["UPDATE", "profiles", DEV2, "Dev Dos (dev2@irdlex.org) · 2FA restablecido"]);
});

Deno.test("reset-mfa: revocation unavailable → factors stay", async () => {
  const db = world().dropRpc("admin_revoke_user_sessions");
  assertFails(await call(db, { action: "reset-mfa", user_id: DEV2 }), "revoke_unavailable");
  assertEquals(db.users.get(DEV2)?.factors?.length, 1);
  assertFalse(db.log.includes("auth.mfa.deleteFactor"));
});

Deno.test("reset-mfa: guards and upstream failure", async () => {
  assertFails(await call(world(), { action: "reset-mfa", user_id: "x" }), "invalid_user_id");
  assertFails(await call(world(), { action: "reset-mfa", user_id: MISSING }), "user_not_found");
  const db = world().failOn("auth.mfa.deleteFactor", { status: 500, message: "secret" });
  assertFails(await call(db, { action: "reset-mfa", user_id: DEV2 }), "internal");
  assertEquals(auditRows(db), []);
});

// ── list-presets ─────────────────────────────────────────────────────────────
Deno.test("list-presets: member counts, system first, missing built-ins re-seeded", async () => {
  const db = world();
  const presets = db.table("role_presets");
  presets.splice(presets.findIndex((p) => p.slug === "tesoreria"), 1);
  const r = await call(db, { action: "list-presets" });
  assertEquals(r.status, 200);
  const list = r.body.presets as Row[];
  assertEquals(list.map((p) => p.name), ["Administrador", "Desarrollador", "Medios", "Tesorería", "Ujieres"]);
  const count = (name: string) => list.find((p) => p.name === name)?.member_count;
  assertEquals([count("Desarrollador"), count("Medios"), count("Ujieres"), count("Tesorería")], [2, 2, 0, 0]);
  assertEquals(db.log.filter((k) => k === "insert:role_presets").length, 1);
});

Deno.test("list-presets: a failed read or seed is internal", async () => {
  assertFails(await call(world().failOn("select:role_presets", { message: "x" }), { action: "list-presets" }), "internal");
  const db = world();
  db.table("role_presets").length = 0;
  assertFails(await call(db.failOn("insert:role_presets", { message: "x" }), { action: "list-presets" }), "internal");
});

// ── save-preset ──────────────────────────────────────────────────────────────
Deno.test("save-preset: input validation", async () => {
  const base = { name: "Alabanza", base_role: "ministry_leader", allowed_tabs: ["upcoming"], icon: "fa-music", color: "#123abc" };
  const cases: Array<[Row, ErrorCode]> = [
    [{ ...base, id: "bad" }, "invalid_preset_id"],
    [{ ...base, name: "A" }, "invalid_preset_name"],
    [{ ...base, name: "x".repeat(41) }, "invalid_preset_name"],
    [{ ...base, base_role: "root" }, "invalid_role"],
    [{ ...base, icon: "fas fa-music" }, "invalid_icon"],
    [{ ...base, icon: 'fa-x" onclick="y' }, "invalid_icon"],
    [{ ...base, color: "red" }, "invalid_color"],
    [{ ...base, color: "#123abc;background:url(x)" }, "invalid_color"],
    [{ ...base, id: MISSING }, "preset_not_found"],
  ];
  for (const [body, code] of cases) {
    const db = world();
    assertFails(await call(db, { action: "save-preset", ...body }), code);
    assertEquals(writes(db), [], code);
  }
});

Deno.test("save-preset: creates a preset (sanitized tabs, optional look) and audits", async () => {
  const db = world();
  const r = await call(db, { action: "save-preset", name: "  Alabanza ", base_role: "ministry_leader", allowed_tabs: ["galeria", "users"], icon: "", color: null });
  assertEquals(r.status, 200);
  assertEquals(r.body.ok, true);
  const created = r.body.preset as Row;
  assertEquals([created.name, created.slug, created.allowed_tabs, created.icon, created.color, created.is_system],
    ["Alabanza", "alabanza", ["galeria"], null, null, false]);
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.entity_id, row.label],
    ["INSERT", "role_presets", created.id, "Alabanza · rol: ministry_leader · páginas: galeria"]);
});

Deno.test("save-preset: a duplicate slug is preset_name_taken", async () => {
  const r = await call(world(), { action: "save-preset", name: "Médios", base_role: "ministry_leader" });
  assertFails(r, "preset_name_taken");
});

Deno.test("save-preset: a cosmetic edit propagates nothing and revokes nothing", async () => {
  const db = world();
  const r = await call(db, { action: "save-preset", id: P_MEDIOS, name: "Medios y Video", base_role: "ministry_leader", allowed_tabs: MEDIOS_TABS, icon: "fa-video", color: "#000000" });
  assertEquals(r.status, 200);
  assertEquals((r.body.preset as Row).name, "Medios y Video");
  assertEquals(db.revokedSessions, []);
  assertEquals(profileOf(db, LEADER)?.allowed_tabs, MEDIOS_TABS);
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.label],
    ["UPDATE", "role_presets", "Medios y Video · rol: ministry_leader · páginas: upcoming, calendario, special-events, galeria"]);
});

Deno.test("save-preset: an access edit revokes every member but the caller, BEFORE saving", async () => {
  const db = world();
  profileOf(db, DEV1)!.preset_id = P_MEDIOS;   // the caller carries it too (unusual, but must not sign them out)
  const r = await call(db, { action: "save-preset", ...VALID["save-preset"] });
  assertEquals(r.status, 200);
  assertEquals(db.revokedSessions.sort(), [LEADER, PENDING].sort());
  assert(db.log.lastIndexOf("rpc:admin_revoke_user_sessions") < db.log.indexOf("update:role_presets"));
  assertEquals(profileOf(db, LEADER)?.allowed_tabs, ["upcoming"]);
  assertEquals(profileOf(db, LEADER)?.ministry_ids, [M1]);    // ministries untouched
});

Deno.test("save-preset: revocation unavailable → preset and members unchanged", async () => {
  const db = world().dropRpc("admin_revoke_user_sessions");
  const before = snapshot(db);
  assertFails(await call(db, { action: "save-preset", ...VALID["save-preset"] }), "revoke_unavailable");
  assertEquals(snapshot(db), before);
});

Deno.test("save-preset: never strips the last developers", async () => {
  const db = world();
  const before = snapshot(db);
  const r = await call(db, { action: "save-preset", id: P_DEV, name: "Desarrollador", base_role: "admin", allowed_tabs: ["activity"] });
  assertFails(r, "last_developer");
  assertEquals(snapshot(db), before);
  assertEquals(writes(db), []);
});

Deno.test("save-preset: a failed propagation is reported with its own code", async () => {
  const db = world().failOn("update:profiles", { message: "secret" });
  const r = await call(db, { action: "save-preset", ...VALID["save-preset"] });
  assertFails(r, "preset_propagation_failed");
  assertFalse(r.text.includes("secret"));
});

// ── delete-preset ────────────────────────────────────────────────────────────
Deno.test("delete-preset: guards, then delete + audit", async () => {
  assertFails(await call(world(), { action: "delete-preset", id: "x" }), "invalid_preset_id");
  assertFails(await call(world(), { action: "delete-preset", id: MISSING }), "preset_not_found");
  assertFails(await call(world(), { action: "delete-preset", id: P_MEDIOS }), "system_preset");
  const inUse = world();
  inUse.table("profiles").push({ id: uuid(0x50), display_name: "Ujier", role: "ministry_leader", allowed_tabs: [], preset_id: P_CUSTOM });
  assertFails(await call(inUse, { action: "delete-preset", id: P_CUSTOM }), "preset_in_use");
  assert(inUse.table("role_presets").some((p) => p.id === P_CUSTOM));

  const db = world();
  const r = await call(db, { action: "delete-preset", id: P_CUSTOM });
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true });
  assertFalse(db.table("role_presets").some((p) => p.id === P_CUSTOM));
  const [row] = auditRows(db);
  assertEquals([row.action, row.entity, row.entity_id, row.label], ["DELETE", "role_presets", P_CUSTOM, "Ujieres"]);
});

// ── Fail closed on any upstream failure ──────────────────────────────────────
Deno.test("an upstream failure at any step answers internal, without detail or audit row", async () => {
  const create = { name: "Alabanza", base_role: "ministry_leader", allowed_tabs: ["upcoming"] };
  // [action, body, failing operation, calls of it to let through first]
  // "select:profiles" skips 1 to spare the caller's own lookup in authorize().
  const cases: Array<[Action, Row, string, number?]> = [
    ["list", {}, "select:profiles", 1],
    ["invite", VALID.invite, "select:role_presets"],
    ["invite", VALID.invite, "select:ministries"],
    ["invite", VALID.invite, "auth.listUsers"],
    ["invite", VALID.invite, "update:invitations"],
    ["invite", VALID.invite, "insert:invitations"],
    ["resend", VALID.resend, "select:profiles", 1],
    ["revoke", VALID.revoke, "select:profiles", 1],
    ["revoke", VALID.revoke, "auth.deleteUser"],
    ["set-role", VALID["set-role"], "select:profiles", 1],   // the target's profile
    ["set-role", VALID["set-role"], "select:profiles", 2],   // developerIds()
    ["delete", VALID.delete, "auth.getUserById", 1],
    ["delete", VALID.delete, "select:profiles", 1],
    ["reset-mfa", VALID["reset-mfa"], "select:profiles", 1],
    ["list-presets", {}, "select:profiles", 1],
    ["save-preset", create, "insert:role_presets"],
    ["save-preset", VALID["save-preset"], "select:role_presets"],
    ["save-preset", VALID["save-preset"], "select:profiles", 1],
    ["save-preset", VALID["save-preset"], "update:role_presets"],
    ["delete-preset", VALID["delete-preset"], "select:role_presets"],
    ["delete-preset", VALID["delete-preset"], "select:profiles", 1],
    ["delete-preset", VALID["delete-preset"], "delete:role_presets"],
  ];
  for (const [action, body, op, skip] of cases) {
    const db = world().failOn(op, { code: "XX000", message: "secret upstream detail" }, skip);
    const r = await call(db, { action, ...body });
    const label = `${action} / ${op} / skip ${skip ?? 0}`;
    assertEquals(r.body, errorBody("internal"), label);
    assertFalse(r.text.includes("secret"), label);
    assertEquals(auditRows(db), [], label);
    assert(r.logs.some((l) => l.startsWith(`[admin-invite] ${action}`) && l.includes("secret upstream detail")), label);
  }
});

Deno.test("an unexpected exception is logged and answered internal", async () => {
  const db = world();
  db.auth.getUser = () => Promise.reject(new Error("socket hang up"));
  const r = await call(db, { action: "list" });
  assertFails(r, "internal");
  assert(r.logs.some((l) => l.startsWith("[admin-invite] request:") && l.includes("socket hang up")));
});

Deno.test("a preset row with an unknown base role fails closed", async () => {
  const db = world();
  db.table("role_presets").find((p) => p.id === P_CUSTOM)!.base_role = "superuser";
  const r = await call(db, { action: "set-role", user_id: LEADER, preset_id: P_CUSTOM });
  assertFails(r, "internal");
  assert(r.logs.some((l) => l.includes("has base_role superuser")));
  assertEquals(writes(db), []);
});

Deno.test("works without an injected clock", async () => {
  const req = new Request("http://localhost/functions/v1/admin-invite", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt(claimsFor(DEV1))}`, Origin: ORIGIN },
    body: JSON.stringify({ action: "list" }),
  });
  const env: Record<string, string> = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "k" };
  const res = await handleRequest(req, { env: (k) => env[k], createAdminClient: () => world() });
  assertEquals(res.status, 200);
});

// ── Remaining branches ───────────────────────────────────────────────────────
Deno.test("audit rows fall back to the caller's email when the profile has no name", async () => {
  const db = world();
  profileOf(db, DEV1)!.display_name = null;
  assertEquals((await call(db, { action: "invite", ...VALID.invite })).status, 200);
  assertEquals(auditRows(db)[0].actor_name, "dev1@irdlex.org");
});

Deno.test("invite: no preset and no role defaults to ministry_leader", async () => {
  const db = world();
  const r = await call(db, { action: "invite", email: "otro@irdlex.org", display_name: "Otro", allowed_tabs: ["galeria"] });
  assertEquals(r.status, 200);
  const created = [...db.users.values()].find((u) => u.email === "otro@irdlex.org")!;
  assertEquals([profileOf(db, created.id)?.role, profileOf(db, created.id)?.allowed_tabs], ["ministry_leader", ["galeria"]]);
});

Deno.test("invite: an account without an email (phone sign-in) does not trip the duplicate check", async () => {
  const db = world();
  db.addUser({ id: uuid(0x60), email_confirmed_at: CONFIRMED_AT });
  assertEquals((await call(db, { action: "invite", ...VALID.invite })).status, 200);
});

Deno.test("invite: a send that returns no user is invite_failed and rolled back", async () => {
  const db = world();
  db.auth.admin.inviteUserByEmail = () => Promise.resolve({ data: { user: null }, error: null });
  assertFails(await call(db, { action: "invite", ...VALID.invite }), "invite_failed");
  assertEquals(db.table("invitations").filter((i) => i.email === "otro@irdlex.org"), []);
});

Deno.test("invite: rollback failures are logged; the answer stays internal", async () => {
  const db = world()
    .failOn("upsert:profiles", { message: "x" })
    .failOn("auth.deleteUser", { status: 500, message: "x" })
    .failOn("delete:invitations", { message: "x" });
  const r = await call(db, { action: "invite", ...VALID.invite });
  assertFails(r, "internal");
  assert(r.logs.some((l) => l.startsWith("[admin-invite] rollback deleteUser")));
  assert(r.logs.some((l) => l.startsWith("[admin-invite] rollback invitation")));
});

Deno.test("revoke: an account without profile or invitation row still revokes, named from metadata", async () => {
  const db = world();
  db.table("profiles").splice(db.table("profiles").findIndex((p) => p.id === PENDING), 1);
  db.table("invitations").length = 0;
  const r = await call(db, { action: "revoke", user_id: PENDING });
  assertEquals(r.status, 200);
  assertFalse(db.users.has(PENDING));
  assertEquals(auditRows(db)[0].label, "Nuevo (nuevo@irdlex.org)");
});

Deno.test("revoke: invitation bookkeeping failures are logged, not returned", async () => {
  const findFails = world().failOn("select:invitations", { message: "x" });
  const a = await call(findFails, { action: "revoke", user_id: PENDING });
  assertEquals(a.status, 200);
  assert(a.logs.some((l) => l.startsWith("[admin-invite] find invitation row")));

  const updateFails = world().failOn("update:invitations", { message: "x" });
  const b = await call(updateFails, { action: "revoke", user_id: PENDING });
  assertEquals(b.status, 200);
  assert(b.logs.some((l) => l.startsWith("[admin-invite] revoke invitation row")));
  assertEquals(auditRows(updateFails).length, 1);
});

Deno.test("resend: an account without a profile is named from its invite metadata", async () => {
  const db = world();
  db.table("profiles").splice(db.table("profiles").findIndex((p) => p.id === PENDING), 1);
  assertEquals((await call(db, { action: "resend", user_id: PENDING })).status, 200);
  assertEquals(auditRows(db)[0].label, "Nuevo (nuevo@irdlex.org) · reenviada");
});

Deno.test("delete / reset-mfa: an account without a profile is labelled by its email", async () => {
  const del = world();
  assertEquals((await call(del, { action: "delete", user_id: NO_PROFILE })).status, 200);
  assertEquals(auditRows(del)[0].label, "sinperfil@irdlex.org");
  const mfa = world();
  assertEquals((await call(mfa, { action: "reset-mfa", user_id: NO_PROFILE })).status, 200);
  assertEquals(auditRows(mfa)[0].label, "sinperfil@irdlex.org · 2FA restablecido");
});

Deno.test("reset-mfa: an account without factors still has its sessions revoked", async () => {
  const db = world();
  db.users.get(DEV2)!.factors = undefined;
  assertEquals((await call(db, { action: "reset-mfa", user_id: DEV2 })).status, 200);
  assertEquals(db.revokedSessions, [DEV2]);
  assertFalse(db.log.includes("auth.mfa.deleteFactor"));
});

Deno.test("list-presets: a failed re-read after seeding is internal", async () => {
  const db = world();
  const presets = db.table("role_presets");
  presets.splice(presets.findIndex((p) => p.slug === "medios"), 1);
  db.failOn("select:role_presets", { message: "x" }, 1);
  assertFails(await call(db, { action: "list-presets" }), "internal");
});
