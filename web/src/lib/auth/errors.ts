/* ============================================================================
 * web/src/lib/auth/errors.ts — Supabase Auth failures → Spanish (S38 · S39)
 * ----------------------------------------------------------------------------
 * Retires js/pages/admin/auth-errors.js (DF-006): the same codes, plus the
 * OAuth callback codes (D-035) and the two-step verification ones, mapped by
 * GoTrue's stable `code` — never by its English message. The kind (which
 * state a screen renders) comes from the one classifier in #lib/repos/errors;
 * this module only picks sign-in-specific copy. Raw text (the message, an
 * OAuth `error_description`) goes to console.warn, never to the screen.
 *
 * An `AuthFlowError` is a RepoError that keeps the `code`, so a screen can
 * branch on it (`insufficient_aal` → ask for the code first;
 * `pkce_code_verifier_not_found` → start again) without parsing text.
 *
 * GoTrue sends `current_password_invalid` (not "…mismatch") when "Require
 * current password" is on and the current password is wrong.
 *
 * Usage:
 *   import { authFail, authErrorFromParams } from '#lib/auth/errors.js';
 *   if (error) return authFail('signInWithPassword', error);
 *   const failed = authErrorFromParams(new URL(location.href).searchParams);
 * ========================================================================== */

import { REPO_ERROR_MESSAGES, toRepoError } from '#lib/repos/errors.js';
import type { RepoError, RepoErrorKind } from '#lib/repos/types.js';

const TAG = '[auth]';

/** A RepoError plus GoTrue's stable code (or null) — for flow decisions, never shown. */
export interface AuthFlowError extends RepoError {
  code: string | null;
}

export type AuthFailure = { ok: false; error: AuthFlowError };
/** What every auth call resolves to; assignable to ReadResult / WriteResult. */
export type AuthResult<T = undefined> = { ok: true; data: T } | AuthFailure;

const TOO_MANY = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
const SESSION_EXPIRED = 'Tu sesión expiró. Inicia sesión de nuevo.';
const BAD_CODE = 'Código incorrecto o expirado. Revisa tu app e inténtalo de nuevo.';
const START_AGAIN =
  'No pudimos completar el inicio de sesión. Vuelve a empezar desde la página de acceso.';
const SAME_BROWSER =
  'No pudimos completar el inicio de sesión en este navegador. Vuelve a empezar desde la página de acceso, en el mismo navegador.';
const MFA_UNAVAILABLE =
  'La verificación en dos pasos no está disponible en este momento. Contacta al administrador.';

type Entry = { message: string; kind?: RepoErrorKind };

