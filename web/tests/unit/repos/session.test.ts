// requireSession: a staff-only repo call with no live session is an `auth`
// failure, never an empty success; a refresh that never got an answer is
// `network`, not a sign-out.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));
import { mock, supabase } from './mock-client';
import { requireSession } from '#lib/repos/session.js';

describe('requireSession', () => {
  beforeEach(() => {
    mock.reset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('lets a signed-in call through', async () => {
    expect(await requireSession('[t]', 'fn')).toBeNull();
  });

  it('turns a missing session into an auth failure with Spanish copy', async () => {
    mock.session = { data: { session: null }, error: null };
    const denied = await requireSession('[t]', 'fn');
    expect(denied).toEqual({
      ok: false,
      error: {
        kind: 'auth',
        message: 'Tu sesión expiró. Inicia sesión de nuevo para continuar.',
        detail: 'no signed-in session',
      },
    });
  });

  it('treats a refused refresh as signed out', async () => {
    mock.session = {
      data: { session: null },
      error: { name: 'AuthApiError', message: 'Invalid Refresh Token', status: 400 },
    };
    expect((await requireSession('[t]', 'fn'))?.error.kind).toBe('auth');
  });

  it('keeps a refresh that never reached the server a network failure', async () => {
    mock.session = {
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 },
    };
    expect((await requireSession('[t]', 'fn'))?.error.kind).toBe('network');
  });

  it('never throws when reading the session does', async () => {
    supabase.auth.getSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await requireSession('[t]', 'fn'))?.ok).toBe(false);
  });
});
