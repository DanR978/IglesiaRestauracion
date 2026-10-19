// S39 — acceso/oauth/ (D-035) under jsdom with the auth module mocked: the
// one-time values leave the address bar before anything is sent, failures
// from the query or the fragment show their Spanish copy, the code is
// exchanged (and retried after a dropped connection with the same code),
// and the provider sign-in goes on to verificar/ with the kept `next`.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/auth/session.js', () => import('./mocks').then((m) => m.auth));
vi.mock('#lib/auth/next.js', () => import('./mocks').then((m) => m.next));
vi.mock('#lib/stores/session.svelte.js', () =>
  import('./mocks').then((m) => ({ session: m.store })),
);
vi.mock('$app/navigation', () => import('./mocks').then((m) => m.nav));

import OAuthPage from '../../../src/routes/(admin)/admin/acceso/oauth/+page.svelte';
import { CALLBACK_COPY } from '#lib/components/admin/auth/oauth-callback.js';
import { auth, failure, lastGoto, nav, ok, openAt, resetMocks, settlesTo, store } from './mocks';

const address = () => location.pathname + location.search + location.hash;

beforeEach(() => {
  resetMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('oauth/ — a code', () => {
  it('scrubs the address before the exchange is even sent', async () => {
    openAt('/admin/acceso/oauth/?code=0f1e2d&state=s');
    let seen = '';
    auth.exchangeCode.mockImplementation(async () => {
      seen = address();
      return ok(undefined);
    });
    render(OAuthPage);
    expect(address()).toBe('/admin/acceso/oauth/');
    await waitFor(() => expect(auth.exchangeCode).toHaveBeenCalledWith('0f1e2d'));
    expect(seen).toBe('/admin/acceso/oauth/');
  });

  it('a provider sign-in is aal1: on to verificar/ with the kept `next`', async () => {
    openAt('/admin/acceso/oauth/?code=0f1e2d');
    auth.takeOAuthNext.mockReturnValue('/admin/cuenta/');
    settlesTo('needs-mfa');
    render(OAuthPage);
    await waitFor(() =>
      expect(nav.goto).toHaveBeenCalledWith('/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F', {
        replace: true,
      }),
    );
    expect(auth.takeOAuthNext).toHaveBeenCalledTimes(1);
  });

  it('says it is working while it does', () => {
    openAt('/admin/acceso/oauth/?code=0f1e2d');
    auth.exchangeCode.mockReturnValue(new Promise(() => {}));
    render(OAuthPage);
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciando sesión' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Un momento: estamos completando el inicio de sesión…',
    );
  });

  it('a missing code verifier: open it in the same browser', async () => {
    openAt('/admin/acceso/oauth/?code=0f1e2d');
    auth.exchangeCode.mockResolvedValue(
      failure('auth', 'No pudimos completar…', 'pkce_code_verifier_not_found'),
    );
    render(OAuthPage);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Abre el enlace en el mismo navegador donde iniciaste sesión.',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute(
      'href',
      '/admin/acceso/',
    );
  });

  it.each(['flow_state_expired', 'flow_state_not_found', 'bad_code_verifier'])(
    'an exchange refused with %s: the attempt expired',
    async (code) => {
      openAt('/admin/acceso/oauth/?code=0f1e2d');
      auth.exchangeCode.mockResolvedValue(failure('auth', 'x', code));
      render(OAuthPage);
      expect(await screen.findByRole('alert')).toHaveTextContent(CALLBACK_COPY.expired);
    },
  );

  it('a dropped connection keeps the code and offers Reintentar', async () => {
    openAt('/admin/acceso/oauth/?code=0f1e2d');
    auth.exchangeCode.mockResolvedValueOnce(
      failure('network', 'No pudimos conectar con el servidor.'),
    );
    settlesTo('needs-enroll');
    render(OAuthPage);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor.',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(lastGoto()).toBe('/admin/acceso/verificar/'));
    expect(auth.exchangeCode).toHaveBeenNthCalledWith(2, '0f1e2d');
  });
});

describe('oauth/ — a failure in the URL', () => {
  it.each([
    [
      'a cancel at the provider (no error_code)',
      '?error=access_denied&error_description=The+user+denied+the+request',
      'Cancelaste el inicio de sesión.',
    ],
    [
      'no invitation (query)',
      '?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed',
      CALLBACK_COPY.noInvitation,
    ],
    [
      'no invitation (fragment only)',
      '#error=access_denied&error_code=signup_disabled&sb=',
      CALLBACK_COPY.noInvitation,
    ],
    [
      'an expired state',
      '?error=invalid_request&error_code=bad_oauth_state',
      CALLBACK_COPY.expired,
    ],
    ['a provider error', '?error=server_error', CALLBACK_COPY.generic],
  ])('%s', async (_label, tail, message) => {
    openAt(`/admin/acceso/oauth/${tail}`);
    render(OAuthPage);
    expect(address()).toBe('/admin/acceso/oauth/');
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(
      screen.getByRole('heading', { level: 1, name: 'No pudimos iniciar tu sesión' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(store.ready).toHaveBeenCalled());
    expect(auth.exchangeCode).not.toHaveBeenCalled();
    expect(nav.goto).not.toHaveBeenCalled();
  });

  it("never shows the provider's raw description", () => {
    openAt('/admin/acceso/oauth/?error=server_error&error_description=Unable+to+exchange+code');
    render(OAuthPage);
    expect(document.body).not.toHaveTextContent('Unable to exchange code');
  });
});

describe('oauth/ — nothing in the URL', () => {
  it('signed out: the link was incomplete', async () => {
    openAt('/admin/acceso/oauth/');
    render(OAuthPage);
    expect(await screen.findByRole('alert')).toHaveTextContent(CALLBACK_COPY.incomplete);
  });

  it('a reload after the exchange carries on', async () => {
    openAt('/admin/acceso/oauth/');
    store.status = 'needs-mfa';
    render(OAuthPage);
    await waitFor(() => expect(lastGoto()).toBe('/admin/acceso/verificar/'));
  });
});
