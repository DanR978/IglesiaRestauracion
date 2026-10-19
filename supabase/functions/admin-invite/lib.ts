// supabase/functions/admin-invite/lib.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure building blocks for admin-invite: the error catalog, input validators,
// the role/tab rules, the last-developer guard, invitation-status
// reconciliation, the `list` row shape and audit rows. No I/O — handler.ts owns
// that — so every rule is unit-tested in lib.test.ts.
//
// Usage:
//   import { ERRORS, errorBody, parseUuid, sanitizeTabs, auditRow } from "./lib.ts";
//   if (!parseUuid(body.user_id)) return errorBody("invalid_user_id");
// ─────────────────────────────────────────────────────────────────────────────

import { EMAIL_RE } from "../_shared/email.ts";
import { isConfirmed } from "../_shared/auth.ts";

// ── Error catalog ─────────────────────────────────────────────────────────────
// Every failure answers { code, error }: `code` is the stable contract for
// clients, `error` a fixed Spanish sentence (the legacy panel shows it as-is).
// Upstream/database text never reaches the response — only the function log.
export const ERRORS = {
  method_not_allowed:        { status: 405, message: "Método no permitido." },
  not_configured:            { status: 500, message: "La función no está configurada correctamente." },
  payload_too_large:         { status: 413, message: "La solicitud es demasiado grande." },
  invalid_request:           { status: 400, message: "Solicitud inválida." },
  unknown_action:            { status: 400, message: "Acción desconocida." },
  unauthorized:              { status: 401, message: "No autorizado." },
  invalid_session:           { status: 401, message: "Sesión inválida. Vuelve a iniciar sesión." },
  aal2_required:             { status: 403, message: "Confirma tu identidad con la verificación en dos pasos para continuar." },
  forbidden:                 { status: 403, message: "Solo las cuentas con acceso de desarrollador pueden gestionar cuentas y presets." },
  self_forbidden:            { status: 403, message: "No puedes realizar esta acción sobre tu propia cuenta." },
  invalid_email:             { status: 400, message: "Correo electrónico inválido." },
  invalid_display_name:      { status: 400, message: "El nombre debe tener entre 2 y 80 caracteres." },
  invalid_user_id:           { status: 400, message: "Usuario inválido." },
  invalid_role:              { status: 400, message: "Rol inválido." },
  invalid_preset_id:         { status: 400, message: "Preset inválido." },
  invalid_preset_name:       { status: 400, message: "El nombre del preset debe tener entre 2 y 40 caracteres." },
  invalid_color:             { status: 400, message: "Color inválido. Usa el formato #RRGGBB." },
  invalid_icon:              { status: 400, message: "Icono inválido." },
  invalid_ministry:          { status: 400, message: "Algún ministerio seleccionado no existe." },
  user_not_found:            { status: 404, message: "Usuario no encontrado." },
  preset_not_found:          { status: 404, message: "El preset seleccionado no existe." },
  email_taken:               { status: 409, message: "Ya existe una cuenta con ese correo." },
  already_active:            { status: 409, message: "Esta cuenta ya fue activada." },
  account_active:            { status: 409, message: "No se puede revocar una cuenta ya activa. Usa Eliminar." },
  last_developer:            { status: 409, message: "Debe quedar al menos un usuario con acceso de desarrollador." },
  invites_paused:            { status: 409, message: "Las invitaciones están pausadas. Reactívalas en Configuración." },
  system_preset:             { status: 409, message: "Los presets del sistema no se pueden eliminar." },
  preset_in_use:             { status: 409, message: "No se puede eliminar: hay usuarios con este preset. Reasígnalos primero." },
  preset_name_taken:         { status: 409, message: "Ya existe un preset con ese nombre." },
  email_rate_limited:        { status: 429, message: "Se alcanzó el límite de correos. Inténtalo más tarde." },
  invite_failed:             { status: 502, message: "No se pudo enviar la invitación. Inténtalo de nuevo más tarde." },
  revoke_unavailable:        { status: 503, message: "No se pudieron cerrar las sesiones de la cuenta, así que no se hizo ningún cambio. Inténtalo más tarde." },
  preset_propagation_failed: { status: 500, message: "El preset se guardó, pero no se pudo actualizar a sus usuarios. Guárdalo de nuevo." },
  internal:                  { status: 500, message: "No se pudo completar la operación. Inténtalo de nuevo." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

export function errorBody(code: ErrorCode): { code: ErrorCode; error: string } {
  return { code, error: ERRORS[code].message };
}

export const ACTIONS = [
  "list", "invite", "resend", "revoke", "set-role", "delete", "reset-mfa",
  "list-presets", "save-preset", "delete-preset",
] as const;
export type Action = typeof ACTIONS[number];

// ── Request body ──────────────────────────────────────────────────────────────
export const MAX_BODY_CHARS = 32 * 1024;

export function parseBody(raw: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

// ── Validators ────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Control and bidirectional-formatting characters never belong in a name shown
// in the panel or the activity log.
const UNSAFE_CHARS_RE = /[\p{Cc}\p{Bidi_Control}]/gu;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// Same rule as the leader_sections.icon CHECK constraint.
const ICON_RE = /^fa-[a-z0-9-]{1,40}$/;

export const MAX_EMAIL_LENGTH = 254;
export const DISPLAY_NAME_LENGTH = { min: 2, max: 80 } as const;
export const PRESET_NAME_LENGTH = { min: 2, max: 40 } as const;
export const MAX_MINISTRIES = 50;

// Lower-cased, so an id compares equal to the ones GoTrue and Postgres return.
export function parseUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s.toLowerCase() : null;
}

export function parseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s.length > MAX_EMAIL_LENGTH || /\p{Cc}/u.test(s)) return null;
  return EMAIL_RE.test(s) ? s : null;
}

