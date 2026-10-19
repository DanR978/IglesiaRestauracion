/* ============================================================================
 * web/src/lib/repos/errors.ts — backend failures → RepoError (S22b · D-032)
 * ----------------------------------------------------------------------------
 * The ONE place a Supabase or fetch failure becomes something a view can show
 * (ADR-0004). PostgREST, Postgres, Storage and GoTrue errors and a dropped
 * connection all come out as a `RepoError`:
 *
 *   kind     which state the view renders (retry, sign in again, not found…)
 *   message  human Spanish copy — the only error text a view may render
 *   detail   the raw backend text (code, message, hint) for the console only
 *
 * Classification, first match wins:
 *   1. no answer at all — fetch threw, status 0, aborted, timed out → network
 *   2. the error name or `code`: PostgREST `PGRST…` and Postgres SQLSTATE
 *      codes are decided by the code alone (an unlisted one is `unknown`,
 *      never guessed from its HTTP status — PostgREST answers a missing
 *      table with 404); GoTrue and Storage codes come from the tables below
 *   3. the HTTP status: Storage's body `statusCode` first (the Storage API
 *      can answer 400 and put the real status in the body), then the error's
 *      own `status`, then the response status the caller passed in
 *   4. otherwise → unknown
 * Message wording is only read to recognise a dropped connection; codes are
 * stable, English messages are not.
 *
 * Pure — no client import — so the S38/S39 auth module can map GoTrue
 * errors through it too.
 *
 * Usage:
 *   import { fail, invalid, noRows, ok } from './errors';
 *   const { data, error, status } = await supabase.from('events').select('*');
 *   if (error) return fail(TAG, 'fetchEvents', error, status);
 *   return ok(data ?? []);
 * ========================================================================== */

import type { RepoError, RepoErrorKind, RepoFailure } from './types';

/** The copy each kind renders, unless its code has a more precise one below. */
export const REPO_ERROR_MESSAGES: Readonly<Record<RepoErrorKind, string>> = {
  network: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  auth: 'Tu sesión expiró. Inicia sesión de nuevo para continuar.',
  forbidden: 'No tienes permiso para realizar esta acción.',
  not_found: 'No encontramos este registro. Puede que ya no exista o que no tengas acceso a él.',
  conflict:
    'No se pudo guardar porque entra en conflicto con otros datos. Recarga e inténtalo de nuevo.',
  invalid: 'Algunos datos no son válidos. Revísalos e inténtalo de nuevo.',
  unknown: 'Algo salió mal. Inténtalo de nuevo en unos momentos.',
};

const TOO_MANY_ATTEMPTS = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
const CONFIRM_IDENTITY = 'Por seguridad, confirma tu identidad de nuevo para continuar.';

/** Codes whose kind copy would mislead the person reading it. */
const CODE_MESSAGES: Readonly<Record<string, string>> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'No se puede completar porque está vinculado a otros datos.',
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
  mfa_verification_failed: 'El código no es correcto. Inténtalo de nuevo.',
  otp_expired: 'El enlace o el código expiró. Solicita uno nuevo.',
  insufficient_aal: CONFIRM_IDENTITY,
  reauthentication_needed: CONFIRM_IDENTITY,
  weak_password: 'La contraseña es demasiado débil. Elige una más larga.',
  same_password: 'La nueva contraseña debe ser distinta de la actual.',
  over_request_rate_limit: TOO_MANY_ATTEMPTS,
  over_email_send_rate_limit: TOO_MANY_ATTEMPTS,
  over_sms_send_rate_limit: TOO_MANY_ATTEMPTS,
};

const byKind = (kind: RepoErrorKind, codes: string[]): [string, RepoErrorKind][] =>
  codes.map((code) => [code, kind]);

