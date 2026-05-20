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
// reset-mfa.
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
      case "list":      return await listAccounts(admin);
      case "invite":    return await invite(admin, caller.id, body);
      case "resend":    return await resend(admin, caller.id, body);
      case "revoke":    return await revoke(admin, body);
      case "set-role":  return await setRole(admin, body);
      case "delete":    return await deleteUser(admin, caller.id, body);
      case "reset-mfa": return await resetMfa(admin, body);
      default:          return json({ error: "Acción desconocida." }, 400);
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
    .from("profiles").select("id, display_name, role, ministry_id");
  const { data: ministries } = await admin.from("ministries").select("id, name");

  const pMap = new Map((profiles ?? []).map((p: Sb) => [p.id, p]));
  const mMap = new Map((ministries ?? []).map((m: Sb) => [m.id, m.name]));

  const users = (list?.users ?? []).map((u: Sb) => {
    const p = pMap.get(u.id) ?? null;
    const verified = (u.factors ?? []).filter((f: Sb) => f.status === "verified");
    return {
      id:           u.id,
      email:        u.email,
      display_name: p?.display_name ?? u.user_metadata?.display_name ?? null,
      role:         p?.role ?? null,
      ministry_id:  p?.ministry_id ?? null,
      ministry:     p?.ministry_id ? (mMap.get(p.ministry_id) ?? null) : null,
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
  const role = String(body.role ?? "ministry_leader");
  const ministryId = body.ministry_id ? String(body.ministry_id) : null;
  const displayName = String(body.display_name ?? "").trim() || null;

  if (!EMAIL_RE.test(email)) return json({ error: "Correo electrónico inválido." }, 400);
  if (role !== "admin" && role !== "ministry_leader") {
    return json({ error: "Rol inválido." }, 400);
  }
  if (role === "ministry_leader" && !ministryId) {
    return json({ error: "Un líder de ministerio necesita un ministerio asignado." }, 400);
  }

  // Reject if an account with this email already exists
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if ((existing?.users ?? []).some((u: Sb) => (u.email ?? "").toLowerCase() === email)) {
    return json({ error: "Ya existe una cuenta con ese correo." }, 409);
  }

  // Insert the invitation row FIRST so the signup trigger can read role/ministry
  const { data: inv, error: invErr } = await admin
    .from("invitations")
    .insert({
      email,
      role,
      ministry_id: role === "admin" ? null : ministryId,
      display_name: displayName,
      invited_by: callerId,
      status: "pending",
    })
    .select().single();
  if (invErr) return json({ error: "No se pudo crear la invitación: " + invErr.message }, 400);

  // Send the Supabase invitation email (this also creates the auth user)
  const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: `${SITE_URL}/admin/?action=accept-invite`,
  });
  if (mailErr) {
    await admin.from("invitations").delete().eq("id", inv.id); // roll back
    return json({ error: "No se pudo enviar la invitación: " + mailErr.message }, 400);
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
    .from("profiles").select("role, ministry_id, display_name").eq("id", userId).single();

  await admin.auth.admin.deleteUser(userId); // cascades the profile row

  return await invite(admin, callerId, {
    email,
    role: prof?.role ?? "ministry_leader",
    ministry_id: prof?.ministry_id ?? null,
    display_name: prof?.display_name ?? null,
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
  const role = String(body.role ?? "");
  const ministryId = body.ministry_id ? String(body.ministry_id) : null;

  if (!userId) return json({ error: "Falta el usuario." }, 400);
  if (role !== "admin" && role !== "ministry_leader") {
    return json({ error: "Rol inválido." }, 400);
  }
  if (role === "ministry_leader" && !ministryId) {
    return json({ error: "Un líder de ministerio necesita un ministerio." }, 400);
  }

  // Never leave the church with zero admins
  if (role !== "admin") {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    if ((admins ?? []).length <= 1 && (admins ?? []).some((a: Sb) => a.id === userId)) {
      return json({ error: "Debe quedar al menos un administrador." }, 409);
    }
  }

  const { error } = await admin.from("profiles")
    .update({ role, ministry_id: role === "admin" ? null : ministryId })
    .eq("id", userId);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

// ── delete ────────────────────────────────────────────────────────────────────
async function deleteUser(admin: Sb, callerId: string, body: Sb): Promise<Response> {
  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "Falta el usuario." }, 400);
  if (userId === callerId) return json({ error: "No puedes eliminar tu propia cuenta." }, 409);

  const { data: prof } = await admin
    .from("profiles").select("role").eq("id", userId).single();
  if (prof?.role === "admin") {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    if ((admins ?? []).length <= 1) {
      return json({ error: "Debe quedar al menos un administrador." }, 409);
    }
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
