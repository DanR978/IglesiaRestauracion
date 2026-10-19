/* ============================================================================
 * web/src/lib/auth/mfa.ts — two-step verification with an authenticator app (S38)
 * ----------------------------------------------------------------------------
 * Port of js/pages/admin/mfa.js as fixed by DF-006 (fix/DF-006-mandatory-mfa):
 * MFA is required for every staff account (D-033), so a session reaches the
 * admin only at aal2, and the database refuses staff data until then (D-034).
 * The S39 verificar/ screen and S45 Mi cuenta drive it:
 *
 *   mfaStatus      'ok' (aal2) · 'challenge' (a verified factor) · 'enroll'
 *                  (none) — from the factor list fetched fresh from the server
 *                  (the cached session predates a factor enrolled elsewhere)
 *   beginEnroll    a TOTP factor with a unique name (GoTrue refuses a second
 *                  factor with the same name); half-finished ones are cleared
 *                  first. `replace` removes the current factors only after the
 *                  new one is verified — the account is never left without one
 *   beginChallenge every verified TOTP factor: a code from ANY of them counts
 *   submitCode     verifies, removes replaced factors (clearing its own state
 *                  first, so a cancel racing it never removes the old ones),
 *                  then hands Realtime the aal2 token
 *   cancelEnroll   removes the new factor only while the server still lists
 *                  it unverified — a verify that landed made it the account's
 *   removeFactor   Mi cuenta: never the last verified factor
 *
 * One flow at a time (module state, like the legacy module). Every call
 * resolves to an AuthResult and never throws.
 *
 * Usage (a step is prepared before its code is submitted):
 *   import { beginChallenge, submitCode } from '#lib/auth/mfa.js';
 *   const ready = await beginChallenge();         // ok(false): enroll instead
 *   const res = await submitCode(code);           // res.data.leftover: ids not removed
 * ========================================================================== */

import type { Factor } from '@supabase/supabase-js';
import { supabase } from '#lib/db/client.js';
import { ok } from '#lib/repos/errors.js';
import { authFail, authInvalid, toAuthError, type AuthResult } from './errors';

export type { Factor };
export type MfaStatus = 'ok' | 'challenge' | 'enroll';

export interface TotpEnrollment {
  factorId: string;
  /** An SVG data URL to show as the QR image. */
  qrCode: string;
  /** The same secret as text, for apps that cannot scan. */
  secret: string;
  /** The otpauth:// URI. */
  uri: string;
}

const CODE = /^\d{6}$/;
const UNENROLL_RETRY_MS = 1000;

let mode: 'enroll' | 'challenge' | null = null;
let enrollingId: string | null = null;
let challengeIds: string[] = [];
let replaceIds: string[] = [];

function reset(): void {
  mode = null;
  enrollingId = null;
  challengeIds = [];
  replaceIds = [];
}

type FactorLists = { all: Factor[]; totp: Factor[] };

async function fetchFactors(fn: string): Promise<AuthResult<FactorLists>> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return authFail(fn, error);
    return ok({ all: data.all, totp: data.totp });
  } catch (e) {
    return authFail(fn, e);
  }
}

/** Every factor of the account (verified and not), fresh from the server. */
export async function listFactors(): Promise<AuthResult<Factor[]>> {
  const res = await fetchFactors('listFactors');
  return res.ok ? ok(res.data.all) : res;
}

/** What the session needs before the admin opens (legacy mfaStatus). */
export async function mfaStatus(): Promise<AuthResult<MfaStatus>> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return authFail('mfaStatus', error);
    if (data.currentLevel === 'aal2') return ok('ok');
  } catch (e) {
    return authFail('mfaStatus', e);
  }
  const factors = await fetchFactors('mfaStatus');
  if (!factors.ok) return factors;
  // Any verified factor (not only TOTP) means the account must prove it first.
  return ok(factors.data.all.some((f) => f.status === 'verified') ? 'challenge' : 'enroll');
}

// GoTrue refuses a second factor with the same friendly name for one user.
function friendlyName(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return `IRD ${stamp} ${Math.random().toString(36).slice(2, 6)}`;
}

async function unenroll(factorId: string): Promise<unknown> {
  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    return error;
  } catch (e) {
    return e;
  }
}

/**
 * Start enrolling a TOTP factor. With `replace`, the account's current
 * verified TOTP factors are removed once the new one is verified (S45 "add
 * device" leaves them). An `insufficient_aal` failure means a verified factor
 * already exists: prove it with beginChallenge() first.
 */
export async function beginEnroll({ replace = false }: { replace?: boolean } = {}): Promise<
  AuthResult<TotpEnrollment>
> {
  reset();
  const factors = await fetchFactors('beginEnroll');
  if (!factors.ok) return factors;
  for (const f of factors.data.all.filter((x) => x.status === 'unverified')) {
    await unenroll(f.id); // best effort: a leftover only blocks its own name
  }
  try {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyName(),
    });
    if (error) return authFail('beginEnroll', error);
    mode = 'enroll';
    enrollingId = data.id;
    replaceIds = replace ? factors.data.totp.map((f) => f.id) : [];
    return ok({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  } catch (e) {
    return authFail('beginEnroll', e);
  }
}

