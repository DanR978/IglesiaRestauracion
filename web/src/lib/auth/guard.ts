/* ============================================================================
 * web/src/lib/auth/guard.ts — where an admin page visit goes (S38)
 * ----------------------------------------------------------------------------
 * The pure half of guardAdmin() in #lib/stores/session.svelte.ts, which the
 * (app) layout's load calls before any admin page renders:
 *
 *   1. The legacy email contract, first. Invitation and recovery emails link to
 *      `/admin/?action=accept-invite|reset-password&token_hash=…&type=…`
 *      (supabase/email-templates). They land on the legacy panel until the
 *      cutover (D-001, S64); from then on they arrive here, and the query (and
 *      hash) is carried unchanged to acceso/invitacion/ or acceso/restablecer/,
 *      which spend the token — nothing is spent here.
 *   2. The access state (#lib/auth/access): signed out or expired → sign in,
 *      keeping the page asked for in `?next=`; a second factor pending →
 *      verificar/ (with `next`); no access → sin-acceso/. `ready` and `error`
 *      stay: the shell renders the error state with Retry, because a failed
 *      read in transit is never a sign-out.
 *
 * `next` is only ever read back through safeNext() (./next).
 *
 * Usage:
 *   import { emailLinkTarget, accessTarget } from '#lib/auth/guard.js';
 *   const to = emailLinkTarget(url, location.hash) ?? accessTarget(url, status);
 *   if (to) redirect(307, to);
 * ========================================================================== */

import type { AccessState } from './access';
import { ROUTES } from './routes';

/** The session store's status: an access state, `expired`, or still `loading`. */
export type GuardStatus = AccessState | 'expired' | 'loading';

/**
 * Where an invitation or recovery link must go, query and hash intact; null
 * when `url` is not one. `action` decides; a bare `token_hash` + `type` goes
 * by its type (recovery → restablecer/, anything else → invitacion/).
 */
export function emailLinkTarget(url: URL, hash = ''): string | null {
  const params = url.searchParams;
  const action = params.get('action');
  let target: string | null = null;
  if (action === 'accept-invite') target = ROUTES.invite;
  else if (action === 'reset-password') target = ROUTES.reset;
  else if (params.get('token_hash') && params.get('type')) {
    target = params.get('type') === 'recovery' ? ROUTES.reset : ROUTES.invite;
  }
  return target ? `${target}${url.search}${hash}` : null;
}

/** Where the access state sends this visit; null to let the page render. */
export function accessTarget(url: URL, status: GuardStatus): string | null {
  const here = url.pathname + url.search;
  const next = here === ROUTES.home ? '' : `?next=${encodeURIComponent(here)}`;
  switch (status) {
    case 'signed-out':
    case 'expired':
      return ROUTES.login + next;
    case 'needs-mfa':
    case 'needs-enroll':
      return ROUTES.verify + next;
    case 'forbidden':
      return ROUTES.noAccess;
    case 'ready':
    case 'error':
    case 'loading':
      return null;
  }
}
