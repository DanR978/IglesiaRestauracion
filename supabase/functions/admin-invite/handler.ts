// supabase/functions/admin-invite/handler.ts
// ─────────────────────────────────────────────────────────────────────────────
// Request handling for admin-invite (account and access-preset management),
// kept apart from serve() so handler.test.ts can drive it with a fake client.
//
// Authorization is the same for EVERY action, checked in this order:
//   1. a bearer JWT that GoTrue accepts (signature + live session) → 401
//   2. the second factor: aal2 in that JWT, unless the account has  → 403 aal2_required
//      no verified factor (setup is optional, D-033 as amended)
//   3. the developer tier — profile role 'admin' with 'users' in
//      allowed_tabs, on a confirmed, non-banned auth user         → 403 forbidden
// Then each action validates its input and applies its guards (own account,
// last developer, paused invitations). Before a destructive step on another
// account (delete, reset-mfa, an access change) that account's sessions are
// revoked; when revocation is unavailable nothing changes (revoke_unavailable).
//
// Contract: success bodies are the legacy ones; failures are { code, error }
// with a fixed Spanish message per code (lib.ts ERRORS). Upstream and database
// detail goes to the function log only.
//
// Usage (index.ts):
//   serve((req) => handleRequest(req, { env: (k) => Deno.env.get(k), createAdminClient }));
// ─────────────────────────────────────────────────────────────────────────────

import {
  bearerToken,
  corsHeaders,
  decodeJwtPayload,
  hasDeveloperGrant,
  secondFactorSatisfied,
  isConfirmed,
  isDeveloper,
  parseAllowedOrigins,
} from "../_shared/auth.ts";
import {
  type Access,
  type Action,
  type AuditKind,
  type AuditTarget,
  type BaseRole,
  type ErrorCode,
  accessChanged,
  accessDetail,
  auditRow,
  buildAccountList,
  ERRORS,
  errorBody,
  invitesPaused,
  inviteErrorCode,
  isNotFound,
  isOutage,
  isLastDeveloperViolation,
  isUniqueViolation,
  MAX_BODY_CHARS,
  missingSeedPresets,
  parseBaseRole,
  parseBody,
  parseColor,
  parseDisplayName,
  parseEmail,
  parseIcon,
  parseMinistryIds,
  parsePresetName,
  parseUuid,
  presetMemberCounts,
  sanitizeTabs,
  slugify,
  wouldLeaveNoDeveloper,
} from "./lib.ts";

// Where invited users land. Must be on the Supabase redirect allow-list.
const INVITE_REDIRECT = "https://www.irdlex.org/admin/?action=accept-invite";

// ── The slice of supabase-js this handler uses ───────────────────────────────
// index.ts passes the real service-role client (deno check proves it fits);
// fake-supabase.ts implements it for the tests.
export interface AuthError {
  message: string;
  status?: number;
  code?: string;
}

export interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown> | null;
  factors?: ReadonlyArray<{ id: string; status: string }> | null;
}

type UserResult = Promise<{ data: { user: AuthUser | null }; error: AuthError | null }>;

export interface AdminClient {
  // PostgREST builder chains stay untyped, as their rows are without a schema.
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  auth: {
    getUser(jwt: string): UserResult;
    admin: {
      getUserById(id: string): UserResult;
      listUsers(params: { page: number; perPage: number }): Promise<{ data: { users: AuthUser[] }; error: AuthError | null }>;
      inviteUserByEmail(email: string, options: { data?: Record<string, unknown>; redirectTo?: string }): UserResult;
      deleteUser(id: string): Promise<{ error: AuthError | null }>;
      mfa: { deleteFactor(params: { id: string; userId: string }): Promise<{ error: AuthError | null }> };
    };
  };
}

export interface Deps {
  env: (name: string) => string | undefined;
  createAdminClient: (url: string, serviceKey: string) => AdminClient;
  now?: () => Date;
}

interface Caller {
  id: string;
  name: string;
}

interface Ctx {
  admin: AdminClient;
  caller: Caller;
  body: Record<string, unknown>;
  now: Date;
}

type Result = { code: ErrorCode } | { data: Record<string, unknown> };

const OK: Result = { data: { ok: true } };

