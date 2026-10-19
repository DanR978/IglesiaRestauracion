/* ============================================================================
 * web/tests/integration/helpers/mailpit.ts — the emails GoTrue really sent
 * ----------------------------------------------------------------------------
 * The local stack delivers every Auth email to Mailpit (supabase/config.toml
 * wires the repo's templates). An invitation or recovery link carries a
 * one-time `token_hash` and points at the PRODUCTION legacy panel
 * (https://www.irdlex.org/admin/?action=…&token_hash=…&type=…, D-001 until
 * S64). The suite reads that link here, never follows it, and opens the new
 * route on the local preview with the same query (emailLinkQuery).
 *
 * Mailpit API v1: GET /api/v1/search?query=…, GET /api/v1/message/{ID},
 * DELETE /api/v1/messages {IDs}.
 *
 * Usage:
 *   const mail = await waitForMail(mailpitUrl, ana.email, 'Restablece tu contraseña');
 *   const query = emailLinkQuery(mail.html);       // "?action=…&token_hash=…&type=recovery"
 *   await page.goto(appPath(`admin/acceso/restablecer/${query}`));
 * ========================================================================== */

export interface Mail {
  id: string;
  subject: string;
  html: string;
}

interface SearchAnswer {
  messages?: Array<{ ID: string; Subject: string; Created: string }>;
}

async function search(
  mailpitUrl: string,
  to: string,
): Promise<NonNullable<SearchAnswer['messages']>> {
  const query = encodeURIComponent(`to:"${to}"`);
  const res = await fetch(`${mailpitUrl}/api/v1/search?query=${query}`);
  if (!res.ok) throw new Error(`[integration] Mailpit search → HTTP ${res.status}`);
  return ((await res.json()) as SearchAnswer).messages ?? [];
}

/** The newest email to `to` whose subject starts with `subject`, once Mailpit has it. */
export async function waitForMail(
  mailpitUrl: string,
  to: string,
  subject: string,
  { timeout = 15_000 }: { timeout?: number } = {},
): Promise<Mail> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = (await search(mailpitUrl, to)).find((m) => m.Subject.startsWith(subject));
    if (found) {
      const res = await fetch(`${mailpitUrl}/api/v1/message/${found.ID}`);
      if (!res.ok) throw new Error(`[integration] Mailpit message → HTTP ${res.status}`);
      const message = (await res.json()) as { Subject: string; HTML: string };
      return { id: found.ID, subject: message.Subject, html: message.HTML };
    }
    if (Date.now() > deadline) {
      throw new Error(`[integration] no email "${subject}…" to ${to} within ${timeout} ms`);
    }
    await new Promise((settle) => setTimeout(settle, 250));
  }
}

/** The email's link that carries a `token_hash` — the legacy-panel URL the template builds. */
export function emailLink(html: string): URL {
  const href = html.match(/href="([^"]*[?&](?:amp;)?token_hash=[^"]*)"/)?.[1];
  if (!href) throw new Error('[integration] the email has no token_hash link');
  return new URL(href.replace(/&amp;/g, '&'));
}

/** The query of the email's link (`?action=…&token_hash=…&type=…`), for the local route. */
export const emailLinkQuery = (html: string): string => emailLink(html).search;

/** Delete every email to `to` (cleanup). */
export async function deleteMailTo(mailpitUrl: string, to: string): Promise<void> {
  const ids = (await search(mailpitUrl, to)).map((m) => m.ID);
  if (!ids.length) return;
  const res = await fetch(`${mailpitUrl}/api/v1/messages`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ IDs: ids }),
  });
  if (!res.ok) throw new Error(`[integration] Mailpit delete → HTTP ${res.status}`);
}
