// supabase/functions/newsletter-reminders/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Day-before event reminders. Runs daily (pg_cron, ~9 AM ET). Finds events that
// start *tomorrow* (church timezone) and emails every active subscriber a single
// reminder listing them.
//
// Auth:    server-to-server only — header `x-cron-secret: <CRON_SECRET>`.
// Idempotent: logs (kind='reminder', ref='<tomorrow YYYY-MM-DD>') and skips if
//             already sent, so running twice in a day sends once. Pass
//             {"date":"YYYY-MM-DD"} to target a specific ET day (testing) and
//             {"test":"me@x.com"} to preview to one address (no fan-out/log).
//
// Deploy:  supabase functions deploy newsletter-reminders --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cap, emailShell, etDateStr, fetchEventsBetween, fmtDate, fmtTime, itemCard,
  sendBatch, sendEmail, SITE_URL, unsubscribeUrl,
} from "../_shared/email.ts";

// deno-lint-ignore no-explicit-any
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function reminderHtml(events: Array<Record<string, unknown>>, unsubUrl?: string) {
  const cards = events.map((e) => {
    const date = cap(fmtDate(String(e.starts_at)));
    const time = fmtTime(String(e.starts_at));
    const sub = [date, time, e.location ? String(e.location) : ""].filter(Boolean).join(" · ");
    return itemCard("#c89858", String(e.title || "Evento"), sub);
  }).join("");
  const heading = events.length === 1 ? "¡Mañana es el gran día!" : "¡Mañana en la iglesia!";
  const intro = events.length === 1
    ? "Este es un recordatorio de que mañana te esperamos en:"
    : "Un recordatorio de que mañana te esperamos en estos eventos:";
  return emailShell({
    kicker: "Recordatorio",
    heading,
    intro,
    contentHtml: cards,
    ctaLabel: "Ver detalles",
    ctaUrl: `${SITE_URL}/eventos/`,
    unsubscribeUrl: unsubUrl,
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_API_KEY || !CRON_SECRET) {
    return json({ error: "La función no está configurada correctamente." }, 500);
  }
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "No autorizado." }, 401);
  }

  let opts: { date?: string; test?: string } = {};
  try { opts = await req.json(); } catch { /* empty body is fine */ }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Target ET day = tomorrow, unless overridden for testing.
  const now = new Date();
  const targetDay = opts.date || etDateStr(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  // Grab a generous 48h window, then keep only events whose ET calendar date is
  // the target day — robust against timezone/DST edges without date math here.
  const from = now.toISOString();
  const to = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  const all = await fetchEventsBetween(sb, from, to);
  const events = all.filter((e) => etDateStr(new Date(String(e.starts_at))) === targetDay);

  if (!events.length) {
    return json({ ok: true, day: targetDay, events: 0, reason: "no events tomorrow" });
  }

  // ── Preview mode: one address, no dedup/fan-out.
  if (opts.test) {
    const ok = await sendEmail(RESEND_API_KEY, {
      to: opts.test,
      subject: "Recordatorio: mañana en Iglesia Restauración Divina",
      html: reminderHtml(events),
    });
    return json({ ok, test: opts.test, day: targetDay, events: events.length });
  }

  // ── Idempotency: claim this day's reminder. Insert-first wins the race.
  const { error: logErr } = await sb
    .from("newsletter_dispatch_log").insert({ kind: "reminder", ref: targetDay });
  if (logErr) {
    if ((logErr as { code?: string }).code === "23505") {
      return json({ ok: true, skipped: true, reason: "already reminded for this day", day: targetDay });
    }
    console.error("[reminders] log insert error", logErr);
    return json({ error: "No se pudo registrar el recordatorio." }, 500);
  }

  // ── Recipients: active subscribers only.
  const { data: subs, error: subErr } = await sb
    .from("newsletter_subscribers")
    .select("email, unsubscribe_token")
    .is("unsubscribed_at", null);
  if (subErr) {
    console.error("[reminders] subscriber fetch error", subErr);
    return json({ error: "No se pudieron cargar los suscriptores." }, 500);
  }

  const subject = events.length === 1
    ? `Mañana: ${String(events[0].title || "evento")} — Iglesia Restauración Divina`
    : "Recordatorio: eventos mañana — Iglesia Restauración Divina";
  const messages = (subs || []).map((s: { email: string; unsubscribe_token: string }) => {
    const u = unsubscribeUrl(SUPABASE_URL, s.unsubscribe_token);
    return { to: s.email, subject, html: reminderHtml(events, u), unsubscribeUrl: u };
  });

  const sent = await sendBatch(RESEND_API_KEY, messages);
  await sb.from("newsletter_dispatch_log")
    .update({ recipients: sent }).eq("kind", "reminder").eq("ref", targetDay);

  console.info(`[reminders] day ${targetDay}: ${events.length} event(s), ${sent}/${messages.length} sent`);
  return json({ ok: true, day: targetDay, events: events.length, subscribers: messages.length, sent });
});