// Strips unsafe characters, collapses whitespace and bounds the length
// (counted in code points, so accented names measure as typed).
function parseText(v: unknown, bounds: { min: number; max: number }): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(UNSAFE_CHARS_RE, " ").replace(/\s+/g, " ").trim();
  const n = [...s].length;
  return n >= bounds.min && n <= bounds.max ? s : null;
}

export const parseDisplayName = (v: unknown) => parseText(v, DISPLAY_NAME_LENGTH);
export const parsePresetName = (v: unknown) => parseText(v, PRESET_NAME_LENGTH);

export const BASE_ROLES = ["admin", "ministry_leader", "treasurer"] as const;
export type BaseRole = typeof BASE_ROLES[number];

export function parseBaseRole(v: unknown): BaseRole | null {
  return typeof v === "string" && (BASE_ROLES as readonly string[]).includes(v) ? v as BaseRole : null;
}

// An optional field: absent / null / "" → { ok, value: null }.
export type Optional<T> = { ok: true; value: T | null } | { ok: false };

function parseOptionalPattern(v: unknown, re: RegExp): Optional<string> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  return typeof v === "string" && re.test(v) ? { ok: true, value: v } : { ok: false };
}

export const parseColor = (v: unknown) => parseOptionalPattern(v, COLOR_RE);
export const parseIcon = (v: unknown) => parseOptionalPattern(v, ICON_RE);

// A ministry_leader can lead several ministries. Reads `ministry_ids` (array —
// current clients) or `ministry_id` (single — older clients), skips empty
// entries and de-dupes. Other roles never carry ministries → []. Returns null
// when an entry is not a UUID or there are too many.
export function parseMinistryIds(body: Record<string, unknown>, role: string): string[] | null {
  if (role !== "ministry_leader") return [];
  const raw: unknown[] = Array.isArray(body.ministry_ids)
    ? body.ministry_ids
    : (body.ministry_id ? [body.ministry_id] : []);
  const seen = new Set<string>();
  for (const v of raw) {
    if (v === null || v === undefined || v === "") continue;
    const id = parseUuid(v);
    if (!id) return null;
    seen.add(id);
  }
  return seen.size <= MAX_MINISTRIES ? [...seen] : null;
}

// ── Roles and pages ───────────────────────────────────────────────────────────
// allowed_tabs meaning depends on the base role:
//   • ministry_leader → which OPERATIONAL pages show (nav data-tab keys and the
//     RLS grant keys).
//   • admin           → which SYSTEM pages show on top of the always-on admin
//     pages. Desarrollador = all four; Administrador = none.
//   • treasurer       → none (finance-only, gated by role).
export const OPERATIONAL_TABS = [
  "upcoming", "calendario", "special-events", "discipulado", "galeria", "treasury",
] as const;
export const ADMIN_SYSTEM_TABS = ["ministries", "users", "activity", "settings"] as const;

