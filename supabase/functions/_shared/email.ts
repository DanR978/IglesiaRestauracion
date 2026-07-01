// supabase/functions/_shared/email.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks for every newsletter email (welcome, monthly digest,
// day-before reminders). One source of truth so all three look identical, share
// the same branded shell, and carry a working one-click unsubscribe.
//
// Nothing here talks to the database except fetchMonthEvents/fetchEventsBetween,
// which take a Supabase client so the caller owns credentials.
// ─────────────────────────────────────────────────────────────────────────────

export const FROM = "Iglesia Restauración Divina <noreply@irdlex.org>";
export const SITE_URL = "https://www.irdlex.org";
export const TZ = "America/New_York";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Small formatting helpers ────────────────────────────────────────────────
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      weekday: "long", day: "numeric", month: "long", timeZone: TZ,
    }).format(new Date(iso));
  } catch { return ""; }
}
export function fmtTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
    }).format(new Date(iso));
  } catch { return ""; }
}
export function monthNameES(d = new Date()) {
  return new Intl.DateTimeFormat("es", { month: "long", timeZone: TZ }).format(d);
}
// YYYY-MM-DD for a Date, evaluated in the church's timezone (en-CA => ISO order).
export function etDateStr(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ,
  }).format(d);
}
// YYYY-MM key in the church's timezone (used for the monthly idempotency ref).
export function etMonthKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", timeZone: TZ,
  }).format(d);
}

// ── Church logo (same artwork as the auth + welcome emails) ─────────────────
export const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="72" viewBox="0 0 188 235" style="display:block;margin:0 auto 12px;"><path d="M27.127,163.292c2.876,34.244 31.649,61.235 66.623,61.235c8.831,-0 17.264,-1.737 24.989,-4.862c24.531,-9.922 41.89,-33.973 41.89,-62.018l0,-80.919c0,-36.877 -30.003,-66.88 -66.879,-66.88c-36.876,0 -66.879,30.003 -66.879,66.88l-0,80.919c-0,1.902 0.099,3.781 0.256,5.645m-6.678,3.615c-0.397,-3.071 -0.599,-6.163 -0.605,-9.26l-0,-80.919c-0,-40.649 33.258,-73.907 73.906,-73.907c40.648,0 73.906,33.258 73.906,73.907l0,80.919c0,29.795 -17.878,55.598 -43.427,67.265c-9.564,4.378 -19.96,6.644 -30.479,6.642c-37.513,-0 -68.706,-28.33 -73.301,-64.647m96.803,50.91c-13.51,-18.146 -4.969,-43.996 13.621,-59.913c27.374,-23.437 8.897,-38.749 -34.387,-43.967c-43.282,-5.218 3.922,-18.316 3.922,-18.316l-0,-39.027l21.57,-0l0,-13.317l-21.57,-0l-0,-21.979l-13.318,-0l0,21.979l-21.568,-0l-0,13.317l21.568,-0l0,39.027c-45.349,13.27 -31.977,26.785 0,30.72c31.98,3.935 11.248,19.129 -29.212,27.371c-11.493,2.342 -20.945,5.207 -28.557,8.551c-0.109,-1.526 -0.184,-3.061 -0.184,-4.616l0,-80.919c0,-35.628 28.986,-64.613 64.613,-64.613c35.627,-0 64.613,28.985 64.613,64.613l-0,80.919c-0,27.338 -17.074,50.747 -41.111,60.17" style="fill:#ffffff;fill-rule:nonzero;" /></svg>`;

// A bordered "card" row matching the website's card look. `accent` is the
// left-stripe colour. title/sub MUST already be escaped by the caller.
export function itemCard(accent: string, title: string, sub: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;background-color:#f6f8f8;border:1px solid #e6e9ec;border-left:3px solid ${accent};border-radius:10px;">
      <tr><td style="padding:13px 16px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="font-size:15px;font-weight:700;color:#1a2d32;">${title}</div>
        ${sub ? `<div style="font-size:13px;color:#736960;margin-top:3px;">${sub}</div>` : ""}
      </td></tr>
    </table>`;
}

// Render a list of events as accent cards; friendly fallback when empty.
export function eventsHtml(events: Array<Record<string, unknown>>) {
  if (!events.length) {
    return `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4b5563;">
      Pronto anunciaremos nuevos eventos especiales. Mientras tanto, te esperamos en nuestros servicios semanales.</p>`;
  }
  return events.map((e) => {
    const date = cap(fmtDate(String(e.starts_at)));
    const time = fmtTime(String(e.starts_at));
    const parts = [esc(date), time ? esc(time) : "", e.location ? esc(String(e.location)) : ""]
      .filter(Boolean);
    return itemCard("#c89858", esc(String(e.title || "Evento")), parts.join(" · "));
  }).join("");
}

// The weekly-service cards are constant; reused by welcome + monthly digest.
export function weeklyServicesHtml() {
  return `
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#345a65;text-transform:uppercase;letter-spacing:.1em;">Servicios semanales</h2>
    ${itemCard("#345a65", "Servicio de adoración", "Domingo · 2:00 PM")}
    ${itemCard("#345a65", "Estudio bíblico", "Martes · 7:00 PM")}
    ${itemCard("#345a65", "Servicio de oración", "Viernes · 7:00 PM")}`;
}

