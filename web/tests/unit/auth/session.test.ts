// S38 — auth/session: the thin wrappers over auth-js (sign-in, OAuth with
// PKCE, email links, password, sign-out, providers, the store's reads).
// Asserts call shapes and result mapping with a mocked client; GoTrue itself
// is the local-stack suite's job (D-039).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./auth-client'));

import { auth, authError, realtime, resetAuthClient, session, unsubscribe } from './auth-client';
import {
  OAUTH_NEXT_KEY,
  exchangeCode,
  fetchEnabledProviders,
  getAal,
  getSession,
  oauthRedirectUrl,
  onAuthChange,
  requestPasswordReset,
  setRealtimeAuth,
  signInWithOAuth,
  signInWithPassword,
  signOut,
  takeOAuthNext,
  updatePassword,
  verifyOtp,
} from '#lib/auth/session.js';

describe('auth/session', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetAuthClient();
    sessionStorage.clear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  describe('signInWithPassword', () => {
    it('trims the email, keeps the password as typed', async () => {
      expect(await signInWithPassword('  ana@example.org ', ' secreto ')).toEqual({
        ok: true,
        data: undefined,
      });
      expect(auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'ana@example.org',
        password: ' secreto ',
      });
    });

    it('refuses an empty field before the network', async () => {
      const res = await signInWithPassword(' ', 'x');
      expect(res).toEqual({
        ok: false,
        error: { kind: 'invalid', message: 'Escribe tu correo y tu contraseña.', code: null },
      });
      expect(auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('maps a refusal by code', async () => {
      auth.signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: authError('invalid_credentials'),
      } as never);
      const res = await signInWithPassword('a@b.c', 'x');
      expect(res.ok === false && res.error).toMatchObject({
        code: 'invalid_credentials',
        message: 'Correo o contraseña incorrectos.',
      });
    });

    it('never throws', async () => {
      auth.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const res = await signInWithPassword('a@b.c', 'x');
      expect(res.ok === false && res.error.kind).toBe('network');
    });
  });

  describe('OAuth (D-035)', () => {
    it('redirectTo is the absolute URL of the callback route, trailing slash', () => {
      expect(oauthRedirectUrl('https://www.irdlex.org')).toBe(
        'https://www.irdlex.org/admin/acceso/oauth/',
      );
    });

    it('starts Google with the callback and no extra scope', async () => {
      await signInWithOAuth('google');
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: `${location.origin}/admin/acceso/oauth/` },
      });
    });

    it('asks Microsoft for the email claim', async () => {
      await signInWithOAuth('azure');
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'azure',
        options: { redirectTo: `${location.origin}/admin/acceso/oauth/`, scopes: 'email' },
      });
    });

    it('keeps `next` for the callback, once', async () => {
      await signInWithOAuth('google', { next: '/admin/cuenta/' });
      expect(sessionStorage.getItem(OAUTH_NEXT_KEY)).toBe('/admin/cuenta/');
      expect(takeOAuthNext()).toBe('/admin/cuenta/');
      expect(takeOAuthNext()).toBeNull();
    });

    it('a start without `next` forgets an older one', async () => {
      sessionStorage.setItem(OAUTH_NEXT_KEY, '/admin/old/');
      await signInWithOAuth('google');
      expect(takeOAuthNext()).toBeNull();
    });

    it('refuses a provider it does not offer', async () => {
      const res = await signInWithOAuth('github' as 'google');
      expect(res.ok).toBe(false);
      expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    });

    it('exchangeCode trades the code; a missing verifier keeps its code for the screen', async () => {
      expect(await exchangeCode('abc-123')).toEqual({ ok: true, data: undefined });
      expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc-123');
      auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: null },
        error: Object.assign(new Error('PKCE code verifier not found in storage.'), {
          name: 'AuthPKCECodeVerifierMissingError',
          code: 'pkce_code_verifier_not_found',
          status: 400,
          __isAuthError: true,
        }),
      } as never);
      const res = await exchangeCode('abc-123');
      expect(res.ok === false && res.error.code).toBe('pkce_code_verifier_not_found');
      expect(res.ok === false && res.error.message).toMatch(/mismo navegador/);
    });

    it('exchangeCode refuses an empty code', async () => {
      expect((await exchangeCode('')).ok).toBe(false);
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });
  });

  describe('OAuth under BASE_PATH=/app', () => {
    afterEach(() => {
      vi.doUnmock('$app/paths');
      vi.resetModules();
    });

    it('the callback is /app/admin/acceso/oauth/', async () => {
      vi.resetModules();
      vi.doMock('$app/paths', async () =>
        (await import('../../helpers/app-paths')).pathsAt('/app'),
      );
      const { oauthRedirectUrl: at, signInWithOAuth: start } = await import('#lib/auth/session.js');
      const { ROUTES } = await import('#lib/auth/routes.js');
      expect(at('https://www.irdlex.org')).toBe('https://www.irdlex.org/app/admin/acceso/oauth/');
      expect(ROUTES).toEqual({
        home: '/app/admin/',
        account: '/app/admin/cuenta/',
        login: '/app/admin/acceso/',
        verify: '/app/admin/acceso/verificar/',
        oauth: '/app/admin/acceso/oauth/',
        invite: '/app/admin/acceso/invitacion/',
        reset: '/app/admin/acceso/restablecer/',
        recover: '/app/admin/acceso/recuperar/',
        noAccess: '/app/admin/acceso/sin-acceso/',
      });
      await start('google');
      // vi.mock factories are not re-run by resetModules: the client is still `auth`.
      expect(auth.signInWithOAuth).toHaveBeenLastCalledWith({
        provider: 'google',
        options: { redirectTo: `${location.origin}/app/admin/acceso/oauth/` },
      });
    });
  });

  describe('verifyOtp (email links)', () => {
    it.each(['invite', 'recovery', 'email'])('spends a %s token_hash', async (type) => {
      expect(await verifyOtp('pkce_0a1b2c', type)).toEqual({ ok: true, data: undefined });
      expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_0a1b2c', type });
    });

    it.each([
      ['an unknown type', 'abc', 'sms'],
      ['an empty hash', '', 'invite'],
      ['a hash with other characters', 'abc&type=x', 'invite'],
    ])('refuses %s before the network', async (_label, hash, type) => {
      expect(await verifyOtp(hash, type)).toEqual({
        ok: false,
        error: {
          kind: 'invalid',
          message: 'El enlace no es válido o está incompleto. Pide uno nuevo.',
          code: null,
        },
      });
      expect(auth.verifyOtp).not.toHaveBeenCalled();
    });

    it('an expired or used link says so', async () => {
      auth.verifyOtp.mockResolvedValueOnce({
        data: { session: null },
        error: authError('otp_expired', 403),
      } as never);
      const res = await verifyOtp('abc', 'recovery');
      expect(res.ok === false && res.error.message).toBe(
        'El enlace expiró o ya se usó. Pide uno nuevo.',
      );
    });
  });

  describe('account', () => {
    it('requestPasswordReset returns to the legacy panel (D-001) and never reveals the account', async () => {
      expect(await requestPasswordReset(' ana@example.org ')).toEqual({
        ok: true,
        data: undefined,
      });
      // The legacy address at the site root, never under the app's base path.
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.org', {
        redirectTo: `${location.origin}/admin/?action=reset-password`,
      });
      expect((await requestPasswordReset('')).ok).toBe(false);
    });

    it('updatePassword sends current_password only when given', async () => {
      await updatePassword({ password: 'nueva-clave-1' });
      expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'nueva-clave-1' });
      await updatePassword({ password: 'nueva-clave-1', current_password: 'vieja' });
      expect(auth.updateUser).toHaveBeenLastCalledWith({
        password: 'nueva-clave-1',
        current_password: 'vieja',
      });
    });

    it('updatePassword refuses a password GoTrue would refuse', async () => {
      expect(await updatePassword({ password: 'corta' })).toMatchObject({
        ok: false,
        error: { message: 'La contraseña debe tener al menos 8 caracteres.' },
      });
      expect(await updatePassword({ password: 'ñ'.repeat(40) })).toMatchObject({
        ok: false,
        error: { kind: 'invalid' },
      });
      expect(auth.updateUser).not.toHaveBeenCalled();
    });

    it('a wrong current password maps to its own copy', async () => {
      auth.updateUser.mockResolvedValueOnce({
        data: { user: null },
        error: authError('current_password_invalid'),
      } as never);
      const res = await updatePassword({ password: 'nueva-clave-1', current_password: 'x' });
      expect(res.ok === false && res.error.message).toBe('La contraseña actual no es correcta.');
    });

    it.each(['local', 'global', 'others'] as const)(
      'signOut(%s) passes the scope',
      async (scope) => {
        expect(await signOut(scope)).toEqual({ ok: true, data: undefined });
        expect(auth.signOut).toHaveBeenCalledWith({ scope });
      },
    );
  });

  describe('fetchEnabledProviders', () => {
    const answer = (body: unknown, status = 200) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status }));

    it('reads /auth/v1/settings with the anon key and lists google, azure in order', async () => {
      const fetchMock = answer({ external: { azure: true, google: true, github: true } });
      vi.stubGlobal('fetch', fetchMock);
      expect(await fetchEnabledProviders()).toEqual(['google', 'azure']);
      const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(requestUrl).toBe('https://stub.supabase.local/auth/v1/settings');
      expect(init.headers).toEqual({ apikey: 'stub-anon-key' });
    });

    it('only providers reported exactly `true`', async () => {
      vi.stubGlobal('fetch', answer({ external: { google: 'true', azure: false } }));
      expect(await fetchEnabledProviders()).toEqual([]);
    });

    it.each([
      ['an HTTP error', answer({ external: { google: true } }, 500)],
      ['a body without `external`', answer({ disable_signup: true })],
      ['a network failure', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))],
      ['malformed JSON', vi.fn(async () => new Response('<html>', { status: 200 }))],
    ])('fails closed to none on %s', async (_label, fetchMock) => {
      vi.stubGlobal('fetch', fetchMock);
      expect(await fetchEnabledProviders()).toEqual([]);
    });
  });

  describe('for the session store', () => {
    it('getSession: the session, or null', async () => {
      expect(await getSession()).toEqual({ ok: true, data: session() });
      auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      expect(await getSession()).toEqual({ ok: true, data: null });
    });

    it('getSession: a refused refresh is signed out, an unanswered one is a network failure', async () => {
      auth.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: authError('refresh_token_not_found'),
      });
      expect(await getSession()).toEqual({ ok: true, data: null });
      auth.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: Object.assign(new Error('Failed to fetch'), {
          name: 'AuthRetryableFetchError',
          status: 0,
        }),
      });
      const res = await getSession();
      expect(res.ok === false && res.error.kind).toBe('network');
    });

    it('getAal: the two levels; anything unknown reads as none', async () => {
      expect(await getAal()).toEqual({ ok: true, data: { current: 'aal2', next: 'aal2' } });
      auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
        data: { currentLevel: 'aal3', nextLevel: 'aal1', currentAuthenticationMethods: [] },
        error: null,
      });
      expect(await getAal()).toEqual({ ok: true, data: { current: null, next: 'aal1' } });
    });

    it('onAuthChange subscribes once and returns the unsubscribe', () => {
      const off = onAuthChange(() => {});
      expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
      off();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('setRealtimeAuth hands Realtime the token', () => {
      setRealtimeAuth('token-aal2');
      expect(realtime.setAuth).toHaveBeenCalledWith('token-aal2');
    });
  });
});