// An unexpected upstream failure: logged with its context, answered `internal`.
class UpstreamError extends Error {
  constructor(readonly context: string, readonly detail: unknown) {
    super(context);
  }
}

function describe(detail: unknown): string {
  if (detail && typeof detail === "object") {
    const d = detail as { code?: unknown; status?: unknown; message?: unknown };
    return [d.code, d.status, d.message].filter((v) => v !== undefined && v !== "").join(" ");
  }
  return String(detail);
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("Origin"), parseAllowedOrigins(deps.env("ALLOWED_ORIGINS")));
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  const fail = (code: ErrorCode) => send(ERRORS[code].status, errorBody(code));

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail("method_not_allowed");

  const url = deps.env("SUPABASE_URL");
  const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("[admin-invite] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    return fail("not_configured");
  }

  const admin = deps.createAdminClient(url, serviceKey);
  const now = deps.now?.() ?? new Date();
  let action = "";
  try {
    const gate = await authorize(admin, req.headers.get("Authorization"), now);
    if ("code" in gate) return fail(gate.code);

    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return fail("payload_too_large");
    const body = parseBody(raw);
    if (!body) return fail("invalid_request");

    action = typeof body.action === "string" ? body.action : "";
    const run = HANDLERS.get(action);
    if (!run) return fail("unknown_action");

    const result = await run({ admin, caller: gate.caller, body, now });
    return "code" in result ? fail(result.code) : send(200, result.data);
  } catch (e) {
    if (e instanceof UpstreamError) {
      console.error(`[admin-invite] ${action || "request"} · ${e.context}:`, describe(e.detail));
    } else {
      console.error(`[admin-invite] ${action || "request"}:`, e);
    }
    return fail("internal");
  }
}

// ── Authorization (every action) ────────────────────────────────────────────
async function authorize(
  admin: AdminClient,
  header: string | null,
  now: Date,
): Promise<{ caller: Caller } | { code: ErrorCode }> {
  const jwt = bearerToken(header);
  if (!jwt) return { code: "unauthorized" };

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) {
    if (error && isOutage(error)) throw new UpstreamError("getUser", error);
    return { code: "invalid_session" };
  }
  const user = data.user;

  // GoTrue verified this exact token above, so its claims can be read.
  const claims = decodeJwtPayload(jwt);
  if (!claims || claims.sub !== user.id) return { code: "invalid_session" };
  if (!secondFactorSatisfied(claims, user)) return { code: "aal2_required" };

  const [profileRes, authRes] = await Promise.all([
    admin.from("profiles").select("id, display_name, role, allowed_tabs").eq("id", user.id).maybeSingle(),
    admin.auth.admin.getUserById(user.id),
  ]);
  if (profileRes.error) throw new UpstreamError("caller profile", profileRes.error);
  if (authRes.error && !isNotFound(authRes.error)) throw new UpstreamError("caller auth user", authRes.error);
  if (!isDeveloper(profileRes.data, authRes.data?.user ?? null, now)) return { code: "forbidden" };

  const name = typeof profileRes.data?.display_name === "string" ? profileRes.data.display_name.trim() : "";
  return { caller: { id: user.id, name: name || user.email || "Desarrollador" } };
}

// ── Shared steps ─────────────────────────────────────────────────────────────
async function getAuthUser({ admin }: Ctx, id: string): Promise<AuthUser | null> {
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) {
    if (isNotFound(error)) return null;
    throw new UpstreamError("getUserById", error);
  }
  return data.user;
}

async function profileName({ admin }: Ctx, id: string): Promise<string | null> {
  const { data, error } = await admin.from("profiles").select("display_name").eq("id", id).maybeSingle();
  if (error) throw new UpstreamError("profile name", error);
  return typeof data?.display_name === "string" ? data.display_name : null;
}

function metadataName(user: AuthUser): string | null {
  const v = user.user_metadata?.display_name;
  return typeof v === "string" ? v : null;
}

async function invitesArePaused({ admin }: Ctx): Promise<boolean> {
  const { data, error } = await admin.from("app_settings").select("value").eq("key", "features").maybeSingle();
  if (error) throw new UpstreamError("app_settings features", error);
  return invitesPaused(data?.value);
}