export function grantableFor(role: string): readonly string[] {
  if (role === "ministry_leader") return OPERATIONAL_TABS;
  if (role === "admin") return ADMIN_SYSTEM_TABS;
  return [];
}

// Keeps only the pages this base role can grant, de-duplicated, input order.
export function sanitizeTabs(input: unknown, role: string): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = grantableFor(role);
  const seen = new Set<string>();
  for (const t of input) {
    if (typeof t === "string" && allowed.includes(t)) seen.add(t);
  }
  return [...seen];
}

export interface Access {
  role: BaseRole;
  allowed_tabs: string[];
}

// Would `after` change what the account can reach compared with `before`?
// Tab order is irrelevant; anything unreadable in `before` counts as a change.
export function accessChanged(before: { role?: unknown; allowed_tabs?: unknown }, after: Access): boolean {
  if (before.role !== after.role) return true;
  if (!Array.isArray(before.allowed_tabs)) return true;
  const was = new Set<unknown>(before.allowed_tabs);
  const now = new Set<unknown>(after.allowed_tabs);
  return was.size !== now.size || [...was].some((t) => !now.has(t));
}

// True when every current developer is among the accounts about to lose the
// grant — the change would leave nobody able to manage accounts.
export function wouldLeaveNoDeveloper(developerIds: readonly string[], losing: Iterable<string>): boolean {
  const set = new Set(losing);
  return developerIds.length > 0 && developerIds.every((id) => set.has(id));
}

// URL-safe identity slug for a preset name (accent-folded, lowercased).
export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "preset";
}

// ── Settings ──────────────────────────────────────────────────────────────────
// app_settings key 'features' holds the Configuración toggles; the panel treats
// any truthy pause_invites as on, and so does this.
export function invitesPaused(features: unknown): boolean {
  return !!features && typeof features === "object" &&
    !!(features as Record<string, unknown>).pause_invites;
}

// ── Built-in presets ──────────────────────────────────────────────────────────
// Auto-seeded by list-presets when missing. Mirrors 20260630000006_role_presets.sql.
interface PresetSeed {
  name: string;
  slug: string;
  base_role: BaseRole;
  allowed_tabs: readonly string[];
  icon: string;
  color: string;
  is_system: boolean;
}

export const SEED_PRESETS: readonly PresetSeed[] = [
  { name: "Desarrollador", slug: "developer",     base_role: "admin",           allowed_tabs: ["ministries", "users", "activity", "settings"],          icon: "fa-user-gear",     color: "#5b21b6", is_system: true },
  { name: "Administrador", slug: "administrador", base_role: "admin",           allowed_tabs: [],                                                       icon: "fa-shield-halved", color: "#475569", is_system: true },
  { name: "Tesorería",     slug: "tesoreria",     base_role: "treasurer",       allowed_tabs: [],                                                       icon: "fa-coins",         color: "#9a6a2c", is_system: true },
  { name: "Medios",        slug: "medios",        base_role: "ministry_leader", allowed_tabs: ["upcoming", "calendario", "special-events", "galeria"], icon: "fa-photo-film",   color: "#2a4a9e", is_system: true },
];

// Rows to insert: copies, so the caller can never mutate the seed itself.
export function missingSeedPresets(rows: ReadonlyArray<{ slug?: unknown }>) {
  const have = new Set(rows.map((r) => r.slug));
  return SEED_PRESETS.filter((p) => !have.has(p.slug)).map((p) => ({ ...p, allowed_tabs: [...p.allowed_tabs] }));
}

// How many accounts carry each preset — drives the "in use" guard in the UI.
export function presetMemberCounts(profiles: ReadonlyArray<{ preset_id?: unknown }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of profiles) {
    if (typeof p.preset_id === "string") counts.set(p.preset_id, (counts.get(p.preset_id) ?? 0) + 1);
  }
  return counts;
}

// ── Upstream error mapping ────────────────────────────────────────────────────
interface UpstreamErrorLike {
  code?: unknown;
  status?: unknown;
}