/** GoTrue / auth-js code → copy (and a kind where the classifier has none). */
export const AUTH_ERRORS: Readonly<Record<string, Entry>> = {
  // Sign-in
  invalid_credentials: { message: 'Correo o contraseña incorrectos.' },
  email_not_confirmed: { message: 'Tu cuenta aún no está activada. Revisa tu correo.' },
  user_banned: { message: 'Esta cuenta está suspendida. Contacta al administrador.' },
  over_request_rate_limit: { message: TOO_MANY },
  over_email_send_rate_limit: { message: TOO_MANY },
  over_sms_send_rate_limit: { message: TOO_MANY },
  validation_failed: { message: 'Revisa los datos e inténtalo de nuevo.' },
  email_address_invalid: { message: 'Escribe un correo electrónico válido.' },
  email_address_not_authorized: {
    message: 'No pudimos enviar el correo a esa dirección. Contacta al administrador.',
  },

  // Passwords
  weak_password: { message: 'La contraseña es muy débil. Usa al menos 8 caracteres.' },
  same_password: { message: 'La nueva contraseña debe ser distinta de la actual.' },
  current_password_required: { message: 'Escribe tu contraseña actual.', kind: 'invalid' },
  current_password_invalid: { message: 'La contraseña actual no es correcta.', kind: 'invalid' },
  reauthentication_needed: {
    message: 'Por seguridad, confirma tu identidad de nuevo para continuar.',
  },
  reauthentication_not_valid: {
    message: 'El código de confirmación no es válido. Solicita uno nuevo.',
  },

  // Sessions and email links
  session_not_found: { message: SESSION_EXPIRED },
  user_not_found: { message: SESSION_EXPIRED, kind: 'auth' },
  session_expired: { message: SESSION_EXPIRED },
  refresh_token_not_found: { message: SESSION_EXPIRED },
  refresh_token_already_used: { message: SESSION_EXPIRED },
  bad_jwt: { message: SESSION_EXPIRED },
  otp_expired: { message: 'El enlace expiró o ya se usó. Pide uno nuevo.' },

  // Two-step verification (D-033)
  insufficient_aal: { message: 'Confirma tu identidad con el código de tu app para continuar.' },
  mfa_verification_failed: { message: BAD_CODE },
  mfa_challenge_expired: {
    message: 'El código expiró. Escribe el código que muestra ahora tu app.',
  },
  mfa_verification_rejected: { message: 'No se pudo verificar el código. Inténtalo de nuevo.' },
  mfa_ip_address_mismatch: {
    message: 'La verificación empezó desde otra conexión. Inténtalo de nuevo.',
  },
  mfa_factor_name_conflict: {
    message: 'No se pudo registrar el dispositivo. Inténtalo de nuevo.',
  },
  mfa_factor_not_found: {
    message: 'Ese dispositivo ya no está registrado. Recarga la página.',
  },
  mfa_verified_factor_exists: {
    message: 'Ya tienes un dispositivo registrado. Escribe el código que muestra tu app.',
  },
  too_many_enrolled_mfa_factors: {
    message: 'Tienes demasiados dispositivos registrados. Contacta al administrador.',
  },
  mfa_totp_enroll_not_enabled: { message: MFA_UNAVAILABLE },
  mfa_totp_verify_not_enabled: { message: MFA_UNAVAILABLE },
  mfa_step_not_ready: {
    message: 'No se pudo preparar la verificación. Inténtalo de nuevo.',
    kind: 'unknown',
  },

  // Google / Microsoft (D-035) — the callback's `error_code` / `error`
  signup_disabled: {
    message:
      'No hay ninguna cuenta invitada con ese correo. Entra con el correo con el que te invitaron.',
  },
  access_denied: {
    message: 'No se completó el inicio de sesión con el proveedor. Inténtalo de nuevo.',
    kind: 'forbidden',
  },
  provider_disabled: {
    message: 'Ese método de acceso no está disponible. Entra con tu correo y contraseña.',
  },
  provider_email_needs_verification: {
    message:
      'Tu proveedor aún no confirmó tu correo. Confírmalo con Google o Microsoft e inténtalo de nuevo.',
    kind: 'forbidden',
  },
  oauth_provider_not_supported: {
    message: 'Ese método de acceso no está disponible. Entra con tu correo y contraseña.',
  },
  manual_linking_disabled: {
    message: 'No se puede vincular otra cuenta desde aquí. Contacta al administrador.',
  },
  identity_already_exists: {
    message: 'Esa cuenta de Google o Microsoft ya está vinculada a otro usuario.',
  },
  bad_oauth_state: { message: START_AGAIN },
  bad_oauth_callback: { message: START_AGAIN },
  flow_state_not_found: { message: START_AGAIN },
  flow_state_expired: {
    message: 'El inicio de sesión tardó demasiado y expiró. Vuelve a intentarlo.',
  },
  bad_code_verifier: { message: SAME_BROWSER },
  pkce_code_verifier_not_found: { message: SAME_BROWSER },
  server_error: { message: REPO_ERROR_MESSAGES.unknown, kind: 'unknown' },
  temporarily_unavailable: { message: REPO_ERROR_MESSAGES.network, kind: 'network' },
};

function codeOf(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const code = (raw as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : null;
}

/**
 * Map an auth-js error (or any failure an auth call threw) to Spanish copy,
 * keeping GoTrue's `code`. Unmapped codes fall back to the copy of their kind.
 */
export function toAuthError(raw: unknown): AuthFlowError {
  const base = toRepoError(raw);
  const code = codeOf(raw);
  const entry = code ? AUTH_ERRORS[code] : undefined;
  const kind = entry?.kind ?? base.kind;
  const message = entry?.message ?? base.message;
  return base.detail ? { kind, message, detail: base.detail, code } : { kind, message, code };
}

/** Map, log the raw detail once under `[auth]`, return the failure. */
export function authFail(fn: string, raw: unknown): AuthFailure {
  const error = toAuthError(raw);
  console.warn(`${TAG} ${fn}:`, error.detail ?? error.message);
  return { ok: false, error };
}

/** A request refused before it reached the network. `message` is Spanish. */
export function authInvalid(message: string): AuthFailure {
  return { ok: false, error: { kind: 'invalid', message, code: null } };
}

/**
 * The failure an OAuth callback or an email link reports in its URL
 * (`error`, `error_code`, `error_description`), or null when there is none.
 * The description is the provider's raw text: console only.
 */
export function authErrorFromParams(params: URLSearchParams): AuthFlowError | null {
  const code = params.get('error_code') || params.get('error');
  if (!code) return null;
  const description = params.get('error_description') ?? '';
  console.warn(`${TAG} callback:`, [code, description].filter(Boolean).join(': '));
  return toAuthError({ code, message: description });
}