// Accounts holding the developer tier now (same predicate as authorize()).
// A failed auth lookup throws rather than dropping the account: guessing low
// could let a change remove the real last developer.
async function developerIds(ctx: Ctx): Promise<string[]> {
  const { data, error } = await ctx.admin.from("profiles").select("id, role, allowed_tabs").eq("role", "admin");
  if (error) throw new UpstreamError("developer profiles", error);
  const rows: Array<{ id: string; role: string; allowed_tabs: string[] }> = data ?? [];
  const candidates = rows.filter(hasDeveloperGrant);
  const users = await Promise.all(candidates.map((p) => getAuthUser(ctx, p.id)));
  return candidates.filter((p, i) => isDeveloper(p, users[i], ctx.now)).map((p) => p.id);
}

// Signs the account out everywhere before a destructive step on it. False when
// revocation is unavailable (e.g. the migration that adds the RPC is missing);
// callers then stop without changing anything.
async function revokeSessions({ admin }: Ctx, userId: string): Promise<boolean> {
  const { error } = await admin.rpc("admin_revoke_user_sessions", { p_user_id: userId });
  if (error) {
    console.error("[admin-invite] admin_revoke_user_sessions:", describe(error));
    return false;
  }
  return true;
}

// Written after the change succeeded. A failed write is logged, not returned:
// the change is done, and an error would invite a retry that repeats it.
async function audit(ctx: Ctx, kind: AuditKind, target: AuditTarget): Promise<void> {
  const row = auditRow(kind, ctx.caller, target);
  const { error } = await ctx.admin.from("audit_log").insert(row);
  if (error) {
    console.error(`[admin-invite] audit_log ${row.action} ${row.entity} ${row.entity_id}:`, describe(error));
  }
}

interface ResolvedAccess extends Access {
  presetId: string | null;
  presetName: string | null;
}

// Role + page grants for invite / set-role. A preset is resolved server-side
// (never trusting the client's copy); a raw `role` is still honoured for older
// clients, defaulting to ministry_leader.
async function resolveAccess({ admin, body }: Ctx): Promise<ResolvedAccess | { code: ErrorCode }> {
  if (body.preset_id !== undefined && body.preset_id !== null && body.preset_id !== "") {
    const presetId = parseUuid(body.preset_id);
    if (!presetId) return { code: "invalid_preset_id" };
    const { data: preset, error } = await admin
      .from("role_presets").select("id, name, base_role, allowed_tabs").eq("id", presetId).maybeSingle();
    if (error) throw new UpstreamError("role_presets lookup", error);
    if (!preset) return { code: "preset_not_found" };
    const role = parseBaseRole(preset.base_role);
    if (!role) throw new UpstreamError("role_presets lookup", `preset ${presetId} has base_role ${preset.base_role}`);
    return { role, allowed_tabs: sanitizeTabs(preset.allowed_tabs, role), presetId, presetName: preset.name };
  }
  const role = body.role === undefined || body.role === null || body.role === ""
    ? "ministry_leader"
    : parseBaseRole(body.role);
  if (!role) return { code: "invalid_role" };
  return { role, allowed_tabs: sanitizeTabs(body.allowed_tabs, role), presetId: null, presetName: null };
}

// Ministries for a ministry_leader: well-formed and all existing, else null.
async function resolveMinistryIds({ admin, body }: Ctx, role: BaseRole): Promise<string[] | null> {
  const ids = parseMinistryIds(body, role);
  if (!ids || !ids.length) return ids;
  const { data, error } = await admin.from("ministries").select("id").in("id", ids);
  if (error) throw new UpstreamError("ministries lookup", error);
  const rows: Array<{ id: string }> = data ?? [];
  const found = new Set(rows.map((m) => m.id));
  return ids.every((id) => found.has(id)) ? ids : null;
}

async function findUserByEmail({ admin }: Ctx, email: string): Promise<AuthUser | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new UpstreamError("listUsers", error);
  return data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
}

