/* ============================================================================
 * web/tests/unit/stores/session-mocks.ts — the session store's collaborators
 * ----------------------------------------------------------------------------
 * The store (S38) talks to Supabase only through #lib/auth/session, #lib/auth/mfa
 * and #lib/repos/profiles; these are their stand-ins, answering like the real
 * wrappers (AuthResult / ReadResult, never a throw). `emit()` plays an auth
 * event into every store instance subscribed since the last reset.
 *
 * Usage (top of a test file):
 *   import { h, happyPath, emit, freshSession } from './session-mocks';
 *   vi.mock('$app/env', () => ({ browser: true, dev: false, building: false, version: 'test' }));
 *   vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
 *   vi.mock('#lib/auth/session.js', () => import('./session-mocks').then((m) => m.authSessionMock));
 *   …
 * ========================================================================== */
import { vi } from 'vitest';

export const USER = 'u-1';

export const sessionFor = (id = USER, token = `token-${id}`) => ({
  access_token: token,
  user: { id, email: `${id}@example.org`, created_at: '2026-01-01T00:00:00Z' },
});

export const profileFor = (over: Record<string, unknown> = {}) => ({
  id: USER,
  display_name: 'Ana Pérez',
  role: 'admin',
  allowed_tabs: [] as string[],
  ministry_id: null,
  ministry_ids: [] as string[],
  preset_id: null,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  ministries: null,
  ...over,
});

const listeners: Array<(event: string, session: unknown) => void> = [];

export const h = {
  listeners,
  getSession: vi.fn(),
  getAal: vi.fn(),
  onAuthChange: vi.fn((callback: (event: string, session: unknown) => void) => {
    listeners.push(callback);
    return () => {};
  }),
  reloadPage: vi.fn(),
  setRealtimeAuth: vi.fn(),
  signOut: vi.fn(),
  listFactors: vi.fn(),
  fetchOwnProfile: vi.fn(),
  fetchMinistries: vi.fn(),
};

export const authSessionMock = {
  getSession: h.getSession,
  getAal: h.getAal,
  onAuthChange: h.onAuthChange,
  reloadPage: h.reloadPage,
  setRealtimeAuth: h.setRealtimeAuth,
  signOut: h.signOut,
};

export const ok = <T>(data: T) => ({ ok: true as const, data });
export const failure = (kind: string, code: string | null = null) => ({
  ok: false as const,
  error: { kind, message: `copy for ${kind}`, code },
});

/** Signed in at aal2 with an admin profile; every mock's history cleared. */
export function happyPath(): void {
  listeners.length = 0;
  for (const fn of Object.values(h)) if (typeof fn === 'function') fn.mockReset();
  h.onAuthChange.mockImplementation((callback) => {
    listeners.push(callback);
    return () => {};
  });
  h.getSession.mockResolvedValue(ok(sessionFor()));
  h.getAal.mockResolvedValue(ok({ current: 'aal2', next: 'aal2' }));
  h.listFactors.mockResolvedValue(ok([]));
  h.fetchOwnProfile.mockResolvedValue(ok(profileFor()));
  h.signOut.mockResolvedValue(ok(undefined));
  h.fetchMinistries.mockResolvedValue(ok([]));
}

/** Play an auth event into the subscribed store(s). */
export function emit(event: string, session: unknown = null): void {
  for (const listener of listeners) listener(event, session);
}

/** Let queued timers and the promises behind them settle. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((done) => setTimeout(done, 0));
}
