// supabase/functions/admin-invite/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only account management for the IRD admin panel.
// Runs on Supabase Edge (Deno) with the service-role key — the service key
// NEVER reaches the browser.
//
// Deploy:  supabase functions deploy admin-invite
// Secrets: none to set — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
//          injected into every Edge Function automatically.
//
// Every request must carry the caller's Authorization: Bearer <jwt>. The
// function verifies that JWT and refuses anyone whose profile role is not
// 'admin'. Actions: list · invite · resend · revoke · set-role · delete ·
// reset-mfa · list-presets · save-preset · delete-preset.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Where invited / recovering users land. Must be on the Supabase redirect allow-list.
const SITE_URL = "https://www.irdlex.org";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// allowed_tabs meaning depends on the base role:
//   • ministry_leader → which OPERATIONAL pages show (must match the nav
//     data-tab keys and the RLS grant keys in 20260626_page_permissions.sql).
//   • admin           → which SYSTEM pages (users/activity/settings) show on
//     top of the always-on admin pages. Developer = all three; Administrador
//     = none. Ministries + treasury stay always-on for admins.
//   • treasurer       → empty (finance-only, gated by role).
const OPERATIONAL_TABS = [
  "upcoming", "calendario",
  "special-events", "discipulado", "galeria", "treasury",
];
const ADMIN_SYSTEM_TABS = ["users", "activity", "settings"];

function grantableFor(baseRole: string): string[] {
  if (baseRole === "ministry_leader") return OPERATIONAL_TABS;
  if (baseRole === "admin") return ADMIN_SYSTEM_TABS;
  return [];
}

function sanitizeTabs(input: unknown, baseRole: string): string[] {
  const allowed = grantableFor(baseRole);
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const t of input) {
    if (typeof t === "string" && allowed.includes(t)) seen.add(t);
  }
  return [...seen];
}

const BASE_ROLES = ["admin", "ministry_leader", "treasurer"];

// A ministry_leader can lead SEVERAL ministries. Accepts either `ministry_ids`
// (array — new clients) or `ministry_id` (single — old clients), de-dupes, and
// returns [] for any non-ministry_leader role. Ministry scoping never applies
// to admins/treasurers.
// deno-lint-ignore no-explicit-any
function sanitizeMinistryIds(body: any, role: string): string[] {
  if (role !== "ministry_leader") return [];
  const raw = Array.isArray(body?.ministry_ids)
    ? body.ministry_ids
    : (body?.ministry_id ? [body.ministry_id] : []);
  const seen = new Set<string>();
  for (const v of raw) {
    if (v !== null && v !== undefined && String(v).trim()) seen.add(String(v).trim());
  }
  return [...seen];
}

// "Developer-level" = an admin who can also open the system tabs (Usuarios,
// Actividad, Configuración). Used to guard against locking everyone out.
// deno-lint-ignore no-explicit-any
async function developerIds(admin: any): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id, allowed_tabs").eq("role", "admin");
  return (data ?? [])
    .filter((p: any) => Array.isArray(p.allowed_tabs) && p.allowed_tabs.includes("users"))
    .map((p: any) => p.id);
}

// deno-lint-ignore no-explicit-any
type Access = { role: string; allowedTabs: string[]; presetId: string | null };

// Resolve the effective access for an invite / set-role request. New callers
// send a `preset_id` and we derive role + tabs from the preset server-side
// (never trusting the client). A raw `role` is still honoured for back-compat.
// deno-lint-ignore no-explicit-any
async function deriveAccess(admin: any, body: any): Promise<Access | { error: string }> {
  const presetId = body.preset_id ? String(body.preset_id) : null;
  if (presetId) {
    const { data: preset } = await admin
      .from("role_presets").select("base_role, allowed_tabs").eq("id", presetId).single();
    if (!preset) return { error: "El preset seleccionado no existe." };
    const role = String(preset.base_role);
    return { role, allowedTabs: sanitizeTabs(preset.allowed_tabs, role), presetId };
  }
  const role = String(body.role ?? "ministry_leader");
  if (!BASE_ROLES.includes(role)) return { error: "Rol inválido." };
  return { role, allowedTabs: sanitizeTabs(body.allowed_tabs, role), presetId: null };
}