// ── list ────────────────────────────────────────────────────────────────────
// GoTrue's admin user list carries no MFA factors (only the single-user read
// does), so each confirmed account is read once more for them; a pending
// invitation cannot have one yet.
async function listAccounts(ctx: Ctx): Promise<Result> {
  const { admin } = ctx;
  const [users, profiles, ministries, presets, invitations] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles")
      .select("id, display_name, role, ministry_id, ministry_ids, allowed_tabs, preset_id, avatar_url"),
    admin.from("ministries").select("id, name"),
    admin.from("role_presets").select("id, name"),
    admin.from("invitations").select("email, status, created_at"),
  ]);
  if (users.error) throw new UpstreamError("listUsers", users.error);
  if (profiles.error) throw new UpstreamError("profiles", profiles.error);
  if (ministries.error) throw new UpstreamError("ministries", ministries.error);
  if (presets.error) throw new UpstreamError("role_presets", presets.error);
  if (invitations.error) throw new UpstreamError("invitations", invitations.error);

  const accounts = await Promise.all(users.data.users.map(async (u) => {
    if (!isConfirmed(u)) return u;
    const full = await getAuthUser(ctx, u.id);
    return { ...u, factors: full?.factors ?? [] };
  }));

  return {
    data: {
      users: buildAccountList(
        accounts,
        profiles.data ?? [],
        ministries.data ?? [],
        presets.data ?? [],
        invitations.data ?? [],
      ),
    },
  };
}

// ── invite ──────────────────────────────────────────────────────────────────
async function invite(ctx: Ctx): Promise<Result> {
  const { admin, body, caller } = ctx;
  if (await invitesArePaused(ctx)) return { code: "invites_paused" };

  const email = parseEmail(body.email);
  if (!email) return { code: "invalid_email" };
  const displayName = parseDisplayName(body.display_name);
  if (!displayName) return { code: "invalid_display_name" };
  const access = await resolveAccess(ctx);
  if ("code" in access) return access;
  const ministryIds = await resolveMinistryIds(ctx, access.role);
  if (!ministryIds) return { code: "invalid_ministry" };
  if (await findUserByEmail(ctx, email)) return { code: "email_taken" };

  // No account owns this address, so any still-pending row for it is stale
  // (its account was removed); retire it so the new row can be the pending one.
  const { error: staleErr } = await admin
    .from("invitations").update({ status: "expired" }).eq("email", email).eq("status", "pending");
  if (staleErr) throw new UpstreamError("expire stale invitations", staleErr);

  // Pending-invite bookkeeping row. The real grants live on the profile below.
  const { data: inv, error: invErr } = await admin
    .from("invitations")
    .insert({ email, role: access.role, ministry_id: null, display_name: displayName, invited_by: caller.id, status: "pending" })
    .select("id").single();
  if (invErr) {
    if (isUniqueViolation(invErr)) return { code: "email_taken" };
    throw new UpstreamError("invitations insert", invErr);
  }

  // Sends the invitation email and creates the auth user.
  const { data: invited, error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: INVITE_REDIRECT,
  });
  if (mailErr || !invited?.user) {
    console.error("[admin-invite] inviteUserByEmail:", describe(mailErr ?? "no user returned"));
    await rollbackInvitation(ctx, inv.id);
    return { code: mailErr ? inviteErrorCode(mailErr) : "invite_failed" };
  }

  // Grants go on the profile directly — no dependence on a signup trigger.
  const newUserId = invited.user.id;
  const { error: profErr } = await admin.from("profiles").upsert({
    id: newUserId,
    display_name: displayName,
    role: access.role,
    // ministry_ids is canonical; ministry_id mirrors the first for older readers
    // (my_ministry_id(), event scoping).
    ministry_ids: ministryIds,
    ministry_id: ministryIds[0] ?? null,
    preset_id: access.presetId,
    allowed_tabs: access.allowed_tabs,
  }, { onConflict: "id" });
  if (profErr) {
    console.error("[admin-invite] profile upsert:", describe(profErr));
    // Roll back the half-created account so it can be re-invited cleanly.
    const { error: delErr } = await admin.auth.admin.deleteUser(newUserId);
    if (delErr) console.error("[admin-invite] rollback deleteUser:", describe(delErr));
    await rollbackInvitation(ctx, inv.id);
    return { code: "internal" };
  }

  await audit(ctx, "invite", { id: newUserId, name: displayName, email });
  return OK;
}

