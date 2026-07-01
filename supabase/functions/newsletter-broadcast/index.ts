// supabase/functions/newsletter-broadcast/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Monthly digest to ALL active subscribers: weekly services + this month's
// special events. Triggered by pg_cron on the 1st (see 20260706_newsletter_cron).
//
// Auth:    server-to-server only — requires header `x-cron-secret: <CRON_SECRET>`.
// Idempotent: logs (kind='monthly', ref='<YYYY-MM>') and skips if already sent,
//             so a double-trigger can't double-send. Pass {"force":true} to
//             re-send anyway (still records the log). Pass {"test":"me@x.com"}
//             to send only to that address (skips the log; for previews).
//
// Deploy:  supabase functions deploy newsletter-broadcast --no-verify-jwt
// Secrets: supabase secrets set CRON_SECRET=<same value as the Vault cron_secret>
//          RESEND_API_KEY, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cap, emailShell, etMonthKey, eventsHtml, fetchMonthEvents, monthNameES,
  sendBatch, sendEmail, SITE_URL, unsubscribeUrl, weeklyServicesHtml,
} from "../_shared/email.ts";

// deno-lint-ignore no-explicit-any
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function digestHtml(events: Array<Record<string, unknown>>, unsubUrl?: string) {
  const monthName = cap(monthNameES());
  const content = `
    ${weeklyServicesHtml()}
    <h2 style="margin:24px 0 12px;font-size:13px;font-weight:700;color:#345a65;text-transform:uppercase;letter-spacing:.1em;">Eventos de ${monthName}</h2>
    ${eventsHtml(events)}`;
  return emailShell({
    kicker: "Noticias y Eventos",
    heading: `Esto es lo que viene en ${monthName}`,
    intro: "Aquí tienes los servicios semanales y los eventos especiales de este mes. ¡Te esperamos!",
    contentHtml: content,
    ctaLabel: "Ver todos los eventos",
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

  let opts: { force?: boolean; test?: string } = {};
  try { opts = await req.json(); } catch { /* empty body is fine */ }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const events = await fetchMonthEvents(sb);

  // ── Preview mode: send one email to a single address, no dedup, no fan-out.
  if (opts.test) {
    const ok = await sendEmail(RESEND_API_KEY, {
      to: opts.test,
      subject: `Novedades de ${cap(monthNameES())} — Iglesia Restauración Divina`,
      html: digestHtml(events),
    });
    return json({ ok, test: opts.test });
  }

  // ── Idempotency: claim this month's send. Insert-first so a concurrent or
  //    repeat trigger loses the race and returns skipped.
  const ref = etMonthKey();
  if (!opts.force) {
    const { error } = await sb.from("newsletter_dispatch_log").insert({ kind: "monthly", ref });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return json({ ok: true, skipped: true, reason: "already sent this month", ref });
      }
      console.error("[broadcast] log insert error", error);
      return json({ error: "No se pudo registrar el envío." }, 500);
    }
  }

  // ── Recipients: active subscribers only.
  const { data: subs, error: subErr } = await sb
    .from("newsletter_subscribers")
    .select("email, unsubscribe_token")
    .is("unsubscribed_at", null);
  if (subErr) {
    console.error("[broadcast] subscriber fetch error", subErr);
    return json({ error: "No se pudieron cargar los suscriptores." }, 500);
  }

  const subject = `Novedades de ${cap(monthNameES())} — Iglesia Restauración Divina`;
  const messages = (subs || []).map((s: { email: string; unsubscribe_token: string }) => {
    const u = unsubscribeUrl(SUPABASE_URL, s.unsubscribe_token);
    return { to: s.email, subject, html: digestHtml(events, u), unsubscribeUrl: u };
  });

  const sent = await sendBatch(RESEND_API_KEY, messages);
  await sb.from("newsletter_dispatch_log")
    .update({ recipients: sent }).eq("kind", "monthly").eq("ref", ref);

  console.info(`[broadcast] month ${ref}: ${sent}/${messages.length} sent`);
  return json({ ok: true, ref, subscribers: messages.length, sent, events: events.length });
});