/** Exact codes: PostgREST, Postgres SQLSTATE, GoTrue (auth-js `ErrorCode`), Storage API. */
const KIND_BY_CODE = new Map<string, RepoErrorKind>([
  // PostgREST: `.single()` matched no row; JWT rejected.
  ...byKind('not_found', ['PGRST116']),
  ...byKind('auth', ['PGRST301', 'PGRST302', 'PGRST303']),
  // Postgres. 42501 is RLS and grants; P0001 is a plain `raise exception`,
  // which this schema only uses for input validation.
  ...byKind('forbidden', ['42501']),
  ...byKind('conflict', ['23505', '23503', '23P01', '40001', '40P01']),
  ...byKind('invalid', ['23502', '23514', 'P0001']),
  ...byKind('not_found', ['P0002']),
  // GoTrue.
  ...byKind('auth', [
    'bad_jwt',
    'invalid_jwt',
    'no_authorization',
    'session_not_found',
    'session_expired',
    'refresh_token_not_found',
    'refresh_token_already_used',
    'invalid_credentials',
    'email_not_confirmed',
    'phone_not_confirmed',
    'flow_state_not_found',
    'flow_state_expired',
    'bad_code_verifier',
    'pkce_code_verifier_not_found',
    'bad_oauth_state',
    'bad_oauth_callback',
    'otp_expired',
    'insufficient_aal',
    'reauthentication_needed',
    'reauthentication_not_valid',
    'mfa_challenge_expired',
    'mfa_verification_failed',
    'mfa_verification_rejected',
    'mfa_ip_address_mismatch',
    'unexpected_audience',
  ]),
  ...byKind('forbidden', [
    'not_admin',
    'user_banned',
    'signup_disabled',
    'provider_disabled',
    'email_provider_disabled',
    'phone_provider_disabled',
    'anonymous_provider_disabled',
    'otp_disabled',
    'manual_linking_disabled',
    'email_address_not_authorized',
    'user_sso_managed',
    'oauth_provider_not_supported',
    'mfa_totp_enroll_not_enabled',
    'mfa_totp_verify_not_enabled',
  ]),
  ...byKind('not_found', [
    'user_not_found',
    'identity_not_found',
    'invite_not_found',
    'mfa_factor_not_found',
    'sso_provider_not_found',
  ]),
  ...byKind('conflict', [
    'conflict',
    'email_exists',
    'phone_exists',
    'user_already_exists',
    'identity_already_exists',
    'mfa_factor_name_conflict',
    'mfa_verified_factor_exists',
    'too_many_enrolled_mfa_factors',
    'single_identity_not_deletable',
    'email_conflict_identity_not_deletable',
  ]),
  ...byKind('invalid', [
    'validation_failed',
    'bad_json',
    'email_address_invalid',
    'weak_password',
    'same_password',
    'captcha_failed',
  ]),
  ...byKind('network', ['request_timeout', 'hook_timeout', 'hook_timeout_after_retry']),
  ...byKind('unknown', [
    'over_request_rate_limit',
    'over_email_send_rate_limit',
    'over_sms_send_rate_limit',
  ]),
  // Storage API.
  ...byKind('not_found', ['NoSuchKey', 'NoSuchBucket', 'NoSuchUpload']),
  ...byKind('auth', ['InvalidJWT']),
  ...byKind('forbidden', ['AccessDenied']),
  ...byKind('conflict', ['KeyAlreadyExists', 'ResourceAlreadyExists']),
  ...byKind('invalid', ['EntityTooLarge', 'InvalidMimeType', 'InvalidKey', 'InvalidRequest']),
]);

/** Error class names that say what happened without a code. */
const KIND_BY_NAME = new Map<string, RepoErrorKind>([
  ...byKind('network', [
    'AbortError',
    'TimeoutError',
    'AuthRetryableFetchError',
    'FunctionsFetchError',
  ]),
  ...byKind('auth', [
    'AuthSessionMissingError',
    'AuthImplicitGrantRedirectError',
    'AuthPKCEGrantCodeExchangeError',
  ]),
]);

/**
 * How browsers and Node word "the request never got an answer". postgrest-js
 * prefixes the error name ("TypeError: Failed to fetch", "AbortError: …").
 */
const NO_ANSWER =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|aborterror|timeouterror/i;

/** A PostgREST code or a five-character Postgres SQLSTATE. */
const SERVER_CODE = /^(PGRST[0-9X]+|[0-9A-Z]{5})$/;

/** Classes of the codes `KIND_BY_CODE` does not list one by one. */
function kindOfServerCode(code: string): RepoErrorKind {
  if (code.startsWith('PGRST')) {
    const group = code.charAt(5);
    if (group === '0') return 'network'; // PGRST000–003: the database is unreachable
    if (group === '1') return 'invalid'; // the request itself is malformed
    return 'unknown'; // schema cache, server configuration, internal errors
  }
  switch (code.slice(0, 2)) {
    case '08':
      return 'network'; // connection exception
    case '22':
      return 'invalid'; // data exception: bad uuid (22P02), value too long…
    case '23':
      return 'conflict'; // integrity constraint violation
    case '28':
      return 'auth'; // invalid authorization specification
    case '40':
      return 'conflict'; // transaction rollback
    default:
      return 'unknown'; // a missing table/column/function is a bug, not "not found"
  }
}

