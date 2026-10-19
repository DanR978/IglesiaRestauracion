/* ============================================================================
 * web/tests/unit/auth/auth-client.ts — stand-in for `#lib/db/client.js` (auth)
 * ----------------------------------------------------------------------------
 * The auth-js surface #lib/auth/* calls, as vi.fn()s that answer like
 * auth-js 2.112: `{ data, error }`, never a throw. Defaults are the happy
 * path (signed in at aal2, one verified TOTP factor); a test overrides one
 * answer with mockResolvedValueOnce. Asserts call shapes and result mapping,
 * never GoTrue behaviour (that is the local-stack suite's job, D-039).
 *
 * Usage (top of a test file, before importing the module under test):
 *   vi.mock('#lib/db/client.js', () => import('./auth-client'));
 *   import { auth, resetAuthClient } from './auth-client';
 *   beforeEach(resetAuthClient);
 * ========================================================================== */
import { vi } from 'vitest';

export const USER_ID = '00000000-0000-4000-8000-0000000000aa';

export const authError = (code: string | undefined, status = 400, message = code ?? 'x') =>
  Object.assign(new Error(message), { name: 'AuthApiError', code, status, __isAuthError: true });

export const factor = (id: string, status: 'verified' | 'unverified', type = 'totp') => ({
  id,
  status,
  factor_type: type,
  friendly_name: `IRD ${id}`,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});

export const session = (accessToken = 'token-aal2') => ({
  access_token: accessToken,
  refresh_token: 'refresh',
  expires_in: 900,
  token_type: 'bearer',
  user: { id: USER_ID, email: 'ana@example.org' },
});

function factorLists(all: ReturnType<typeof factor>[]) {
  const verified = all.filter((f) => f.status === 'verified');
  return {
    all,
    totp: verified.filter((f) => f.factor_type === 'totp'),
    phone: verified.filter((f) => f.factor_type === 'phone'),
    webauthn: [],
  };
}

export const listFactorsAnswer = (all: ReturnType<typeof factor>[]) => ({
  data: factorLists(all),
  error: null,
});

const unsubscribe = vi.fn();

export const auth = {
  signInWithPassword: vi.fn(async () => ({ data: { session: session() }, error: null as unknown })),
  signInWithOAuth: vi.fn(async () => ({
    data: { url: 'https://idp.test/' },
    error: null as unknown,
  })),
  exchangeCodeForSession: vi.fn(async () => ({
    data: { session: session() },
    error: null as unknown,
  })),
  verifyOtp: vi.fn(async () => ({ data: { session: session() }, error: null as unknown })),
  resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as unknown })),
  updateUser: vi.fn(async () => ({ data: { user: session().user }, error: null as unknown })),
  signOut: vi.fn(async () => ({ error: null as unknown })),
  getSession: vi.fn(async () => ({
    data: { session: session() as ReturnType<typeof session> | null },
    error: null as unknown,
  })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(async () => ({
      data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
      error: null as unknown,
    })),
    listFactors: vi.fn(async () => listFactorsAnswer([factor('f-1', 'verified')])),
    enroll: vi.fn(async () => ({
      data: {
        id: 'f-new',
        type: 'totp',
        friendly_name: 'IRD new',
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET', uri: 'otpauth://x' },
      },
      error: null as unknown,
    })),
    challengeAndVerify: vi.fn(async () => ({ data: {}, error: null as unknown })),
    unenroll: vi.fn(async () => ({ data: {}, error: null as unknown })),
  },
};

export const realtime = { setAuth: vi.fn(async () => {}) };

export const supabase = { auth, realtime };

/** Back to the happy path: every call record and queued answer cleared (vi.fn defaults kept). */
export function resetAuthClient(): void {
  for (const fn of [
    ...Object.values(auth).filter((v) => typeof v === 'function'),
    ...Object.values(auth.mfa),
    realtime.setAuth,
    unsubscribe,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockReset();
  }
}

export { unsubscribe };