// URL-safe identity slug for a preset name (accent-folded, lowercased).
function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "preset";
}

// deno-lint-ignore no-explicit-any
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "La función no está configurada correctamente." }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Authenticate the caller, require admin role ─────────────────────────────
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "No autorizado." }, 401);

  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !callerData?.user) return json({ error: "Sesión inválida." }, 401);
  const caller = callerData.user;

  const { data: callerProfile } = await admin
    .from("profiles").select("role").eq("id", caller.id).single();
  if (callerProfile?.role !== "admin") {
    return json({ error: "Solo los administradores pueden gestionar cuentas." }, 403);
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  try {
    switch (String(body.action ?? "")) {
      case "list":          return await listAccounts(admin);
      case "invite":        return await invite(admin, caller.id, body);
      case "resend":        return await resend(admin, caller.id, body);
      case "revoke":        return await revoke(admin, body);
      case "set-role":      return await setRole(admin, body);
      case "delete":        return await deleteUser(admin, caller.id, body);
      case "reset-mfa":     return await resetMfa(admin, body);
      case "list-presets":  return await listPresets(admin);
      case "save-preset":   return await savePreset(admin, body);
      case "delete-preset": return await deletePreset(admin, body);
      default:              return json({ error: "Acción desconocida." }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Sb = any;

// ── list ──────────────────────────────────────────────────────────────────────
async function listAccounts(admin: Sb): Promise<Response> {
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const { data: profiles } = await admin
    .from("profiles").select("id, display_name, role, ministry_id, ministry_ids, allowed_tabs, preset_id, avatar_url");
  const { data: ministries } = await admin.from("ministries").select("id, name");
  const { data: presets } = await admin.from("role_presets").select("id, name");

  const pMap = new Map<string, Sb>((profiles ?? []).map((p: Sb) => [p.id, p]));
  const mMap = new Map<string, string>((ministries ?? []).map((m: Sb) => [m.id, m.name]));
  const rpMap = new Map<string, string>((presets ?? []).map((r: Sb) => [r.id, r.name]));

  const users = (list?.users ?? []).map((u: Sb) => {
    const p = pMap.get(u.id) ?? null;
    const verified = (u.factors ?? []).filter((f: Sb) => f.status === "verified");
    // Canonical multi-ministry list, falling back to the legacy single column.
    const ministryIds: string[] = Array.isArray(p?.ministry_ids) && p.ministry_ids.length
      ? p.ministry_ids
      : (p?.ministry_id ? [p.ministry_id] : []);
    return {
      id:           u.id,
      email:        u.email,
      display_name: p?.display_name ?? u.user_metadata?.display_name ?? null,
      role:         p?.role ?? null,
      avatar_url:   p?.avatar_url ?? null,
      ministry_id:  ministryIds[0] ?? null,
      ministry_ids: ministryIds,
      ministry:     ministryIds[0] ? (mMap.get(ministryIds[0]) ?? null) : null,
      ministries:   ministryIds.map((id) => mMap.get(id)).filter(Boolean),
      preset_id:    p?.preset_id ?? null,
      preset:       p?.preset_id ? (rpMap.get(p.preset_id) ?? null) : null,
      allowed_tabs: p?.allowed_tabs ?? [],
      confirmed:    !!u.email_confirmed_at,
      last_sign_in: u.last_sign_in_at ?? null,
      mfa:          verified.length > 0,
      created_at:   u.created_at,
    };
  });
  return json({ users });
}

// ── invite ────────────────────────────────────────────────────────────────────
async function invite(admin: Sb, callerId: string, body: Sb): Promise<Response> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = String(body.display_name ?? "").trim() || null;

  if (!EMAIL_RE.test(email)) return json({ error: "Correo electrónico inválido." }, 400);

  // Access (role + page grants) comes from the chosen preset. A ministry_leader
  // may also be scoped to one or more ministries (body.ministry_ids), which links
  // them to the treasurer's budget allocations for those ministries.
  const access = await deriveAccess(admin, body);
  if ("error" in access) return json({ error: access.error }, 400);
  const { role, allowedTabs, presetId } = access;

  // Reject if an account with this email already exists
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if ((existing?.users ?? []).some((u: Sb) => (u.email ?? "").toLowerCase() === email)) {
    return json({ error: "Ya existe una cuenta con ese correo." }, 409);
  }

  // Pending-invite audit row. The real grants (role + allowed_tabs + preset)
  // live on the profile below; this table only needs the basics, so we DON'T
  // write allowed_tabs/preset_id here (the column may not exist in every DB).
  const { data: inv, error: invErr } = await admin
    .from("invitations")
    .insert({
      email,
      role,
      ministry_id: null,
      display_name: displayName,
      invited_by: callerId,
      status: "pending",
    })
    .select().single();
  if (invErr) return json({ error: "No se pudo crear la invitación: " + invErr.message }, 400);

  // Send the Supabase invitation email (this also creates the auth user)
  const { data: invited, error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: `${SITE_URL}/admin/?action=accept-invite`,
  });
  if (mailErr) {
    await admin.from("invitations").delete().eq("id", inv.id); // roll back
    return json({ error: "No se pudo enviar la invitación: " + mailErr.message }, 400);
  }

  // Write the profile DIRECTLY with the role/ministry/grants — don't depend on a
  // signup trigger. inviteUserByEmail created the auth user synchronously, so the
  // id is available now.
  const newUserId = invited?.user?.id;
  if (newUserId) {
    const ministryIds = sanitizeMinistryIds(body, role);
    const { error: profErr } = await admin.from("profiles").upsert({
      id: newUserId,
      display_name: displayName,
      role,
      // ministry_ids is canonical; ministry_id stays in sync (first) for
      // backward-compatible callers (my_ministry_id(), event scoping).
      ministry_ids: ministryIds,
      ministry_id: ministryIds[0] ?? null,
      preset_id: presetId,
      allowed_tabs: allowedTabs,
    }, { onConflict: "id" });
    if (profErr) {
      // Roll back the half-created account so it can be re-invited cleanly.
      await admin.auth.admin.deleteUser(newUserId);
      await admin.from("invitations").delete().eq("id", inv.id);
      return json({ error: "No se pudo guardar el perfil: " + profErr.message }, 400);
    }
  }
  return json({ ok: true });
}

// ── resend (delete the not-yet-accepted account, then invite again) ───────────
async function resend(admin: Sb, callerId: string, body: Sb): Promise<Response> {
  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "Falta el usuario." }, 400);

  const { data: target } = await admin.auth.admin.getUserById(userId);
  if (!target?.user) return json({ error: "Usuario no encontrado." }, 404);
  if (target.user.email_confirmed_at) {
    return json({ error: "Esta cuenta ya fue activada." }, 409);
  }

  const email = (target.user.email ?? "").toLowerCase();
  const { data: prof } = await admin
    .from("profiles").select("role, preset_id, display_name, allowed_tabs, ministry_id, ministry_ids").eq("id", userId).single();

  await admin.auth.admin.deleteUser(userId); // cascades the profile row

  return await invite(admin, callerId, {
    email,
    role: prof?.role ?? "ministry_leader",
    preset_id: prof?.preset_id ?? null,
    display_name: prof?.display_name ?? null,
    allowed_tabs: prof?.allowed_tabs ?? [],
    ministry_ids: prof?.ministry_ids ?? (prof?.ministry_id ? [prof.ministry_id] : []),
  });
}