function kindOfStatus(status: number): RepoErrorKind | null {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if ([400, 413, 415, 422].includes(status)) return 'invalid';
  if ([408, 502, 503, 504].includes(status) || (status >= 520 && status <= 530)) return 'network';
  return null;
}

type ErrorFields = {
  message: string;
  code: string;
  name: string;
  hint: string;
  status: number | null;
  statusCode: string;
};

function fieldsOf(raw: unknown): ErrorFields {
  const fields: ErrorFields = {
    message: '',
    code: '',
    name: '',
    hint: '',
    status: null,
    statusCode: '',
  };
  if (raw === null || raw === undefined) return fields;
  if (typeof raw !== 'object') return { ...fields, message: String(raw) };
  const r = raw as Record<string, unknown>;
  const text = (v: unknown): string =>
    typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  return {
    message: text(r.message),
    code: text(r.code),
    name: text(r.name),
    hint: text(r.hint),
    status: typeof r.status === 'number' ? r.status : null,
    statusCode: text(r.statusCode),
  };
}

function kindOf(f: ErrorFields, responseStatus: number | undefined): RepoErrorKind {
  if (responseStatus === 0 || f.status === 0) return 'network';
  const byName = KIND_BY_NAME.get(f.name);
  if (byName) return byName;
  if (NO_ANSWER.test(f.message)) return 'network';

  if (f.code) {
    const byCode = KIND_BY_CODE.get(f.code);
    if (byCode) return byCode;
    if (SERVER_CODE.test(f.code)) return kindOfServerCode(f.code);
  }

  const bodyStatus = /^\d{3}$/.test(f.statusCode) ? Number(f.statusCode) : null;
  if (bodyStatus === null) {
    const byStorageCode = KIND_BY_CODE.get(f.statusCode);
    if (byStorageCode) return byStorageCode;
  }
  // The most specific status decides; a less specific one never overrides it.
  const status = bodyStatus ?? f.status ?? responseStatus;
  return (typeof status === 'number' && kindOfStatus(status)) || 'unknown';
}

/** `"42501: permission denied for table events (hint)"` — for the console only. */
function detailOf(f: ErrorFields): string {
  const label = f.code || f.statusCode;
  const text = [label, f.message].filter(Boolean).join(': ');
  return f.hint ? `${text} (${f.hint})` : text;
}

/**
 * Map any Supabase / fetch failure to a `RepoError`. `responseStatus` is the
 * PostgREST response's `status` (it is not on the error object itself).
 */
export function toRepoError(raw: unknown, responseStatus?: number): RepoError {
  const f = fieldsOf(raw);
  const kind = kindOf(f, responseStatus);
  const tooMany = [f.status, responseStatus, Number(f.statusCode)].includes(429);
  const message =
    CODE_MESSAGES[f.code] ?? (tooMany ? TOO_MANY_ATTEMPTS : REPO_ERROR_MESSAGES[kind]);
  const detail = detailOf(f);
  return detail ? { kind, message, detail } : { kind, message };
}

/** Map a backend failure, log its raw detail once with the module tag, return it. */
export function fail(tag: string, fn: string, raw: unknown, responseStatus?: number): RepoFailure {
  const error = toRepoError(raw, responseStatus);
  console.warn(`${tag} ${fn}:`, error.detail ?? error.message);
  return { ok: false, error };
}

/** A request refused before it reached the network. `message` is Spanish, user-facing. */
export function invalid(message: string): RepoFailure {
  return { ok: false, error: { kind: 'invalid', message } };
}

/**
 * A delete/update that had to change a row and changed none: the row is gone,
 * or RLS hid it — never a success (D-027). Callers ask PostgREST for
 * `{ count: 'exact' }` and come here when the count is 0 or missing.
 */
export function noRows(tag: string, fn: string): RepoFailure {
  const error: RepoError = {
    kind: 'not_found',
    message: REPO_ERROR_MESSAGES.not_found,
    detail: 'no row was affected',
  };
  console.warn(`${tag} ${fn}:`, error.detail);
  return { ok: false, error };
}

/** The success branch of a `ReadResult` / `WriteResult`. */
export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}
