/* ============================================================================
 * web/src/lib/auth/session.ts — the Supabase Auth calls the admin makes (S38)
 * ----------------------------------------------------------------------------
 * With ./mfa, the only code outside the repos that touches the client
 * (target-architecture §3, lint-enforced). Thin wrappers over auth-js for the
 * S39 sign-in screens, S45 Mi cuenta and the session store, retiring the
 * calls js/pages/admin/auth.js and account.js made inline:
 *
 *   sign-in     signInWithPassword · signInWithOAuth (Google, Microsoft —
 *               PKCE, one top-level redirect, D-035) · exchangeCode (the
 *               OAuth callback) · verifyOtp (invite / recovery `token_hash`
 *               links, which work in whatever browser the mail app opens)
 *   account     requestPasswordReset · updatePassword · signOut
 *   providers   fetchEnabledProviders — which buttons to show (fails closed)
 *   store       getSession · getAal · onAuthChange · setRealtimeAuth · reloadPage
 *
 * Every call resolves to an AuthResult and never throws; the error is Spanish
 * (./errors) and keeps GoTrue's code for flow decisions. Sessions are shared
 * with the legacy /admin (same storage key, D-040).
 *
 * Usage:
 *   import { signInWithPassword, signInWithOAuth } from '#lib/auth/session.js';
 *   const res = await signInWithPassword(email, password);
 *   if (!res.ok) showError(res.error.message);
 *   await signInWithOAuth('google', { next });       // the page navigates away
 * ========================================================================== */

import type { AuthChangeEvent, EmailOtpType, Session } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '#lib/config.js';
import { supabase } from '#lib/db/client.js';
import { ok } from '#lib/repos/errors.js';
import type { AalLevel } from './access';
import { authFail, authInvalid, type AuthResult } from './errors';
import { ROUTES } from './routes';

export type AuthSession = Session;
export type AuthEvent = AuthChangeEvent;

/* ── Sign in ───────────────────────────────────────────────────────────── */

/** Email + password. On success the session store hears SIGNED_IN. */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const address = email.trim();
  if (!address || !password) return authInvalid('Escribe tu correo y tu contraseña.');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: address, password });
    if (error) return authFail('signInWithPassword', error);
    return ok(undefined);
  } catch (e) {
    return authFail('signInWithPassword', e);
  }
}

export const OAUTH_PROVIDERS = ['google', 'azure'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Where `next` waits while the browser is at the provider (one tab, one flow). */
export const OAUTH_NEXT_KEY = 'ird.admin.oauth-next';

/** The callback the provider returns to: the absolute URL of ROUTES.oauth. */
export function oauthRedirectUrl(origin: string = location.origin): string {
  return new URL(ROUTES.oauth, origin).href;
}

/**
 * Start Google or Microsoft sign-in: PKCE (the verifier stays in this
 * browser), one top-level redirect, no popup (D-035). `next` is kept in
 * sessionStorage for the callback, which must still pass it through
 * safeNext(). On success the page is already navigating away.
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  { next }: { next?: string | null } = {},
): Promise<AuthResult> {
  if (!(OAUTH_PROVIDERS as readonly string[]).includes(provider)) {
    return authInvalid('Ese método de acceso no está disponible.');
  }
  try {
    if (next) sessionStorage.setItem(OAUTH_NEXT_KEY, next);
    else sessionStorage.removeItem(OAUTH_NEXT_KEY);
  } catch {
    /* storage blocked: the callback lands on Inicio */
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthRedirectUrl(),
        // Entra puts the address in the ID token only when asked for it.
        ...(provider === 'azure' ? { scopes: 'email' } : {}),
      },
    });
    if (error) return authFail('signInWithOAuth', error);
    return ok(undefined);
  } catch (e) {
    return authFail('signInWithOAuth', e);
  }
}

/** The `next` signInWithOAuth kept, read once (null when none). Validate it with safeNext(). */
export function takeOAuthNext(): string | null {
  try {
    const next = sessionStorage.getItem(OAUTH_NEXT_KEY);
    sessionStorage.removeItem(OAUTH_NEXT_KEY);
    return next;
  } catch {
    return null;
  }
}

/**
 * The OAuth callback: trade `?code=` for a session. Call it before scrubbing
 * the URL. A missing verifier (`pkce_code_verifier_not_found`) means the flow
 * started in another browser or the storage was cleared.
 */
export async function exchangeCode(code: string): Promise<AuthResult> {
  if (!code || code.length > 512) {
    return authInvalid('El enlace de acceso no es válido. Vuelve a iniciar sesión.');
  }
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return authFail('exchangeCode', error);
    return ok(undefined);
  } catch (e) {
    return authFail('exchangeCode', e);
  }
}

/** The OTP types an email link can carry. */
export const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'invite',
  'recovery',
  'email',
  'signup',
  'magiclink',
  'email_change',
];
// GoTrue's hex token hash, `pkce_`-prefixed when a PKCE client asked for the email.
const TOKEN_HASH = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * Spend an email link's one-time `token_hash` (invite, recovery). Scanner-safe:
 * nothing is spent until this runs. Works in any browser — the hash is not
 * tied to the one that requested the email.
 */
