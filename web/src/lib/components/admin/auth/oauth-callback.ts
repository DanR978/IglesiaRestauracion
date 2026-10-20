/* ============================================================================
 * web/src/lib/components/admin/auth/oauth-callback.ts — the OAuth return (S39)
 * ----------------------------------------------------------------------------
 * What Google or Microsoft (through Supabase Auth, D-035 / ADR-0005) sent back
 * to acceso/oauth/, and the Spanish the callback screen shows for a failure.
 * GoTrue reports a failure as `error` (the OAuth category) plus, for its own
 * refusals, `error_code`; a provider-side cancel arrives as
 * `error=access_denied` with no `error_code`. Mapped by code, never by the
 * English `error_description`, which goes to the console only:
 *
 *   signup_disabled, provider_email_needs_verification   no invitation (or an
 *                        unverified provider email — GoTrue cannot tell them apart)
 *   access_denied, no error_code                         cancelled at the provider
 *   bad_oauth_state, bad_oauth_callback, flow_state_*,
 *   bad_code_verifier                                    the attempt expired
 *   pkce_code_verifier_not_found                         another browser (auth-js,
 *                                                        before any request)
 *   user_banned                                          the account is suspended
 *   anything else                                        one generic message
 *
 * The same mapping reads exchangeCode()'s failure code. A failure in transit
 * is the page's to handle (it keeps the code and offers Reintentar).
 *
 * Usage:
 *   import { readCallback, callbackErrorMessage } from '#lib/components/admin/auth/oauth-callback.js';
 *   const outcome = readCallback(authParams(new URL(location.href)));
 *   if (outcome.kind === 'error') show(outcome.message);
 * ========================================================================== */

import { AUTH_ERRORS } from '#lib/auth/errors.js';

export const CALLBACK_COPY = {
  noInvitation:
    'Esta cuenta no tiene una invitación vigente, o el proveedor no confirmó tu correo. Pide una invitación al administrador.',
  cancelled: 'Cancelaste el inicio de sesión.',
  expired: 'El enlace de inicio de sesión expiró. Inténtalo de nuevo.',
  otherBrowser: 'Abre el enlace en el mismo navegador donde iniciaste sesión.',
  generic:
    'No pudimos completar el inicio de sesión con Google o Microsoft. Inténtalo de nuevo o entra con tu correo y contraseña.',
  incomplete: 'Este enlace de inicio de sesión está incompleto. Vuelve a iniciar sesión.',
} as const;

const NO_INVITATION = new Set(['signup_disabled', 'provider_email_needs_verification']);
const EXPIRED = new Set([
  'bad_oauth_state',
  'bad_oauth_callback',
  'flow_state_not_found',
  'flow_state_expired',
  'bad_code_verifier',
]);

/** The copy for a failed return: GoTrue's `error_code` first, else the OAuth `error`. */
export function callbackErrorMessage(code: string | null, error: string | null = null): string {
  if (code && NO_INVITATION.has(code)) return CALLBACK_COPY.noInvitation;
  if (code && EXPIRED.has(code)) return CALLBACK_COPY.expired;
  if (code === 'pkce_code_verifier_not_found') return CALLBACK_COPY.otherBrowser;
  if (code === 'user_banned') return AUTH_ERRORS.user_banned.message;
  if (!code && error === 'access_denied') return CALLBACK_COPY.cancelled;
  return CALLBACK_COPY.generic;
}

export type CallbackOutcome =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string; code: string }
  | { kind: 'none' };

/** What came back: an authorization code to exchange, a failure, or nothing at all. */
export function readCallback(params: URLSearchParams): CallbackOutcome {
  const errorCode = params.get('error_code') || null;
  const error = params.get('error') || null;
  if (errorCode || error) {
    const description = params.get('error_description') ?? '';
    const code = errorCode ?? (error as string);
    console.warn('[acceso] oauth:', [code, description].filter(Boolean).join(': '));
    return { kind: 'error', message: callbackErrorMessage(errorCode, error), code };
  }
  const code = params.get('code');
  return code ? { kind: 'code', code } : { kind: 'none' };
}