async function rollbackInvitation({ admin }: Ctx, id: string): Promise<void> {
  const { error } = await admin.from("invitations").delete().eq("id", id);
  if (error) console.error("[admin-invite] rollback invitation:", describe(error));
}

// ── resend ──────────────────────────────────────────────────────────────────
// GoTrue re-sends an invitation to an existing, unconfirmed user: a fresh
// one-time link that replaces the old one. The pending account, its profile
// and grants stay as they are, so a failed send loses nothing.
async function resend(ctx: Ctx): Promise<Result> {
  if (await invitesArePaused(ctx)) return { code: "invites_paused" };

  const userId = parseUuid(ctx.body.user_id);
  if (!userId) return { code: "invalid_user_id" };
  const target = await getAuthUser(ctx, userId);
  if (!target?.email) return { code: "user_not_found" };
  if (isConfirmed(target)) return { code: "already_active" };
  const name = await profileName(ctx, userId) ?? metadataName(target);

  const { error } = await ctx.admin.auth.admin.inviteUserByEmail(target.email, { redirectTo: INVITE_REDIRECT });
  if (error) {
    console.error("[admin-invite] resend inviteUserByEmail:", describe(error));
    return { code: inviteErrorCode(error) };
  }

  await audit(ctx, "resend", { id: userId, name, email: target.email });
  return OK;
}

// ── revoke (cancel a pending invitation) ─────────────────────────────────────
async function revoke(ctx: Ctx): Promise<Result> {
  const { admin } = ctx;
  const userId = parseUuid(ctx.body.user_id);
  if (!userId) return { code: "invalid_user_id" };
  const target = await getAuthUser(ctx, userId);
  if (!target) return { code: "user_not_found" };
  if (isConfirmed(target)) return { code: "account_active" };

  const email = (target.email ?? "").toLowerCase();
  const name = await profileName(ctx, userId) ?? metadataName(target);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new UpstreamError("deleteUser", error);

  if (email) await markInvitationRevoked(ctx, email);
  await audit(ctx, "revoke", { id: userId, name, email });
  return OK;
}

// Bookkeeping after the account is gone, so failures are logged, not returned.
// Only the newest row changes; it may already read 'accepted', because it can
// be marked so when the auth user is created.
async function markInvitationRevoked({ admin }: Ctx, email: string): Promise<void> {
  const { data, error } = await admin
    .from("invitations").select("id").eq("email", email).in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false }).limit(1);
  if (error) {
    console.error("[admin-invite] find invitation row:", describe(error));
    return;
  }
  const id = data?.[0]?.id;
  if (!id) return;
  const { error: updErr } = await admin.from("invitations").update({ status: "revoked" }).eq("id", id);
  if (updErr) console.error("[admin-invite] revoke invitation row:", describe(updErr));
}

// ── set-role ────────────────────────────────────────────────────────────────
async function setRole(ctx: Ctx): Promise<Result> {
  const { admin, caller } = ctx;
  const userId = parseUuid(ctx.body.user_id);
  if (!userId) return { code: "invalid_user_id" };
  const access = await resolveAccess(ctx);
  if ("code" in access) return access;
  const ministryIds = await resolveMinistryIds(ctx, access.role);
  if (!ministryIds) return { code: "invalid_ministry" };

  const { data: before, error: readErr } = await admin
    .from("profiles").select("id, display_name, role, allowed_tabs").eq("id", userId).maybeSingle();
  if (readErr) throw new UpstreamError("target profile", readErr);
  if (!before) return { code: "user_not_found" };

  // Never leave the system without a developer-level account.
  if (!hasDeveloperGrant(access) && wouldLeaveNoDeveloper(await developerIds(ctx), [userId])) {
    return { code: "last_developer" };
  }

  if (userId !== caller.id && accessChanged(before, access) && !await revokeSessions(ctx, userId)) {
    return { code: "revoke_unavailable" };
  }

  const { error } = await admin.from("profiles")
    .update({
      role: access.role,
      ministry_ids: ministryIds,
      ministry_id: ministryIds[0] ?? null,
      preset_id: access.presetId,
      allowed_tabs: access.allowed_tabs,
    })
    .eq("id", userId);
  if (error) {
    // The database's last-developer trigger: a concurrent change got there first.
    if (isLastDeveloperViolation(error)) return { code: "last_developer" };
    throw new UpstreamError("profile update", error);
  }

  await audit(ctx, "set-role", { id: userId, name: before.display_name, detail: accessDetail(access, access.presetName) });
  return OK;
}

