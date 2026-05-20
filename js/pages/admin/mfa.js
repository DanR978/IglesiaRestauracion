// js/pages/admin/mfa.js
// Two-factor authentication (TOTP) via Supabase Auth — enrollment + verification.
// All admin accounts must complete MFA before the panel loads (enforced in auth.js).

import { sb } from './state.js';

let _factorId    = null;   // the TOTP factor currently being enrolled / challenged
let _challengeId = null;   // the active challenge id
let _mode        = null;   // 'enroll' | 'challenge'

/**
 * What does the current session need before it can reach the panel?
 *   'ok'        — already at AAL2 (MFA satisfied)
 *   'challenge' — a verified factor exists; the user must enter a code
 *   'enroll'    — no factor yet; the user must set one up
 */
export async function mfaStatus() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.currentLevel === 'aal2') return 'ok';
  if (data.nextLevel === 'aal2')    return 'challenge';
  return 'enroll';
}

/**
 * Start TOTP enrollment. Clears any half-finished factors first so a retry
 * (e.g. the user reloaded mid-enrollment) always works.
 * @returns {Promise<{qr: string, secret: string}>}
 */
export async function beginEnroll() {
  const { data: list } = await sb.auth.mfa.listFactors();
  const stale = (list?.all ?? []).filter(f => f.status === 'unverified');
  for (const f of stale) {
    try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch { /* ignore */ }
  }

  const { data, error } = await sb.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `IRD ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw error;

  _factorId    = data.id;
  _challengeId = null;
  _mode        = 'enroll';
  return { qr: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Start a challenge for a returning user who already has a verified factor.
 * @returns {Promise<boolean>} false if there is no verified factor (caller
 *          should fall back to enrollment).
 */
export async function beginChallenge() {
  const { data: list, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;

  const totp = (list?.totp ?? [])[0];
  if (!totp) { _mode = 'enroll'; return false; }

  _factorId = totp.id;
  const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: _factorId });
  if (chErr) throw chErr;

  _challengeId = ch.id;
  _mode        = 'challenge';
  return true;
}

/**
 * Submit the 6-digit code. On success the session is upgraded to AAL2.
 * Works for both enrollment and challenge flows.
 */
export async function submitCode(code) {
  if (!_factorId) throw new Error('No hay una verificación en curso.');

  // A fresh challenge is always created right before verifying so the code
  // window never expires between rendering the screen and the user typing.
  const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: _factorId });
  if (chErr) throw chErr;
  _challengeId = ch.id;

  const { error } = await sb.auth.mfa.verify({
    factorId:    _factorId,
    challengeId: _challengeId,
    code:        String(code).trim(),
  });
  if (error) throw error;

  _factorId = _challengeId = _mode = null;
  return true;
}

/** Remove every MFA factor on the account — used before re-enrolling. */
export async function unenrollAll() {
  const { data } = await sb.auth.mfa.listFactors();
  for (const f of (data?.all ?? [])) {
    try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch { /* ignore */ }
  }
  _factorId = _challengeId = _mode = null;
}
