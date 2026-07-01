// supabase/functions/newsletter-unsubscribe/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public one-click unsubscribe. The token in ?token=<uuid> IS the credential,
// so no session is required.
//   • GET  → mark unsubscribed, return a branded confirmation page (footer link)
//   • POST → RFC 8058 one-click (mail-client "Unsubscribe" button); returns 200
//
// Deploy: supabase functions deploy newsletter-unsubscribe --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { esc, LOGO_SVG, SITE_URL } from "../_shared/email.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, message: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e6ea;">
        <tr><td style="background-color:#345a65;padding:30px 32px;text-align:center;">
          ${LOGO_SVG}
          <div style="font-size:21px;font-weight:700;color:#ffffff;">Iglesia Restauración Divina</div>
        </td></tr>
        <tr><td style="padding:38px 32px;text-align:center;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#1a2d32;">${esc(title)}</h1>
          <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#4b5563;">${esc(message)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="border-radius:9px;background-color:#c89858;">
              <a href="${SITE_URL}" target="_blank" style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:700;color:#1a2c33;text-decoration:none;border-radius:9px;">Volver al sitio</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return page("Algo salió mal", "El servicio no está configurado correctamente. Intenta más tarde.", 500);
  }

  const token = new URL(req.url).searchParams.get("token") || "";
  const isPost = req.method === "POST"; // one-click: respond plain, no HTML page

  if (!UUID_RE.test(token)) {
    return isPost
      ? new Response("Invalid token", { status: 400 })
      : page("Enlace inválido", "Este enlace para cancelar la suscripción no es válido. Si el problema persiste, contáctanos.", 400);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Only flip active → unsubscribed; leave an already-opted-out row untouched so
  // we don't overwrite the original opt-out time.
  const { data, error } = await sb
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .is("unsubscribed_at", null)
    .select("email");

  if (error) {
    console.error("[unsubscribe] update error", error);
    return isPost
      ? new Response("Error", { status: 500 })
      : page("Algo salió mal", "No pudimos procesar tu solicitud. Intenta de nuevo más tarde.", 500);
  }

  // data empty = token unknown OR already unsubscribed. Either way the end state
  // is "not subscribed", so we confirm success (idempotent + no info leak).
  const already = !data || data.length === 0;

  if (isPost) return new Response(null, { status: 200 });
  return page(
    "Suscripción cancelada",
    already
      ? "Ya no estás suscrito a nuestras noticias. No recibirás más correos."
      : "Listo. Cancelamos tu suscripción y no recibirás más correos. Lamentamos verte partir — siempre serás bienvenido.",
  );
});
