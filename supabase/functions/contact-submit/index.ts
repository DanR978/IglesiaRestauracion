// supabase/functions/contact-submit/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public "Contáctanos" form → email to the church inbox.
//
// Flow: js/lib/forms.js posts { name, phone, email, message, _honey } here
// (anon). This function drops foreign origins and honeypot hits, validates,
// and emails the message through Resend from noreply@irdlex.org with Reply-To
// set to the visitor, so "Responder" in Outlook answers them directly.
// Nothing is stored.
//
// Replaces FormSubmit: its hashed key delivered to serve@irdlex.org rather
// than the inbox the site advertises, and Microsoft 365 can quarantine its
// mail. Resend mail is DKIM-signed for irdlex.org, so it passes the domain's
// DMARC p=reject policy.
//
// Deploy:  supabase functions deploy contact-submit --no-verify-jwt
//          (no-verify-jwt: anonymous visitors call it without a user session)
// Secrets: RESEND_API_KEY (already set for the newsletter functions)
//          optional CONTACT_TO=<address> — defaults to contactanos@irdlex.org
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { EMAIL_RE, emailShell, esc, sendEmail } from "../_shared/email.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ORIGINS = new Set(["https://www.irdlex.org", "https://irdlex.org"]);
// The Vite dev server. A spoofed Origin is trivial outside a browser, so this
// check only stops other websites from posting through a visitor's browser.
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const DEFAULT_TO = "contactanos@irdlex.org";
const MAX_BODY = 8192;
const MIN_MESSAGE = 20;      // same floor the form enforces
const MAX_MESSAGE = 2000;
const PHONE_RE = /^[0-9()+\-.\s]{7,25}$/;

// Per-isolate flood guard. Isolates are reused across requests, so this caps a
// scripted burst from one IP without a table; a sustained attack would spread
// across isolates, but the Resend daily quota is what it protects.
const MAX_PER_HOUR = 5;
const recent = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const limited = hits.length >= MAX_PER_HOUR;
  if (!limited) hits.push(now);
  if (recent.size > 5000) recent.clear();
  recent.set(ip, hits);
  return limited;
}

// deno-lint-ignore no-explicit-any
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

// Single-line fields lose every control character (no header or layout tricks);
// the message keeps its line breaks.
const line = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const text = (v: unknown) =>
  typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim()
    : "";

function messageEmail(name: string, phone: string, email: string, message: string) {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 14px 6px 0;font-size:13px;color:#736960;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:15px;color:#1a2d32;">${value}</td>
    </tr>`;
  const tel = phone.replace(/[^\d+]/g, "");
  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      ${row("Nombre", esc(name))}
      ${row("Teléfono", `<a href="tel:${esc(tel)}" style="color:#345a65;">${esc(phone)}</a>`)}
      ${row("Correo", `<a href="mailto:${esc(email)}" style="color:#345a65;">${esc(email)}</a>`)}
    </table>
    <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#345a65;text-transform:uppercase;letter-spacing:.1em;">Mensaje</h2>
    <div style="padding:14px 16px;background-color:#f6f8f8;border:1px solid #e6e9ec;border-left:3px solid #c89858;border-radius:10px;font-size:15px;line-height:1.6;color:#1a2d32;">
      ${esc(message).replace(/\n/g, "<br>")}
    </div>`;
  return emailShell({
    kicker: "Formulario de contacto",
    heading: "Nuevo mensaje del sitio web",
    intro: `${esc(name)} escribió desde www.irdlex.org. Responde a este correo para contestarle directamente.`,
    contentHtml: content,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const origin = req.headers.get("origin") ?? "";
  if (!ORIGINS.has(origin) && !DEV_ORIGIN.test(origin)) {
    return json({ error: "Origen no permitido." }, 403);
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("[contact] RESEND_API_KEY not set");
    return json({ error: "La función no está configurada correctamente." }, 500);
  }

  // deno-lint-ignore no-explicit-any
  let b: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "El mensaje es demasiado largo." }, 413);
    b = JSON.parse(raw);
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  if (!b || typeof b !== "object") return json({ error: "Solicitud inválida." }, 400);

  // Honeypot — a bot filled the hidden field. Pretend it worked.
  if (line(b._honey, 200)) return json({ ok: true });

  const name = line(b.name, 80);
  const phone = line(b.phone, 25);
  const email = line(b.email, 254);
  const message = text(b.message);

  if (name.length < 2) return json({ error: "Nombre inválido." }, 400);
  if (!PHONE_RE.test(phone)) return json({ error: "Teléfono inválido." }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Correo electrónico inválido." }, 400);
  if (message.length < MIN_MESSAGE) {
    return json({ error: `El mensaje debe tener al menos ${MIN_MESSAGE} caracteres.` }, 400);
  }
  if (message.length > MAX_MESSAGE) return json({ error: "El mensaje es demasiado largo." }, 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  if (rateLimited(ip)) {
    return json({ error: "Has enviado varios mensajes seguidos. Inténtalo más tarde." }, 429);
  }

  const sent = await sendEmail(RESEND_API_KEY, {
    to: Deno.env.get("CONTACT_TO")?.trim() || DEFAULT_TO,
    subject: `Nuevo mensaje de ${name} — Formulario de contacto`,
    html: messageEmail(name, phone, email, message),
    replyTo: email,
  });
  if (!sent) return json({ error: "No se pudo enviar el mensaje. Inténtalo de nuevo." }, 502);

  return json({ ok: true });
});