// ── revoke (cancel a pending invitation) ──────────────────────────────────────
async function revoke(admin: Sb, body: Sb): Promise<Response> {
  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "Falta el usuario." }, 400);

  const { data: target } = await admin.auth.admin.getUserById(userId);
  if (!target?.user) return json({ error: "Usuario no encontrado." }, 404);
  if (target.user.email_confirmed_at) {
    return json({ error: "No se puede revocar una cuenta ya activa. Usa Eliminar." }, 409);
  }

  await admin.auth.admin.deleteUser(userId);
  await admin.from("invitations")
    .update({ status: "revoked" })
    .eq("email", (target.user.email ?? "").toLowerCase())
    .eq("status", "accepted");
  return json({ ok: true });
}

// ── set-role ──────────────────────────────────────────────────────────────────
async function setRole(admin: Sb, body: Sb): Promise<Response> {
  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "Falta el usuario." }, 400);

  const access = await deriveAccess(admin, body);
  if ("error" in access) return json({ error: access.error }, 400);
  const { role, allowedTabs, presetId } = access;

  // Never leave the system without a developer-level account (the only one that
  // can open Usuarios). If this change drops the target below developer, make
  // sure another developer remains.
  const willBeDeveloper = role === "admin" && allowedTabs.includes("users");
  if (!willBeDeveloper) {
    const devs = await developerIds(admin);
    if (devs.length <= 1 && devs.includes(userId)) {
      return json({ error: "Debe quedar al menos un usuario con acceso de desarrollador." }, 409);
    }
  }

  const ministryIds = sanitizeMinistryIds(body, role);
  const { error } = await admin.from("profiles")
    .update({
      role,
      ministry_ids: ministryIds,
      ministry_id: ministryIds[0] ?? null,
      preset_id: presetId,
      allowed_tabs: allowedTabs,
    })
    .eq("id", userId);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