// GoTrue's answer to an invite → our code. Unknown failures stay generic.
export function inviteErrorCode(err: UpstreamErrorLike | null | undefined): ErrorCode {
  const code = typeof err?.code === "string" ? err.code : "";
  if (code === "email_exists" || code === "user_already_exists") return "email_taken";
  if (code === "email_address_invalid") return "invalid_email";
  if (code === "over_email_send_rate_limit" || err?.status === 429) return "email_rate_limited";
  return "invite_failed";
}

export function isNotFound(err: UpstreamErrorLike | null | undefined): boolean {
  return err?.status === 404 || err?.code === "user_not_found";
}

// GoTrue unreachable or failing (network error, 5xx) — not the caller's fault.
export function isOutage(err: UpstreamErrorLike | null | undefined): boolean {
  const status = typeof err?.status === "number" ? err.status : 0;
  return status === 0 || status >= 500;
}

export const isUniqueViolation = (err: UpstreamErrorLike | null | undefined) => err?.code === "23505";

// SQLSTATE of the profiles trigger that keeps at least one developer
// (public.guard_last_developer); no other profiles trigger raises.
export const isLastDeveloperViolation = (err: UpstreamErrorLike | null | undefined) => err?.code === "P0001";

// ── list ──────────────────────────────────────────────────────────────────────
export type InvitationStatus = "accepted" | "pending" | "revoked" | "expired";

// Newest invitations-row status per lower-cased email.
export function latestInvitationStatuses(
  rows: ReadonlyArray<{ email?: unknown; status?: unknown; created_at?: unknown }>,
): Map<string, string> {
  const latest = new Map<string, { at: number; status: string }>();
  for (const r of rows) {
    if (typeof r.email !== "string" || typeof r.status !== "string") continue;
    const key = r.email.toLowerCase();
    const at = typeof r.created_at === "string" ? Date.parse(r.created_at) : NaN;
    const t = Number.isNaN(at) ? -Infinity : at;
    const cur = latest.get(key);
    if (!cur || t > cur.at) latest.set(key, { at: t, status: r.status });
  }
  return new Map([...latest].map(([k, v]) => [k, v.status]));
}

// A confirmed account has accepted, whatever the invitations row says: an
// OAuth sign-in consumes the invite without touching that table. An
// unconfirmed one is pending unless its row was revoked or expired (the row
// can read 'accepted' from the moment the auth user is created).
export function invitationStatus(
  user: { email_confirmed_at?: string | null },
  rowStatus: string | undefined,
): InvitationStatus {
  if (isConfirmed(user)) return "accepted";
  if (rowStatus === "revoked" || rowStatus === "expired") return rowStatus;
  return "pending";
}

export interface ListAuthUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown> | null;
  factors?: ReadonlyArray<{ status?: string }> | null;
}

export interface ListProfile {
  id: string;
  display_name?: string | null;
  role?: string | null;
  ministry_id?: string | null;
  ministry_ids?: string[] | null;
  allowed_tabs?: string[] | null;
  preset_id?: string | null;
  avatar_url?: string | null;
}

// One row of the `list` payload. Field names and meanings are the legacy
// contract (js/pages/admin/users.js); invitation_status is additive.
export interface AccountRow {
  id: string;
  email: string | null | undefined;
  display_name: string | null;
  role: string | null;
  avatar_url: string | null;
  ministry_id: string | null;
  ministry_ids: string[];
  ministry: string | null;
  ministries: string[];
  preset_id: string | null;
  preset: string | null;
  allowed_tabs: string[];
  confirmed: boolean;
  last_sign_in: string | null;
  mfa: boolean;
  created_at: string | undefined;
  invitation_status: InvitationStatus;
}

