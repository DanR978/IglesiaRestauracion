// js/pages/admin/mfa.js
// Two-factor authentication (TOTP) via Supabase Auth — enrollment + verification.
//
// MFA is REQUIRED for every staff account (D-033): auth.js routes every
// successful credential step through `mfaStatus()` and opens the panel only at
// AAL2. Client gating is UX; the database enforces aal2 only once the
// fix/authz-hardening migration is applied.

import { sb } from './state.js';

let _factorId         = null;   // the TOTP factor being enrolled
let _challengeIds     = [];     // verified TOTP factors a challenge code may match
let _replaceFactorIds = [];     // factors to remove once their replacement is verified
let _mode             = null;   // 'enroll' | 'challenge' — the step on screen

function reset() {
  _factorId = null; _challengeIds = []; _replaceFactorIds = []; _mode = null;
}

/**
 * What does the current session need before it can reach the panel?
 *   'ok'        — already at AAL2 (MFA satisfied)
 *   'challenge' — a verified factor exists; the user must enter a code
 *   'enroll'    — no factor yet; the user must set one up
 * The factor list comes from the server (listFactors fetches the user): the
 * cached session predates factors enrolled in another tab or device.
 */
export async function mfaStatus() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.currentLevel === 'aal2') return 'ok';
  const { data: list, error: listErr } = await sb.auth.mfa.listFactors();
  if (listErr) throw listErr;
  // Any verified factor (not only TOTP) means the account must prove it first.
  return (list?.all ?? []).some(f => f.status === 'verified') ? 'challenge' : 'enroll';
}

// GoTrue rejects a second factor with the same friendly name for one user.
function friendlyName() {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return `IRD ${stamp} ${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Start TOTP enrollment. Clears half-finished (unverified) factors first so a
 * retry always works. With `{ replace: true }` the account's current verified
 * factors are removed only after the new one is verified, so the account is
 * never left without 2FA.
 * @returns {Promise<{qr: string, secret: string}>}
 */
export async function beginEnroll({ replace = false } = {}) {
  reset();
  _mode = 'enroll';
  const { data: list, error: listErr } = await sb.auth.mfa.listFactors();
  if (listErr) throw listErr;
  for (const f of (list?.all ?? []).filter(f => f.status === 'unverified')) {
    try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch { /* best effort */ }
  }
  const replaceIds = replace ? (list?.totp ?? []).map(f => f.id) : [];

  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: friendlyName() });
  if (error) throw error;

  _factorId         = data.id;
  _replaceFactorIds = replaceIds;
  return { qr: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Prepare a challenge for a returning user. A code from ANY of the account's
 * verified TOTP factors is accepted (a second device must work too).
 * @returns {Promise<boolean>} false if there is no verified factor (caller
 *          should fall back to enrollment).
 */
export async function beginChallenge() {
  reset();
  _mode = 'challenge';
  const { data: list, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;
  _challengeIds = (list?.totp ?? []).map(f => f.id);
  if (!_challengeIds.length) _mode = 'enroll';
  return _challengeIds.length > 0;
}

// supabase-js re-authenticates realtime on SIGNED_IN / TOKEN_REFRESHED but not
// on MFA_CHALLENGE_VERIFIED, so channels opened next would carry the AAL1 token.
async function syncRealtimeAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.access_token) sb.realtime.setAuth(session.access_token);
}

/**
 * Submit the 6-digit code. On success the session is upgraded to AAL2.
 * Enrollment verifies the new factor, then removes the factors it replaces.
 * A challenge tries each verified factor until one accepts the code.
 * @returns {Promise<string[]>} replaced factors that could not be removed —
 *          they still grant AAL2, so the caller must say so.
 */
export async function submitCode(code) {
  const clean = String(code).trim();
  const leftover = [];

  // Preparing the challenge failed (e.g. a dropped request): prepare it now.
  if (_mode === 'challenge' && !_challengeIds.length) await beginChallenge();

  if (_mode === 'enroll' && _factorId) {
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: _factorId, code: clean });
    if (error) throw error;
    // Read and clear in one step: a cancel that ran meanwhile already emptied the
    // list (the old factors stay), and a later cancel finds nothing to remove.
    const replaced = _replaceFactorIds.filter(id => id !== _factorId);
    reset();
    const gone = (e) => !e || e.code === 'mfa_factor_not_found';
    for (const factorId of replaced) {
      let { error: unErr } = await sb.auth.mfa.unenroll({ factorId });
      if (!gone(unErr)) {                                     // one retry for a dropped request
        await new Promise(r => setTimeout(r, 1000));
        ({ error: unErr } = await sb.auth.mfa.unenroll({ factorId }));
      }
      if (!gone(unErr)) {
        console.warn('[mfa] unenroll replaced factor:', unErr.message);
        leftover.push(factorId);
      }
    }
  } else if (_mode === 'challenge' && _challengeIds.length) {
    let lastErr = null;
    let verified = false;
    for (const factorId of _challengeIds) {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: clean });
      if (!error) { verified = true; break; }
      lastErr = error;
      if (error.code !== 'mfa_verification_failed') break;   // rate limit, network… stop here
    }
    if (!verified) throw lastErr;
    reset();
  } else {
    throw Object.assign(new Error('No MFA step is ready'), { code: 'mfa_step_not_ready' });
  }

  await syncRealtimeAuth();
  return leftover;
}

/** Abandon an enrollment in progress (removes the factor that was never verified). */
export async function cancelEnroll() {
  const pending = _mode === 'enroll' ? _factorId : null;
  reset();   // before the request: a verify still in flight must not remove the old factors
  if (!pending) return;
  // Only a factor the server still lists as unverified may go: if the verify
  // already landed, this factor is now the account's (possibly only) one.
  const { data: list } = await sb.auth.mfa.listFactors();
  const f = (list?.all ?? []).find(x => x.id === pending);
  if (f?.status === 'unverified') {
    try { await sb.auth.mfa.unenroll({ factorId: pending }); } catch { /* best effort */ }
  }
}