// ── delete ──────────────────────────────────────────────────────────────────
async function deleteAccount(ctx: Ctx): Promise<Result> {
  const userId = parseUuid(ctx.body.user_id);
  if (!userId) return { code: "invalid_user_id" };
  if (userId === ctx.caller.id) return { code: "self_forbidden" };
  const target = await getAuthUser(ctx, userId);
  if (!target) return { code: "user_not_found" };

  // Never delete the last developer-level account.
  if (wouldLeaveNoDeveloper(await developerIds(ctx), [userId])) return { code: "last_developer" };

  const name = await profileName(ctx, userId) ?? metadataName(target);
  if (!await revokeSessions(ctx, userId)) return { code: "revoke_unavailable" };

  const { error } = await ctx.admin.auth.admin.deleteUser(userId);
  if (error) throw new UpstreamError("deleteUser", error);

  await audit(ctx, "delete", { id: userId, name, email: target.email });
  return OK;
}

// ── reset-mfa (clear another user's factors so they re-enroll) ───────────────
async function resetMfa(ctx: Ctx): Promise<Result> {
  const userId = parseUuid(ctx.body.user_id);
  if (!userId) return { code: "invalid_user_id" };
  if (userId === ctx.caller.id) return { code: "self_forbidden" };
  const target = await getAuthUser(ctx, userId);
  if (!target) return { code: "user_not_found" };
  const name = await profileName(ctx, userId) ?? metadataName(target);

  if (!await revokeSessions(ctx, userId)) return { code: "revoke_unavailable" };

  for (const f of target.factors ?? []) {
    const { error } = await ctx.admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (error) throw new UpstreamError("mfa.deleteFactor", error);
  }

  await audit(ctx, "reset-mfa", { id: userId, name, email: target.email });
  return OK;
}

// ── list-presets ────────────────────────────────────────────────────────────
async function listPresets({ admin }: Ctx): Promise<Result> {
  const read = () =>
    admin.from("role_presets").select("*")
      .order("is_system", { ascending: false }).order("name", { ascending: true });

  let { data, error } = await read();
  if (error) throw new UpstreamError("role_presets", error);

  // Self-heal: insert any MISSING built-in preset (never overwrites one), for a
  // fresh table or an older seed that lacked some of them.
  const missing = missingSeedPresets(data ?? []);
  if (missing.length) {
    const { error: seedErr } = await admin.from("role_presets").insert(missing);
    if (seedErr) throw new UpstreamError("seed role_presets", seedErr);
    ({ data, error } = await read());
    if (error) throw new UpstreamError("role_presets", error);
  }

  const { data: profiles, error: profErr } = await admin.from("profiles").select("preset_id");
  if (profErr) throw new UpstreamError("preset members", profErr);
  const counts = presetMemberCounts(profiles ?? []);
  const rows: Array<Record<string, unknown> & { id: string }> = data ?? [];
  const presets = rows.map((r) => ({ ...r, member_count: counts.get(r.id) ?? 0 }));
  return { data: { presets } };
}