// ── delete ────────────────────────────────────────────────────────────────────
async function deleteUser(admin: Sb, callerId: string, body: Sb): Promise<Response> {
  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "Falta el usuario." }, 400);
  if (userId === callerId) return json({ error: "No puedes eliminar tu propia cuenta." }, 409);

  // Never delete the last developer-level account.
  const devs = await developerIds(admin);
  if (devs.length <= 1 && devs.includes(userId)) {
    return json({ error: "Debe quedar al menos un usuario con acceso de desarrollador." }, 409);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

// ── reset-mfa (clear a user's authenticator so they can re-enroll) ────────────
async function resetMfa(admin: Sb, body: Sb): Promise<Response> {
  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "Falta el usuario." }, 400);

  const { data: target, error: gErr } = await admin.auth.admin.getUserById(userId);
  if (gErr || !target?.user) return json({ error: "Usuario no encontrado." }, 404);

  for (const f of (target.user.factors ?? [])) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  }
  return json({ ok: true });
}

// Built-in presets — also used to auto-seed if the table is empty (e.g. the
// migration seed rolled back). Mirrors 20260630_role_presets.sql.
const SEED_PRESETS = [
  { name: "Desarrollador", slug: "developer",     base_role: "admin",           allowed_tabs: ["users", "activity", "settings"], icon: "fa-user-gear",     color: "#5b21b6", is_system: true },
  { name: "Administrador", slug: "administrador", base_role: "admin",           allowed_tabs: [],                                 icon: "fa-shield-halved", color: "#475569", is_system: true },
  { name: "Tesorería",     slug: "tesoreria",     base_role: "treasurer",       allowed_tabs: [],                                 icon: "fa-coins",         color: "#9a6a2c", is_system: true },
  { name: "Medios",        slug: "medios",        base_role: "ministry_leader", allowed_tabs: ["upcoming", "calendario", "special-events", "galeria"], icon: "fa-photo-film", color: "#2a4a9e", is_system: true },
];

