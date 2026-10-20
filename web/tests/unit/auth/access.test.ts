// S38 — resolveAccess(): the one answer to "may this session open the admin?"
// (D-033 MFA mandatory, D-006 fail closed). Replaces legacy auth.js
// routeAfterLogin → mfa.mfaStatus → bootApp's profile check. Every branch.
import { describe, expect, it } from 'vitest';
import { resolveAccess, type AccessInput } from '#lib/auth/access.js';
import type { RepoErrorKind } from '#lib/repos/types.js';

const SESSION = { user: { id: 'u1' } };
const ADMIN = { role: 'admin', allowed_tabs: [] };
const AAL1 = { current: 'aal1', next: 'aal1' } as const;
const AAL1_FACTOR = { current: 'aal1', next: 'aal2' } as const;
const AAL2 = { current: 'aal2', next: 'aal2' } as const;
const VERIFIED = [{ status: 'verified' }];
const UNVERIFIED = [{ status: 'unverified' }];

const input = (over: Partial<AccessInput> = {}): AccessInput => ({
  session: SESSION,
  aal: AAL2,
  factors: null,
  profile: ADMIN,
  profileError: null,
  ...over,
});
const repoError = (kind: RepoErrorKind) => ({ kind, message: 'x' });

describe('resolveAccess', () => {
  it('a staff profile in an aal2 session is ready', () => {
    expect(resolveAccess(input())).toBe('ready');
    for (const role of ['treasurer', 'ministry_leader']) {
      expect(resolveAccess(input({ profile: { role, allowed_tabs: [] } }))).toBe('ready');
    }
  });

  it('no session is signed out, whatever else is known', () => {
    expect(resolveAccess(input({ session: null }))).toBe('signed-out');
    expect(resolveAccess(input({ session: null, profileError: repoError('network') }))).toBe(
      'signed-out',
    );
  });

  describe('D-033: the second factor is mandatory', () => {
    it('aal1 with a verified factor must pass the challenge', () => {
      expect(resolveAccess(input({ aal: AAL1, factors: VERIFIED }))).toBe('needs-mfa');
    });

    it('any verified factor counts, not only TOTP', () => {
      const phone = [{ status: 'verified', factor_type: 'phone' }];
      expect(resolveAccess(input({ aal: AAL1, factors: phone }))).toBe('needs-mfa');
    });

    it('aal1 with no factor, or only an unverified one, must enroll', () => {
      expect(resolveAccess(input({ aal: AAL1, factors: [] }))).toBe('needs-enroll');
      expect(resolveAccess(input({ aal: AAL1, factors: UNVERIFIED }))).toBe('needs-enroll');
    });

    it('the fresh factor list beats the cached `next` level (factor removed elsewhere)', () => {
      expect(resolveAccess(input({ aal: AAL1_FACTOR, factors: [] }))).toBe('needs-enroll');
      expect(resolveAccess(input({ aal: AAL1, factors: VERIFIED }))).toBe('needs-mfa');
    });

    it('without the list, a cached next=aal2 still means challenge; otherwise it cannot tell', () => {
      expect(resolveAccess(input({ aal: AAL1_FACTOR, factors: null }))).toBe('needs-mfa');
      expect(resolveAccess(input({ aal: AAL1, factors: null }))).toBe('error');
    });

    it('a session without an aal claim is not two-step verified', () => {
      expect(resolveAccess(input({ aal: { current: null, next: null }, factors: [] }))).toBe(
        'needs-enroll',
      );
    });

    it('an unreadable assurance level is an error, never ready', () => {
      expect(resolveAccess(input({ aal: null }))).toBe('error');
    });
  });

  describe('D-006: fail closed', () => {
    it('no profile is forbidden', () => {
      expect(resolveAccess(input({ profile: null }))).toBe('forbidden');
    });

    it.each(['pastor', 'Admin', '', 'service_role', null])('role %j is forbidden', (role) => {
      expect(resolveAccess(input({ profile: { role, allowed_tabs: ['users'] } }))).toBe(
        'forbidden',
      );
    });

    it('an account without access is told so before being asked to enroll a device', () => {
      expect(resolveAccess(input({ profile: null, aal: AAL1, factors: [] }))).toBe('forbidden');
    });
  });

  describe('the profile read failed', () => {
    it('in transit (network, unknown…) it is an error — never a sign-out', () => {
      for (const kind of ['network', 'unknown', 'conflict', 'invalid'] as const) {
        expect(resolveAccess(input({ profile: null, profileError: repoError(kind) }))).toBe(
          'error',
        );
      }
    });

    it('the server no longer accepts the session: signed out', () => {
      expect(resolveAccess(input({ profile: null, profileError: repoError('auth') }))).toBe(
        'signed-out',
      );
    });

    it('refused: forbidden', () => {
      for (const kind of ['forbidden', 'not_found'] as const) {
        expect(resolveAccess(input({ profile: null, profileError: repoError(kind) }))).toBe(
          'forbidden',
        );
      }
    });

    it('a profile error wins over a profile value left from before', () => {
      expect(resolveAccess(input({ profileError: repoError('network') }))).toBe('error');
    });
  });
});