// ── save-preset (create, or update + propagate to its members) ──────────────
async function savePreset(ctx: Ctx): Promise<Result> {
  const { admin, body, caller } = ctx;
  const hasId = body.id !== undefined && body.id !== null && body.id !== "";
  const id = hasId ? parseUuid(body.id) : null;
  if (hasId && !id) return { code: "invalid_preset_id" };
  const name = parsePresetName(body.name);
  if (!name) return { code: "invalid_preset_name" };
  const role = parseBaseRole(body.base_role);
  if (!role) return { code: "invalid_role" };
  const icon = parseIcon(body.icon);
  if (!icon.ok) return { code: "invalid_icon" };
  const color = parseColor(body.color);
  if (!color.ok) return { code: "invalid_color" };
  const access: Access = { role, allowed_tabs: sanitizeTabs(body.allowed_tabs, role) };

  if (!id) {
    const { data: created, error } = await admin.from("role_presets")
      .insert({
        name, slug: slugify(name), base_role: role, allowed_tabs: access.allowed_tabs,
        icon: icon.value, color: color.value, is_system: false,
      })
      .select().single();
    if (error) {
      if (isUniqueViolation(error)) return { code: "preset_name_taken" };
      throw new UpstreamError("role_presets insert", error);
    }
    await audit(ctx, "create-preset", { id: created.id, name, detail: accessDetail(access) });
    return { data: { ok: true, preset: created } };
  }

  const { data: current, error: curErr } = await admin
    .from("role_presets").select("id, base_role, allowed_tabs").eq("id", id).maybeSingle();
  if (curErr) throw new UpstreamError("role_presets lookup", curErr);
  if (!current) return { code: "preset_not_found" };

  const { data: members, error: memErr } = await admin.from("profiles").select("id").eq("preset_id", id);
  if (memErr) throw new UpstreamError("preset members", memErr);
  const memberRows: Array<{ id: string }> = members ?? [];
  const memberIds = memberRows.map((m) => m.id);

  // The edit propagates to every member: it must not strip the last developers.
  if (!hasDeveloperGrant(access) && wouldLeaveNoDeveloper(await developerIds(ctx), memberIds)) {
    return { code: "last_developer" };
  }

  // A change of role/pages is an access change for every member but the caller.
  if (accessChanged({ role: current.base_role, allowed_tabs: current.allowed_tabs }, access)) {
    for (const memberId of memberIds) {
      if (memberId !== caller.id && !await revokeSessions(ctx, memberId)) return { code: "revoke_unavailable" };
    }
  }

  const { data: updated, error } = await admin.from("role_presets")
    .update({
      name, base_role: role, allowed_tabs: access.allowed_tabs,
      icon: icon.value, color: color.value, updated_at: ctx.now.toISOString(),
    })
    .eq("id", id).select().single();
  if (error) throw new UpstreamError("role_presets update", error);

  // Propagate the template (role + page grants). Ministries are per-user
  // assignments, not the preset's to reset.
  const { error: propErr } = await admin.from("profiles")
    .update({ role, allowed_tabs: access.allowed_tabs })
    .eq("preset_id", id);
  if (propErr) {
    console.error("[admin-invite] preset propagation:", describe(propErr));
    return { code: "preset_propagation_failed" };
  }

  await audit(ctx, "update-preset", { id, name, detail: accessDetail(access) });
  return { data: { ok: true, preset: updated } };
}

// ── delete-preset (blocked for system presets and presets still in use) ─────
async function deletePreset(ctx: Ctx): Promise<Result> {
  const { admin } = ctx;
  const id = parseUuid(ctx.body.id);
  if (!id) return { code: "invalid_preset_id" };

  const { data: preset, error: readErr } = await admin
    .from("role_presets").select("id, name, is_system").eq("id", id).maybeSingle();
  if (readErr) throw new UpstreamError("role_presets lookup", readErr);
  if (!preset) return { code: "preset_not_found" };
  if (preset.is_system) return { code: "system_preset" };

  const { count, error: countErr } = await admin.from("profiles")
    .select("id", { count: "exact", head: true }).eq("preset_id", id);
  if (countErr) throw new UpstreamError("preset members", countErr);
  if ((count ?? 0) > 0) return { code: "preset_in_use" };

  const { error } = await admin.from("role_presets").delete().eq("id", id);
  if (error) throw new UpstreamError("role_presets delete", error);

  await audit(ctx, "delete-preset", { id, name: preset.name });
  return OK;
}

const HANDLERS = new Map<string, (ctx: Ctx) => Promise<Result>>([
  ["list", listAccounts],
  ["invite", invite],
  ["resend", resend],
  ["revoke", revoke],
  ["set-role", setRole],
  ["delete", deleteAccount],
  ["reset-mfa", resetMfa],
  ["list-presets", listPresets],
  ["save-preset", savePreset],
  ["delete-preset", deletePreset],
] satisfies Array<[Action, (ctx: Ctx) => Promise<Result>]>);