// ── list-presets ──────────────────────────────────────────────────────────────
async function listPresets(admin: Sb): Promise<Response> {
  let { data, error } = await admin
    .from("role_presets")
    .select("*")
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;

  // Self-heal: insert any MISSING built-in system preset (never overwrites an
  // existing one). Covers a fresh table AND the case where an older migration
  // seeded only some of them (e.g. Desarrollador added later).
  const haveSlugs = new Set((data ?? []).map((r: Sb) => r.slug));
  const missing = SEED_PRESETS.filter((p) => !haveSlugs.has(p.slug));
  if (missing.length) {
    await admin.from("role_presets").insert(missing);
    ({ data } = await admin.from("role_presets").select("*")
      .order("is_system", { ascending: false }).order("name", { ascending: true }));
  }

  // How many accounts use each preset — drives the "in use" guard in the UI.
  const { data: profs } = await admin.from("profiles").select("preset_id");
  const counts = new Map<string, number>();
  for (const p of (profs ?? [])) {
    if (p.preset_id) counts.set(p.preset_id, (counts.get(p.preset_id) ?? 0) + 1);
  }
  const presets = (data ?? []).map((r: Sb) => ({ ...r, member_count: counts.get(r.id) ?? 0 }));
  return json({ presets });
}

// ── save-preset (create or update; updates propagate to member profiles) ──────
async function savePreset(admin: Sb, body: Sb): Promise<Response> {
  const id = body.id ? String(body.id) : null;
  const name = String(body.name ?? "").trim();
  const baseRole = String(body.base_role ?? "");
  const icon = body.icon ? String(body.icon) : null;
  const color = body.color ? String(body.color) : null;

  if (!name) return json({ error: "El preset necesita un nombre." }, 400);
  if (!BASE_ROLES.includes(baseRole)) return json({ error: "Rol base inválido." }, 400);
  const allowedTabs = sanitizeTabs(body.allowed_tabs, baseRole);

  if (id) {
    // Guard: editing a preset propagates to its members. If this edit removes
    // developer access (base no longer admin, or 'users' no longer granted),
    // make sure it won't wipe out the last developer-level account.
    const stillDeveloper = baseRole === "admin" && allowedTabs.includes("users");
    if (!stillDeveloper) {
      const { data: members } = await admin.from("profiles").select("id").eq("preset_id", id);
      const memberIds = new Set((members ?? []).map((m: Sb) => m.id));
      const devs = await developerIds(admin);
      if (devs.length > 0 && devs.every((d) => memberIds.has(d))) {
        return json({ error: "No se puede: este cambio dejaría al sistema sin acceso de desarrollador." }, 409);
      }
    }

    const { data: updated, error } = await admin.from("role_presets")
      .update({ name, base_role: baseRole, allowed_tabs: allowedTabs, icon, color, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return json({ error: error.message }, 400);

    // Propagate the template (role + page grants) to every account carrying this
    // preset. Leave ministry_id alone — it's a per-user assignment, not the
    // preset's to reset.
    const { error: propErr } = await admin.from("profiles")
      .update({ role: baseRole, allowed_tabs: allowedTabs })
      .eq("preset_id", id);
    if (propErr) return json({ error: "Preset guardado, pero no se pudo actualizar a sus usuarios: " + propErr.message }, 400);

    return json({ ok: true, preset: updated });
  }

  const { data: created, error } = await admin.from("role_presets")
    .insert({ name, slug: slugify(name), base_role: baseRole, allowed_tabs: allowedTabs, icon, color, is_system: false })
    .select().single();
  if (error) {
    const msg = /duplicate|unique/i.test(error.message) ? "Ya existe un preset con ese nombre." : error.message;
    return json({ error: msg }, 400);
  }
  return json({ ok: true, preset: created });
}

// ── delete-preset (blocked for system presets and presets still in use) ───────
async function deletePreset(admin: Sb, body: Sb): Promise<Response> {
  const id = String(body.id ?? "");
  if (!id) return json({ error: "Falta el preset." }, 400);

  const { data: preset } = await admin.from("role_presets").select("is_system").eq("id", id).single();
  if (!preset) return json({ error: "Preset no encontrado." }, 404);
  if (preset.is_system) return json({ error: "Los presets del sistema no se pueden eliminar." }, 409);

  const { count } = await admin.from("profiles")
    .select("id", { count: "exact", head: true }).eq("preset_id", id);
  if ((count ?? 0) > 0) {
    return json({ error: "No se puede eliminar: hay usuarios con este preset. Reasígnalos primero." }, 409);
  }

  const { error } = await admin.from("role_presets").delete().eq("id", id);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}