export function accountRow(
  u: ListAuthUser,
  p: ListProfile | null,
  ministryNames: ReadonlyMap<string, string>,
  presetNames: ReadonlyMap<string, string>,
  rowStatus: string | undefined,
): AccountRow {
  const ministryIds: string[] = Array.isArray(p?.ministry_ids) && p.ministry_ids.length
    ? p.ministry_ids
    : (p?.ministry_id ? [p.ministry_id] : []);
  const metaName = u.user_metadata?.display_name;
  return {
    id: u.id,
    email: u.email,
    display_name: p?.display_name ?? (typeof metaName === "string" ? metaName : null),
    role: p?.role ?? null,
    avatar_url: p?.avatar_url ?? null,
    ministry_id: ministryIds[0] ?? null,
    ministry_ids: ministryIds,
    ministry: ministryIds[0] ? (ministryNames.get(ministryIds[0]) ?? null) : null,
    ministries: ministryIds.map((id) => ministryNames.get(id)).filter((n): n is string => !!n),
    preset_id: p?.preset_id ?? null,
    preset: p?.preset_id ? (presetNames.get(p.preset_id) ?? null) : null,
    allowed_tabs: p?.allowed_tabs ?? [],
    confirmed: !!u.email_confirmed_at,
    last_sign_in: u.last_sign_in_at ?? null,
    mfa: (u.factors ?? []).some((f) => f.status === "verified"),
    created_at: u.created_at,
    invitation_status: invitationStatus(u, rowStatus),
  };
}

export function buildAccountList(
  users: ReadonlyArray<ListAuthUser>,
  profiles: ReadonlyArray<ListProfile>,
  ministries: ReadonlyArray<{ id: string; name: string }>,
  presets: ReadonlyArray<{ id: string; name: string }>,
  invitations: ReadonlyArray<{ email?: unknown; status?: unknown; created_at?: unknown }>,
) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const ministryNames = new Map(ministries.map((m) => [m.id, m.name]));
  const presetNames = new Map(presets.map((r) => [r.id, r.name]));
  const statuses = latestInvitationStatuses(invitations);
  return users.map((u) =>
    accountRow(u, byId.get(u.id) ?? null, ministryNames, presetNames, statuses.get((u.email ?? "").toLowerCase()))
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────────
// Explicit audit_log rows, attributed to the caller (the triggers that also
// fire on these tables run as the service role and can only say "Sistema").
// action/entity use the values the Actividad tab already renders
// (INSERT/UPDATE/DELETE + a table name); entity_id is the account or preset id
// the request addressed; the label names the target and, where the verb alone
// would be ambiguous, what happened to it.
export type AuditKind =
  | "invite" | "resend" | "revoke" | "set-role" | "delete" | "reset-mfa"
  | "create-preset" | "update-preset" | "delete-preset";

const AUDIT_SHAPE: Record<AuditKind, { action: "INSERT" | "UPDATE" | "DELETE"; entity: string; suffix?: string }> = {
  "invite":        { action: "INSERT", entity: "invitations" },
  "resend":        { action: "UPDATE", entity: "invitations", suffix: "reenviada" },
  "revoke":        { action: "DELETE", entity: "invitations" },
  "set-role":      { action: "UPDATE", entity: "profiles" },
  "delete":        { action: "DELETE", entity: "profiles" },
  "reset-mfa":     { action: "UPDATE", entity: "profiles", suffix: "2FA restablecido" },
  "create-preset": { action: "INSERT", entity: "role_presets" },
  "update-preset": { action: "UPDATE", entity: "role_presets" },
  "delete-preset": { action: "DELETE", entity: "role_presets" },
};

export const MAX_AUDIT_LABEL = 200;

export interface AuditTarget {
  id: string;
  name?: string | null;
  email?: string | null;
  // Access rows: what was granted (accessDetail()).
  detail?: string | null;
}

// A snapshot of granted access for an audit label, in the format the database
// access-change trigger uses ("rol: … · páginas: …"), led by the preset chosen.
// Kept literal because a preset can be edited later.
export function accessDetail(access: Access, presetName?: string | null): string {
  const parts = [`rol: ${access.role}`, `páginas: ${access.allowed_tabs.join(", ") || "ninguna"}`];
  if (presetName?.trim()) parts.unshift(`preset: ${presetName.trim()}`);
  return parts.join(" · ");
}

export function auditRow(kind: AuditKind, actor: { id: string; name: string }, target: AuditTarget) {
  const shape = AUDIT_SHAPE[kind];
  const name = target.name?.trim() || "";
  const email = target.email?.trim() || "";
  const who = name && email ? `${name} (${email})` : (name || email || target.id);
  const label = [who, target.detail?.trim(), shape.suffix].filter(Boolean).join(" · ");
  return {
    actor_id: actor.id,
    actor_name: actor.name,
    action: shape.action,
    entity: shape.entity,
    entity_id: target.id,
    label: [...label].slice(0, MAX_AUDIT_LABEL).join(""),
  };
}
