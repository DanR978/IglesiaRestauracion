// supabase/functions/newsletter-subscribe/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public newsletter sign-up + branded welcome email.
//
// Flow: the website posts { email } here (anon). This function (service role)
// inserts the subscriber and, if they're new, emails them a welcome message
// that includes the weekly services and this month's special events.
//
// The scheduled sends (monthly digest, day-before reminders) and one-click
// unsubscribe live in the sibling newsletter-* functions and share
// ../_shared/email.ts with this one.
//
// Deploy:  supabase functions deploy newsletter-subscribe --no-verify-jwt
//          (no-verify-jwt: anonymous visitors call it without a user session)
// Secrets: supabase secrets set RESEND_API_KEY=<your-resend-key>
//          (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically)
// Email:   sent via Resend (https://resend.com). The FROM domain (irdlex.org)
//          must be verified in Resend. See supabase/README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cap, emailShell, EMAIL_RE, eventsHtml, fetchMonthEvents, monthNameES,
  sendEmail, SITE_URL, unsubscribeUrl, weeklyServicesHtml,
} from "../_shared/email.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// deno-lint-ignore no-explicit-any
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

function welcomeEmail(events: Array<Record<string, unknown>>, unsubUrl?: string) {
  const content = `
    ${weeklyServicesHtml()}
    <h2 style="margin:24px 0 12px;font-size:13px;font-weight:700;color:#345a65;text-transform:uppercase;letter-spacing:.1em;">Eventos de ${cap(monthNameES())}</h2>
    ${eventsHtml(events)}`;
  return emailShell({
    kicker: "Noticias y Eventos",
    heading: "¡Gracias por suscribirte!",
    intro: "Nos alegra tenerte con nosotros. Te avisaremos de los eventos especiales y recordatorios de la iglesia. Aquí tienes lo que está sucediendo.",
    contentHtml: content,
    ctaLabel: "Ver todos los eventos",
    ctaUrl: `${SITE_URL}/eventos/`,
    unsubscribeUrl: unsubUrl,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "La función no está configurada correctamente." }, 500);
  }

  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  if (!EMAIL_RE.test(email)) return json({ error: "Correo electrónico inválido." }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Insert; if the email already exists (unique index) treat as "already
  // subscribed". Read back the token so the welcome email can carry unsubscribe.
  const { data: inserted, error: insErr } = await sb
    .from("newsletter_subscribers")
    .insert({ email, source: "newsletter-subscribe-fn" })
    .select("unsubscribe_token")
    .single();

  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      return json({ ok: true, alreadySubscribed: true });
    }
    console.error("[newsletter] insert error", insErr);
    return json({ error: "No se pudo completar la suscripción." }, 500);
  }

  // New subscriber — send the welcome email (best-effort; never fail the signup on email error).
  if (RESEND_API_KEY) {
    const events = await fetchMonthEvents(sb, 8);
    const unsubUrl = inserted?.unsubscribe_token
      ? unsubscribeUrl(SUPABASE_URL, inserted.unsubscribe_token)
      : undefined;
    await sendEmail(RESEND_API_KEY, {
      to: email,
      subject: "¡Gracias por suscribirte! — Iglesia Restauración Divina",
      html: welcomeEmail(events, unsubUrl),
      unsubscribeUrl: unsubUrl,
    });
  } else {
    console.warn("[newsletter] RESEND_API_KEY not set — subscriber saved, no email sent.");
  }

  return json({ ok: true });
});
