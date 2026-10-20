/* ============================================================================
 * web/src/lib/auth/access.ts — may this session open the admin? (S38 · D-033)
 * ----------------------------------------------------------------------------
 * Pure: the session store gathers the inputs, this decides, and the guard,
 * the sign-in screens and the shell all read the same answer. Replaces the
 * legacy gate spread over js/pages/admin/auth.js (routeAfterLogin →
 * mfa.mfaStatus → bootApp's "no profile = misconfigured account" check).
 *
 *   signed-out    no session, or the server no longer accepts it
 *   error         a read failed in transit — offer Retry; never a sign-out
 *   forbidden     no profile, or a role outside the three staff roles
 *   needs-enroll  kept for the routes that handle it; resolveAccess no longer
 *                 returns it — setting up a second factor is optional (D-033,
 *                 amended 2026-10-20), offered from Mi cuenta
 *   needs-mfa     a verified factor exists and this session is still aal1
 *   ready         a staff profile, in an aal2 session or on an account with no
 *                 verified second factor
 *
 * Order: who you are (session, profile) before how you proved it (aal), so an
 * account without access is told so instead of being asked to enroll a
 * device it could never use. The factor list read fresh from the server
 * (listFactors) decides challenge vs enroll; the session's cached `next`
 * level only stands in when that list could not be read.
 *
 * UX only — RLS and the aal2 layer are the guard (D-002, D-034).
 *
 * Usage:
 *   import { resolveAccess } from '#lib/auth/access.js';
 *   const state = resolveAccess({ session, aal, factors, profile, profileError });
 * ========================================================================== */

import type { RepoError } from '#lib/repos/types.js';
import { isStaffRole } from '#lib/roles.js';
import type { AccessProfile } from './surfaces';

export type AccessState =
  'signed-out' | 'error' | 'forbidden' | 'needs-enroll' | 'needs-mfa' | 'ready';

export type AalLevel = 'aal1' | 'aal2';

export interface AccessInput {
  /** The current session, or null when there is none. */
  session: { user: { id: string } } | null;
  /** From getAuthenticatorAssuranceLevel(); null when it could not be read. */
  aal: { current: AalLevel | null; next: AalLevel | null } | null;
  /** The account's factors fresh from the server; null when not read (or not needed at aal2). */
  factors: ReadonlyArray<{ status: string }> | null;
  /** The account's profile; null when it has none (or the read failed — see profileError). */
  profile: AccessProfile | null;
  profileError: RepoError | null;
}

export function resolveAccess({
  session,
  aal,
  factors,
  profile,
  profileError,
}: AccessInput): AccessState {
  if (!session) return 'signed-out';

  if (profileError) {
    if (profileError.kind === 'auth') return 'signed-out';
    if (profileError.kind === 'forbidden' || profileError.kind === 'not_found') return 'forbidden';
    return 'error';
  }
  if (!profile || !isStaffRole(profile.role)) return 'forbidden';

  if (!aal) return 'error';
  if (aal.current === 'aal2') return 'ready';

  if (factors) return factors.some((f) => f.status === 'verified') ? 'needs-mfa' : 'ready';
  if (aal.next === 'aal2') return 'needs-mfa';
  return aal.next === 'aal1' ? 'ready' : 'error';
}
