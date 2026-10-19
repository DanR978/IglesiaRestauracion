/* ============================================================================
 * web/tests/component/acceso/mocks.ts — the acceso pages' collaborators (S39)
 * ----------------------------------------------------------------------------
 * The sign-in pages reach Supabase only through #lib/auth/session, #lib/auth/mfa
 * and the session store; these stand-ins answer like them (AuthResult, never a
 * throw), with the happy path as the default. The store is a plain object a
 * test sets up before mounting a page — and moves on from with a settled()
 * implementation, as the real store does after a sign-in or a code.
 *
 * Usage (top of a test file):
 *   vi.mock('#lib/auth/session.js', () => import('./mocks').then((m) => m.auth));
 *   vi.mock('#lib/auth/mfa.js', () => import('./mocks').then((m) => m.mfa));
 *   vi.mock('#lib/auth/next.js', () => import('./mocks').then((m) => m.next));
 *   vi.mock('#lib/stores/session.svelte.js', () => import('./mocks').then((m) => ({ session: m.store })));
 *   vi.mock('#lib/stores/toast.svelte.js', () => import('./mocks').then((m) => ({ toast: m.toast })));
 *   vi.mock('#lib/components/admin/shell/sign-out.svelte.js', () => import('./mocks').then((m) => m.shell));
 *   vi.mock('$app/navigation', () => import('./mocks').then((m) => m.nav));
 *   import { auth, store, nav, resetMocks, openAt } from './mocks';
 *   beforeEach(resetMocks);
 * ========================================================================== */
import { vi } from 'vitest';

type Status =
  | 'loading'
  | 'signed-out'
  | 'expired'
  | 'error'
  | 'forbidden'
  | 'needs-enroll'
  | 'needs-mfa'
  | 'ready';

export const ok = <T>(data: T) => ({ ok: true as const, data });
export const failure = (kind: string, message: string, code: string | null = null) => ({
  ok: false as const,
  error: { kind, message, code },
});

export const ENROLLMENT = {
  factorId: 'f-new',
  qrCode: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',
  secret: 'JBSWY3DPEHPK3PXP',
  uri: 'otpauth://totp/IRD:ana@example.org?secret=JBSWY3DPEHPK3PXP',
};

export const auth = {
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  fetchEnabledProviders: vi.fn(),
  exchangeCode: vi.fn(),
  takeOAuthNext: vi.fn(),
  verifyOtp: vi.fn(),
  updatePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
};

export const mfa = {
  beginChallenge: vi.fn(),
  beginEnroll: vi.fn(),
  submitCode: vi.fn(),
  cancelEnroll: vi.fn(),
  listFactors: vi.fn(),
};

export const next = { safeNext: vi.fn() };
export const nav = { goto: vi.fn() };
export const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
/** The shell's deliberate sign-out (S37): signs out, then reloads into the sign-in page. */
export const shell = { signOutAndLeave: vi.fn() };

export const store = {
  status: 'signed-out' as Status,
  user: null as { email?: string } | null,
  error: null as { kind: string; message: string } | null,
  ready: vi.fn(),
  settled: vi.fn(),
  retry: vi.fn(),
  signOut: vi.fn(),
};

/** The happy path: nothing signed in, every call succeeding, no providers. */
export function resetMocks(): void {
  for (const group of [auth, mfa, next, nav, toast, shell]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  shell.signOutAndLeave.mockResolvedValue(undefined);
  for (const fn of [store.ready, store.settled, store.retry, store.signOut]) fn.mockReset();
  store.status = 'signed-out';
  store.user = null;
  store.error = null;
  store.ready.mockResolvedValue(undefined);
  store.settled.mockResolvedValue(undefined);
  store.retry.mockResolvedValue(undefined);
  store.signOut.mockImplementation(async () => {
    store.status = 'signed-out';
    store.user = null;
    return ok(undefined);
  });

  auth.signInWithPassword.mockResolvedValue(ok(undefined));
  auth.signInWithOAuth.mockResolvedValue(ok(undefined));
  auth.fetchEnabledProviders.mockResolvedValue([]);
  auth.exchangeCode.mockResolvedValue(ok(undefined));
  auth.takeOAuthNext.mockReturnValue(null);
  auth.verifyOtp.mockResolvedValue(ok(undefined));
  auth.updatePassword.mockResolvedValue(ok(undefined));
  auth.requestPasswordReset.mockResolvedValue(ok(undefined));

  mfa.beginChallenge.mockResolvedValue(ok(true));
  mfa.beginEnroll.mockResolvedValue(ok(ENROLLMENT));
  mfa.submitCode.mockResolvedValue(ok({ leftover: [] }));
  mfa.cancelEnroll.mockResolvedValue(ok(undefined));
  mfa.listFactors.mockResolvedValue(ok([]));

  // safeNext's real rule needs the router; here any admin path is accepted.
  next.safeNext.mockImplementation(async (raw: unknown) =>
    typeof raw === 'string' && raw.startsWith('/admin/') ? raw : '/admin/',
  );
  nav.goto.mockResolvedValue(undefined);
}

/** The status the store reports once the next settled() resolves (a sign-in, a code). */
export function settlesTo(status: Status, user: { email?: string } | null = null): void {
  store.settled.mockImplementation(async () => {
    store.status = status;
    if (user) store.user = user;
  });
}

/** Put the address bar where a page is opened. */
export function openAt(href: string): void {
  history.replaceState(null, '', href);
}

/** The path the last navigation went to, if any. */
export function lastGoto(): unknown {
  return nav.goto.mock.calls.at(-1)?.[0];
}