// ── The branded HTML shell every email uses ─────────────────────────────────
export function emailShell(opts: {
  kicker: string;          // small header eyebrow, e.g. "Noticias y Eventos"
  heading: string;         // <h1> at the top of the body
  intro?: string;          // lead paragraph under the heading
  contentHtml: string;     // the middle section (cards, event lists, …)
  ctaLabel?: string;       // optional gold button
  ctaUrl?: string;
  unsubscribeUrl?: string; // footer opt-out link
}) {
  const { kicker, heading, intro, contentHtml, ctaLabel, ctaUrl, unsubscribeUrl } = opts;
  const cta = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 6px;">
         <tr><td style="border-radius:9px;background-color:#c89858;">
           <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:13px 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#1a2c33;text-decoration:none;border-radius:9px;">${esc(ctaLabel)}</a>
         </td></tr>
       </table>`
    : "";
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" target="_blank" style="color:#9aa1a9;text-decoration:underline;">Cancelar suscripción</a>`
    : "";
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e6ea;">

        <tr><td style="background-color:#345a65;padding:30px 32px;text-align:center;">
          ${LOGO_SVG}
          <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:21px;font-weight:700;color:#ffffff;">Iglesia Restauración Divina</div>
          <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#a9c6cf;margin-top:4px;letter-spacing:.12em;text-transform:uppercase;">${esc(kicker)}</div>
        </td></tr>

        <tr><td style="padding:38px 32px 26px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#1a2d32;">${esc(heading)}</h1>
          ${intro ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#4b5563;">${intro}</p>` : ""}
          ${contentHtml}
          ${cta}
        </td></tr>

        <tr><td style="background-color:#f4f5f7;padding:20px 32px;text-align:center;border-top:1px solid #e3e6ea;">
          <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#9aa1a9;line-height:1.6;">
            Iglesia Restauración Divina · 2601 Clays Mill Rd, Lexington, KY 40503<br>
            <a href="${SITE_URL}" target="_blank" style="color:#736960;text-decoration:none;">www.irdlex.org</a>${unsub}
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Public unsubscribe link for a subscriber, served by the newsletter-unsubscribe
// function on the same Supabase host (supabaseUrl = SUPABASE_URL env var).
export function unsubscribeUrl(supabaseUrl: string, token: string) {
  return `${supabaseUrl}/functions/v1/newsletter-unsubscribe?token=${encodeURIComponent(token)}`;
}

// ── Event queries ───────────────────────────────────────────────────────────
// Upcoming events from now through the end of the current month (church TZ),
// used by both the welcome email and the monthly digest so content matches.
// deno-lint-ignore no-explicit-any
export async function fetchMonthEvents(sb: any, limit = 12) {
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { data } = await sb
    .from("events")
    .select("title, starts_at, location")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", monthEnd)
    .order("starts_at", { ascending: true })
    .limit(limit);
  return (data || []) as Array<Record<string, unknown>>;
}

// Events with a start time in [fromISO, toISO). Used by the reminder job to grab
// a 48h window it then filters down to "tomorrow" in the church timezone.
// deno-lint-ignore no-explicit-any
export async function fetchEventsBetween(sb: any, fromISO: string, toISO: string) {
  const { data } = await sb
    .from("events")
    .select("id, title, starts_at, location")
    .gte("starts_at", fromISO)
    .lt("starts_at", toISO)
    .order("starts_at", { ascending: true });
  return (data || []) as Array<Record<string, unknown>>;
}

// ── Resend send helpers ─────────────────────────────────────────────────────
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl?: string; // enables one-click List-Unsubscribe for this message
}

function resendPayload(m: OutgoingEmail) {
  // RFC 8058 one-click unsubscribe: mail clients (Gmail/Apple) show a native
  // "Unsubscribe" button and POST to this URL. The newsletter-unsubscribe fn
  // handles both the GET link (footer) and the POST (one-click).
  const headers = m.unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${m.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;
  return { from: FROM, to: [m.to], subject: m.subject, html: m.html, ...(headers ? { headers } : {}) };
}

// Send a single email. Returns true on success (never throws — logs instead).
export async function sendEmail(apiKey: string, m: OutgoingEmail): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(resendPayload(m)),
    });
    if (!res.ok) { console.error("[email] resend error", res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("[email] send failed", e);
    return false;
  }
}

// Send many emails via Resend's batch endpoint (max 100 per call). Each message
// keeps its own recipient + unsubscribe URL. Returns the number sent OK.
export async function sendBatch(apiKey: string, messages: OutgoingEmail[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map(resendPayload)),
      });
      if (res.ok) {
        sent += chunk.length;
      } else {
        console.error("[email] resend batch error", res.status, await res.text());
      }
    } catch (e) {
      console.error("[email] batch send failed", e);
    }
    // Gentle pacing between chunks to stay under Resend's rate limit.
    if (i + 100 < messages.length) await new Promise((r) => setTimeout(r, 600));
  }
  return sent;
}