/** Prepare a challenge with every verified TOTP factor; ok(false) when there is none. */
export async function beginChallenge(): Promise<AuthResult<boolean>> {
  reset();
  mode = 'challenge'; // kept when the list fails: submitCode prepares it again
  const factors = await fetchFactors('beginChallenge');
  if (!factors.ok) return factors;
  challengeIds = factors.data.totp.map((f) => f.id);
  if (!challengeIds.length) mode = null;
  return ok(challengeIds.length > 0);
}

// Ends the aal1 token's life in Realtime: channels opened next carry aal2.
async function syncRealtimeAuth(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) void supabase.realtime.setAuth(data.session.access_token);
  } catch {
    /* the store re-syncs on MFA_CHALLENGE_VERIFIED */
  }
}

const gone = (error: unknown): boolean =>
  !error || (error as { code?: unknown }).code === 'mfa_factor_not_found';

/** Remove replaced factors; one retry each for a dropped request. Returns the ones left. */
async function removeReplaced(ids: string[]): Promise<string[]> {
  const leftover: string[] = [];
  for (const factorId of ids) {
    let error = await unenroll(factorId);
    if (!gone(error)) {
      await new Promise((settle) => setTimeout(settle, UNENROLL_RETRY_MS));
      error = await unenroll(factorId);
    }
    if (!gone(error)) {
      console.warn('[auth] submitCode: replaced factor kept:', toAuthError(error).detail ?? '');
      leftover.push(factorId);
    }
  }
  return leftover;
}

/**
 * Check the 6-digit code for the step in progress. `leftover` lists replaced
 * factors that could not be removed — they still grant aal2, so the screen
 * must say so. On success the session is aal2.
 */
export async function submitCode(code: string): Promise<AuthResult<{ leftover: string[] }>> {
  const clean = code.trim();
  if (!CODE.test(clean)) return authInvalid('Escribe el código de 6 dígitos.');

  // Preparing the challenge failed earlier (e.g. a dropped request): prepare it now.
  if (mode === 'challenge' && !challengeIds.length) {
    const prepared = await beginChallenge();
    if (!prepared.ok) return prepared;
  }

  if (mode === 'enroll' && enrollingId) {
    const factorId = enrollingId;
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
      if (error) return authFail('submitCode', error);
    } catch (e) {
      return authFail('submitCode', e);
    }
    // Read and clear in one step: a cancel that ran meanwhile already emptied
    // the list (the old factors stay), and a later cancel finds nothing to remove.
    const replaced = replaceIds.filter((id) => id !== factorId);
    reset();
    const leftover = await removeReplaced(replaced);
    await syncRealtimeAuth();
    return ok({ leftover });
  }

  if (mode === 'challenge' && challengeIds.length) {
    let lastError: unknown = null;
    for (const factorId of challengeIds) {
      try {
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
        if (!error) {
          reset();
          await syncRealtimeAuth();
          return ok({ leftover: [] });
        }
        lastError = error;
        if (error.code !== 'mfa_verification_failed') break; // rate limit, network… stop here
      } catch (e) {
        lastError = e;
        break;
      }
    }
    return authFail('submitCode', lastError);
  }

  return authFail('submitCode', { code: 'mfa_step_not_ready', message: 'no MFA step is ready' });
}

/** Abandon an enrollment in progress; the old factors always stay. */
export async function cancelEnroll(): Promise<AuthResult> {
  const pending = mode === 'enroll' ? enrollingId : null;
  reset(); // before any request: a verify still in flight must not remove the old factors
  if (!pending) return ok(undefined);
  const factors = await fetchFactors('cancelEnroll');
  if (!factors.ok) return factors;
  // Only a factor the server still lists as unverified may go: if the verify
  // already landed, this factor is now the account's (possibly only) one.
  if (factors.data.all.find((f) => f.id === pending)?.status === 'unverified') {
    const error = await unenroll(pending);
    if (!gone(error)) return authFail('cancelEnroll', error);
  }
  return ok(undefined);
}

/**
 * Remove one factor (Mi cuenta, behind a fresh second-factor step: GoTrue
 * needs aal2). Never the last verified one — the account must keep a way to
 * pass the gate.
 */
export async function removeFactor(factorId: string): Promise<AuthResult> {
  const factors = await fetchFactors('removeFactor');
  if (!factors.ok) return factors;
  const target = factors.data.all.find((f) => f.id === factorId);
  if (!target) return authFail('removeFactor', { code: 'mfa_factor_not_found', message: factorId });
  const verified = factors.data.all.filter((f) => f.status === 'verified');
  if (target.status === 'verified' && verified.length < 2) {
    return authInvalid('Debes conservar al menos un dispositivo de verificación.');
  }
  const error = await unenroll(factorId);
  return gone(error) ? ok(undefined) : authFail('removeFactor', error);
}
