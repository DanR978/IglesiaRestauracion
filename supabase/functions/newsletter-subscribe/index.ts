// supabase/functions/newsletter-subscribe/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public newsletter sign-up + branded welcome email.
//
// Flow: the website posts { email } here (anon). This function (service role)
// inserts the subscriber and, if they're new, emails them a welcome message
// that includes the weekly services and this month's special events.
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

const FROM = "Iglesia Restauración Divina <noreply@irdlex.org>";
const SITE_URL = "https://www.irdlex.org";
const TZ = "America/New_York";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// deno-lint-ignore no-explicit-any
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ── Church logo (same artwork as the auth emails) ───────────────────────────
const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="72" viewBox="0 0 188 235" style="display:block;margin:0 auto 12px;"><path d="M27.127,163.292c2.876,34.244 31.649,61.235 66.623,61.235c8.831,-0 17.264,-1.737 24.989,-4.862c24.531,-9.922 41.89,-33.973 41.89,-62.018l0,-80.919c0,-36.877 -30.003,-66.88 -66.879,-66.88c-36.876,0 -66.879,30.003 -66.879,66.88l-0,80.919c-0,1.902 0.099,3.781 0.256,5.645m-6.678,3.615c-0.397,-3.071 -0.599,-6.163 -0.605,-9.26l-0,-80.919c-0,-40.649 33.258,-73.907 73.906,-73.907c40.648,0 73.906,33.258 73.906,73.907l0,80.919c0,29.795 -17.878,55.598 -43.427,67.265c-9.564,4.378 -19.96,6.644 -30.479,6.642c-37.513,-0 -68.706,-28.33 -73.301,-64.647m96.803,50.91c-13.51,-18.146 -4.969,-43.996 13.621,-59.913c27.374,-23.437 8.897,-38.749 -34.387,-43.967c-43.282,-5.218 3.922,-18.316 3.922,-18.316l-0,-39.027l21.57,-0l0,-13.317l-21.57,-0l-0,-21.979l-13.318,-0l0,21.979l-21.568,-0l-0,13.317l21.568,-0l0,39.027c-45.349,13.27 -31.977,26.785 0,30.72c31.98,3.935 11.248,19.129 -29.212,27.371c-11.493,2.342 -20.945,5.207 -28.557,8.551c-0.109,-1.526 -0.184,-3.061 -0.184,-4.616l0,-80.919c0,-35.628 28.986,-64.613 64.613,-64.613c35.627,-0 64.613,28.985 64.613,64.613l-0,80.919c-0,27.338 -17.074,50.747 -41.111,60.17" style="fill:#ffffff;fill-rule:nonzero;" /></svg>`;

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      weekday: "long", day: "numeric", month: "long", timeZone: TZ,
    }).format(new Date(iso));
  } catch { return ""; }
}
function fmtTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
    }).format(new Date(iso));
  } catch { return ""; }
}

function eventsHtml(events: Array<Record<string, unknown>>) {
  if (!events.length) {
    return `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4b5563;">
      Pronto anunciaremos nuevos eventos especiales. Mientras tanto, te esperamos en nuestros servicios semanales.</p>`;
  }
  const rows = events.map((e) => {
    const date = fmtDate(String(e.starts_at));
    const time = fmtTime(String(e.starts_at));
    const loc = e.location ? ` · ${esc(String(e.location))}` : "";
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eceef0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <div style="font-size:15px;font-weight:700;color:#1a2d32;">${esc(String(e.title || "Evento"))}</div>
          <div style="font-size:13px;color:#736960;margin-top:3px;text-transform:capitalize;">${esc(date)}${time ? ` · ${esc(time)}` : ""}${loc}</div>
        </td>
      </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function welcomeEmail(events: Array<Record<string, unknown>>) {
  const monthName = new Intl.DateTimeFormat("es", { month: "long", timeZone: TZ })
    .format(new Date());
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Gracias por suscribirte</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e6ea;">

        <tr><td style="background-color:#345a65;padding:30px 32px;text-align:center;">
          ${LOGO_SVG}
          <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:21px;font-weight:700;color:#ffffff;">Iglesia Restauración Divina</div>
          <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#a9c6cf;margin-top:4px;letter-spacing:.12em;text-transform:uppercase;">Noticias y Eventos</div>
        </td></tr>

        <tr><td style="padding:38px 32px 26px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#1a2d32;">¡Gracias por suscribirte!</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#4b5563;">
            Nos alegra tenerte con nosotros. Te avisaremos de los eventos especiales y
            recordatorios de la iglesia. Aquí tienes lo que está sucediendo.
          </p>

          <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#345a65;text-transform:uppercase;letter-spacing:.1em;">Servicios semanales</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td style="padding:7px 0;font-size:15px;color:#1a2d32;">🙌 <strong>Domingo</strong> · 2:00 PM — Servicio de adoración</td></tr>
            <tr><td style="padding:7px 0;font-size:15px;color:#1a2d32;">📖 <strong>Martes</strong> · 7:00 PM — Estudio bíblico</td></tr>
            <tr><td style="padding:7px 0;font-size:15px;color:#1a2d32;">🙏 <strong>Viernes</strong> · 7:00 PM — Servicio de oración</td></tr>
          </table>

          <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#345a65;text-transform:uppercase;letter-spacing:.1em;">Eventos de ${esc(monthName)}</h2>
          ${eventsHtml(events)}

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 6px;">
            <tr><td style="border-radius:9px;background-color:#c89858;">
              <a href="${SITE_URL}/eventos/" target="_blank" style="display:inline-block;padding:13px 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#1a2c33;text-decoration:none;border-radius:9px;">Ver todos los eventos</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="background-color:#f4f5f7;padding:20px 32px;text-align:center;border-top:1px solid #e3e6ea;">
          <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#9aa1a9;line-height:1.6;">
            Iglesia Restauración Divina · 2601 Clays Mill Rd, Lexington, KY 40503<br>
            <a href="${SITE_URL}" target="_blank" style="color:#736960;text-decoration:none;">www.irdlex.org</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
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

  // Insert; if the email already exists (unique index) treat as "already subscribed".
  const { error: insErr } = await sb
    .from("newsletter_subscribers")
    .insert({ email, source: "newsletter-subscribe-fn" });

  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      return json({ ok: true, alreadySubscribed: true });
    }
    console.error("[newsletter] insert error", insErr);
    return json({ error: "No se pudo completar la suscripción." }, 500);
  }

  // New subscriber — send the welcome email (best-effort; never fail the signup on email error).
  if (RESEND_API_KEY) {
    try {
      const now = new Date();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const { data: events } = await sb
        .from("events")
        .select("title, starts_at, location")
        .gte("starts_at", now.toISOString())
        .lt("starts_at", monthEnd)
        .order("starts_at", { ascending: true })
        .limit(8);

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [email],
          subject: "¡Gracias por suscribirte! — Iglesia Restauración Divina",
          html: welcomeEmail(events || []),
        }),
      });
      if (!res.ok) console.error("[newsletter] resend error", res.status, await res.text());
    } catch (e) {
      console.error("[newsletter] welcome email failed", e);
    }
  } else {
    console.warn("[newsletter] RESEND_API_KEY not set — subscriber saved, no email sent.");
  }

  return json({ ok: true });
});