export async function verifyOtp(tokenHash: string, type: string): Promise<AuthResult> {
  const otpType = EMAIL_OTP_TYPES.find((t) => t === type);
  if (!otpType || !TOKEN_HASH.test(tokenHash)) {
    return authInvalid('El enlace no es válido o está incompleto. Pide uno nuevo.');
  }
  try {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    if (error) return authFail('verifyOtp', error);
    return ok(undefined);
  } catch (e) {
    return authFail('verifyOtp', e);
  }
}

/* ── Account ───────────────────────────────────────────────────────────── */

/**
 * Send a password-recovery email. The answer never says whether the address
 * has an account — the screen keeps "Si la cuenta existe…" (PORT-DEBT S39).
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const address = email.trim();
  if (!address) return authInvalid('Escribe tu correo electrónico.');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: new URL(ROUTES.reset, location.origin).href,
    });
    if (error) return authFail('requestPasswordReset', error);
    return ok(undefined);
  } catch (e) {
    return authFail('requestPasswordReset', e);
  }
}

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt reads 72 bytes; GoTrue refuses anything longer. */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Set a new password. `current_password` is required by GoTrue when "Require
 * current password" is on (ASVS 6.2.3); an account that never had one (OAuth
 * only) sets its first after a fresh second-factor step (S45).
 */
export async function updatePassword({
  password,
  current_password,
}: {
  password: string;
  current_password?: string;
}): Promise<AuthResult> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return authInvalid('La contraseña debe tener al menos 8 caracteres.');
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return authInvalid('La contraseña es demasiado larga. Usa como máximo 72 caracteres.');
  }
  try {
    const { error } = await supabase.auth.updateUser(
      current_password ? { password, current_password } : { password },
    );
    if (error) return authFail('updatePassword', error);
    return ok(undefined);
  } catch (e) {
    return authFail('updatePassword', e);
  }
}

export type SignOutScope = 'local' | 'global' | 'others';

/**
 * End this device's session (`local`, the logout button), every session
 * (`global`) or every other one (`others`). auth-js removes the local
 * session even when the server could not be reached; the result says
 * whether the server heard it.
 */
export async function signOut(scope: SignOutScope): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) return authFail('signOut', error);
    return ok(undefined);
  } catch (e) {
    return authFail('signOut', e);
  }
}

/* ── Providers ─────────────────────────────────────────────────────────── */

const PROVIDERS_TIMEOUT_MS = 8000;

/**
 * The OAuth providers the project has switched on (`GET /auth/v1/settings`),
 * in button order. Any failure means none: the password form is always there.
 */
export async function fetchEnabledProviders(): Promise<OAuthProvider[]> {
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(PROVIDERS_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn('[auth] fetchEnabledProviders:', `HTTP ${res.status}`);
      return [];
    }
    const body: unknown = await res.json();
    const external =
      body && typeof body === 'object' ? (body as { external?: unknown }).external : null;
    if (!external || typeof external !== 'object') return [];
    return OAUTH_PROVIDERS.filter((p) => (external as Record<string, unknown>)[p] === true);
  } catch (e) {
    console.warn('[auth] fetchEnabledProviders:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

/* ── For the session store ─────────────────────────────────────────────── */

/**
 * The stored session (refreshed if its access token expired), or null. A
 * refresh that never reached the server is a `network` failure, not a
 * sign-out (the same rule as repos/session.ts).
 */
export async function getSession(): Promise<AuthResult<AuthSession | null>> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data.session) return ok(data.session);
    if (error) {
      const failure = authFail('getSession', error);
      if (failure.error.kind === 'network') return failure;
    }
    return ok(null);
  } catch (e) {
    return authFail('getSession', e);
  }
}

export type AalState = { current: AalLevel | null; next: AalLevel | null };

/** GoTrue's level names; anything else (a level this app does not know) reads as none. */
const asLevel = (value: unknown): AalLevel | null =>
  value === 'aal1' || value === 'aal2' ? value : null;

/** The session's assurance level now (`current`) and once its factors are used (`next`). */
export async function getAal(): Promise<AuthResult<AalState>> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return authFail('getAal', error);
    return ok({ current: asLevel(data.currentLevel), next: asLevel(data.nextLevel) });
  } catch (e) {
    return authFail('getAal', e);
  }
}

/**
 * Subscribe to auth events; returns the unsubscribe. The callback must stay
 * synchronous — auth-js runs it while holding its lock — and defer any
 * Supabase call (setTimeout), or the two deadlock.
 */
export function onAuthChange(
  callback: (event: AuthEvent, session: AuthSession | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

/**
 * Hand Realtime the new access token. supabase-js does it itself on
 * SIGNED_IN / TOKEN_REFRESHED, not after a second factor, so channels opened
 * next would still carry the aal1 token.
 */
export function setRealtimeAuth(accessToken: string): void {
  void supabase.realtime.setAuth(accessToken);
}

/** A full reload — when another account signed in elsewhere in this browser. */
export function reloadPage(): void {
  location.reload();
}
