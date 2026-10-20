// S39 — acceso/invitacion/ and acceso/restablecer/ under jsdom with the auth
// module mocked: the legacy email contract (`?action=…&token_hash=…&type=…`,
// D-001) and a plain `?token_hash&type` are both spent with verifyOtp after
// the address is scrubbed; a recovery steps up the second factor BEFORE the
// password; the set-password form (new-password, strength, confirm); expired,
// used and broken links say what to do next; a dropped connection retries
// with the same token; a link for the other page goes there unspent.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/auth/session.js', () => import('./mocks').then((m) => m.auth));
vi.mock('#lib/auth/mfa.js', () => import('./mocks').then((m) => m.mfa));
vi.mock('#lib/stores/session.svelte.js', () =>
  import('./mocks').then((m) => ({ session: m.store })),
);
vi.mock('#lib/stores/toast.svelte.js', () => import('./mocks').then((m) => ({ toast: m.toast })));
vi.mock('#lib/components/admin/shell/sign-out.svelte.js', () =>
  import('./mocks').then((m) => m.shell),
);
vi.mock('$app/navigation', () => import('./mocks').then((m) => m.nav));

import InvitePage from '../../../src/routes/(admin)/admin/acceso/invitacion/+page.svelte';
import ResetPage from '../../../src/routes/(admin)/admin/acceso/restablecer/+page.svelte';
import {
  auth,
  failure,
  lastGoto,
  mfa,
  nav,
  ok,
  openAt,
  resetMocks,
  settlesTo,
  shell,
  store,
  toast,
} from './mocks';

const STRONG = 'campana luz norte 77';
const address = () => location.pathname + location.search + location.hash;
const newPassword = () => screen.getByLabelText('Contraseña nueva') as HTMLInputElement;
const confirmPassword = () => screen.getByLabelText('Confirma la contraseña') as HTMLInputElement;

async function choose(password: string, confirm = password): Promise<void> {
  await fireEvent.input(newPassword(), { target: { value: password } });
  await fireEvent.input(confirmPassword(), { target: { value: confirm } });
  await fireEvent.submit(newPassword().form as HTMLFormElement);
}

/** The link signs this tab in: the store settles to `status` from then on. */
function linkSignsInAs(status: 'needs-enroll' | 'needs-mfa' | 'ready' | 'forbidden'): void {
  auth.verifyOtp.mockImplementation(async () => {
    store.status = status;
    store.user = { email: 'ana@example.org' };
    return ok(undefined);
  });
}

beforeEach(() => {
  resetMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('invitacion/ — the legacy email contract', () => {
  it.each([
    ['?action=accept-invite&token_hash=pkce_0a1b2c&type=invite', 'pkce_0a1b2c'],
    ['?token_hash=0a1b2c&type=invite', '0a1b2c'],
    ['#token_hash=0a1b2c&type=invite', '0a1b2c'],
  ])('%s: scrubbed, then spent', async (tail, hash) => {
    openAt(`/admin/acceso/invitacion/${tail}`);
    linkSignsInAs('needs-enroll');
    render(InvitePage);
    expect(address()).toBe('/admin/acceso/invitacion/');
    await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledWith(hash, 'invite'));
    expect(await screen.findByLabelText('Contraseña nueva')).toBeInTheDocument();
  });

  it('the password step: account named, new-password fields, strength meter', async () => {
    openAt('/admin/acceso/invitacion/?action=accept-invite&token_hash=0a1b2c&type=invite');
    linkSignsInAs('needs-enroll');
    render(InvitePage);
    await screen.findByLabelText('Contraseña nueva');
    expect(screen.getByRole('heading', { level: 1, name: 'Activa tu cuenta' })).toBeInTheDocument();
    expect(document.title).toBe('Activa tu cuenta · Panel · Iglesia Restauración Divina');
    expect(screen.getByText('ana@example.org')).toBeInTheDocument();
    expect(newPassword()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmPassword()).toHaveAttribute('autocomplete', 'new-password');
    expect(document.querySelector('input[autocomplete="username"]')).toHaveValue('ana@example.org');
    expect(screen.getByText('Usa al menos 8 caracteres.')).toBeInTheDocument();
  });

  it('sets the password, then goes to verificar/ to enroll (D-033)', async () => {
    openAt('/admin/acceso/invitacion/?token_hash=0a1b2c&type=invite');
    linkSignsInAs('needs-enroll');
    render(InvitePage);
    await screen.findByLabelText('Contraseña nueva');
    await choose(STRONG);
    expect(auth.updatePassword).toHaveBeenCalledWith({ password: STRONG });
    await waitFor(() =>
      expect(nav.goto).toHaveBeenCalledWith('/admin/acceso/verificar/', { replace: true }),
    );
    expect(toast.success).toHaveBeenCalledWith('Contraseña creada.');
  });

  it('may use Google or Microsoft instead, when enabled', async () => {
    openAt('/admin/acceso/invitacion/?token_hash=0a1b2c&type=invite');
    linkSignsInAs('needs-enroll');
    auth.fetchEnabledProviders.mockResolvedValue(['google']);
    render(InvitePage);
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar con Google' }));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith('google', { next: null });
  });

  it('an expired or used invitation: ask for a new one', async () => {
    openAt('/admin/acceso/invitacion/?action=accept-invite&token_hash=0a1b2c&type=invite');
    auth.verifyOtp.mockResolvedValue(
      failure('auth', 'El enlace expiró o ya se usó. Pide uno nuevo.', 'otp_expired'),
    );
    render(InvitePage);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'El enlace de invitación no es válido',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El enlace expiró o ya se usó. Pide al administrador que te envíe una invitación nueva.',
    );
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/admin/acceso/',
    );
  });

  it('an error GoTrue put in the link: no token is spent', async () => {
    openAt(
      '/admin/acceso/invitacion/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    );
    render(InvitePage);
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace expiró o ya se usó.');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(address()).toBe('/admin/acceso/invitacion/');
  });

  it('a dropped connection retries with the same token, though the URL is clean', async () => {
    openAt('/admin/acceso/invitacion/?token_hash=0a1b2c&type=invite');
    auth.verifyOtp.mockResolvedValueOnce(
      failure('network', 'No pudimos conectar con el servidor.'),
    );
    render(InvitePage);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor.',
    );
    linkSignsInAs('needs-enroll');
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Contraseña nueva')).toBeInTheDocument();
    expect(auth.verifyOtp).toHaveBeenNthCalledWith(2, '0a1b2c', 'invite');
  });

  it('a recovery link opened here goes to restablecer/ unspent', async () => {
    openAt('/admin/acceso/invitacion/?action=reset-password&token_hash=0a1b2c&type=recovery');
    render(InvitePage);
    await waitFor(() =>
      expect(lastGoto()).toBe(
        '/admin/acceso/restablecer/?action=reset-password&token_hash=0a1b2c&type=recovery',
      ),
    );
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('no token and no session: the link is not valid', async () => {
    openAt('/admin/acceso/invitacion/');
    render(InvitePage);
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace expiró o ya se usó.');
  });

  it("a reload after the token was spent finds the link's session and carries on", async () => {
    openAt('/admin/acceso/invitacion/');
    store.status = 'needs-enroll';
    store.user = { email: 'ana@example.org' };
    render(InvitePage);
    expect(await screen.findByLabelText('Contraseña nueva')).toBeInTheDocument();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('an account without access goes to sin-acceso/', async () => {
    openAt('/admin/acceso/invitacion/?token_hash=0a1b2c&type=invite');
    linkSignsInAs('forbidden');
    render(InvitePage);
    await waitFor(() => expect(lastGoto()).toBe('/admin/acceso/sin-acceso/'));
  });
});

describe('invitacion/ — the password form', () => {
  beforeEach(() => {
    openAt('/admin/acceso/invitacion/?token_hash=0a1b2c&type=invite');
    linkSignsInAs('needs-enroll');
  });

  it('asks for a password', async () => {
    render(InvitePage);
    await screen.findByLabelText('Contraseña nueva');
    await fireEvent.submit(newPassword().form as HTMLFormElement);
    expect(screen.getByText('Escribe una contraseña nueva.')).toBeInTheDocument();
    expect(document.activeElement).toBe(newPassword());
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it('refuses a short or predictable one', async () => {
    render(InvitePage);
    await screen.findByLabelText('Contraseña nueva');
    await choose('corta');
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
    await choose('Contraseña2024!');
    expect(screen.getByText(/Esa contraseña es fácil de adivinar/)).toBeInTheDocument();
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it('asks to confirm it, and says when the two differ', async () => {
    render(InvitePage);
    await screen.findByLabelText('Contraseña nueva');
    await choose(STRONG, '');
    expect(
      screen.getByText('Escribe la contraseña otra vez para confirmarla.'),
    ).toBeInTheDocument();
    await choose(STRONG, `${STRONG}!`);
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(document.activeElement).toBe(confirmPassword());
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it("GoTrue's refusal shows as an Alert", async () => {
    auth.updatePassword.mockResolvedValue(
      failure('invalid', 'La contraseña es muy débil. Usa al menos 8 caracteres.', 'weak_password'),
    );
    render(InvitePage);
    await screen.findByLabelText('Contraseña nueva');
    await choose(STRONG);
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña es muy débil.');
  });

  it('a session that is gone means the link is no longer valid', async () => {
    auth.updatePassword.mockResolvedValue(failure('auth', 'Tu sesión expiró.', null));
    render(InvitePage);
    await screen.findByLabelText('Contraseña nueva');
    await choose(STRONG);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'El enlace de invitación no es válido',
      }),
    ).toBeInTheDocument();
  });
});

describe('restablecer/ — recovery steps up first (DF-006)', () => {
  it('a verified factor: the code BEFORE the password', async () => {
    openAt('/admin/acceso/restablecer/?action=reset-password&token_hash=pkce_9f8e7d&type=recovery');
    linkSignsInAs('needs-mfa');
    render(ResetPage);
    expect(address()).toBe('/admin/acceso/restablecer/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Verifica tu identidad' }),
    ).toBeInTheDocument();
    expect(auth.verifyOtp).toHaveBeenCalledWith('pkce_9f8e7d', 'recovery');
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
    expect(screen.getByText(/Antes de cambiar tu contraseña/)).toBeInTheDocument();

    settlesTo('ready');
    await fireEvent.input(screen.getByLabelText('Código de verificación'), {
      target: { value: '123456' },
    });
    expect(mfa.submitCode).toHaveBeenCalledWith('123456');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Restablece tu contraseña' }),
    ).toBeInTheDocument();
    await choose(STRONG);
    expect(auth.updatePassword).toHaveBeenCalledWith({ password: STRONG });
    await waitFor(() => expect(lastGoto()).toBe('/admin/'));
    expect(toast.success).toHaveBeenCalledWith('Contraseña actualizada.');
    expect(mfa.submitCode.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updatePassword.mock.invocationCallOrder[0],
    );
  });

  it('no factor: the password at once, then enrollment', async () => {
    openAt('/admin/acceso/restablecer/?token_hash=9f8e7d&type=recovery');
    linkSignsInAs('needs-enroll');
    render(ResetPage);
    await screen.findByLabelText('Contraseña nueva');
    expect(mfa.beginChallenge).not.toHaveBeenCalled();
    await choose(STRONG);
    await waitFor(() => expect(lastGoto()).toBe('/admin/acceso/verificar/'));
  });

  it('insufficient_aal on save: the code, and the typed passwords are kept', async () => {
    openAt('/admin/acceso/restablecer/?token_hash=9f8e7d&type=recovery');
    linkSignsInAs('needs-enroll');
    auth.updatePassword.mockResolvedValueOnce(
      failure('auth', 'Confirma tu identidad…', 'insufficient_aal'),
    );
    render(ResetPage);
    await screen.findByLabelText('Contraseña nueva');
    await choose(STRONG);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Verifica tu identidad' }),
    ).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Código de verificación'), {
      target: { value: '123456' },
    });
    await screen.findByLabelText('Contraseña nueva');
    expect(newPassword().value).toBe(STRONG);
    expect(confirmPassword().value).toBe(STRONG);
  });

  it('an expired or used recovery link: ask for a new one', async () => {
    openAt('/admin/acceso/restablecer/?action=reset-password&token_hash=9f8e7d&type=recovery');
    auth.verifyOtp.mockResolvedValue(
      failure('auth', 'El enlace expiró o ya se usó. Pide uno nuevo.', 'otp_expired'),
    );
    render(ResetPage);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace para restablecer tu contraseña expiró o ya se usó. Pide uno nuevo.',
    );
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/admin/acceso/recuperar/',
    );
  });

  it('a malformed link is refused before the network, as not valid', async () => {
    openAt('/admin/acceso/restablecer/?token_hash=abc%26x&type=recovery');
    auth.verifyOtp.mockResolvedValue(
      failure('invalid', 'El enlace no es válido o está incompleto. Pide uno nuevo.'),
    );
    render(ResetPage);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'El enlace no es válido' }),
    ).toBeInTheDocument();
  });

  it('an invitation opened here goes to invitacion/ unspent', async () => {
    openAt('/admin/acceso/restablecer/?action=accept-invite&token_hash=0a1b2c&type=invite');
    render(ResetPage);
    await waitFor(() =>
      expect(lastGoto()).toBe(
        '/admin/acceso/invitacion/?action=accept-invite&token_hash=0a1b2c&type=invite',
      ),
    );
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("cancelling the step-up signs this device out, the shell's way", async () => {
    openAt('/admin/acceso/restablecer/?token_hash=9f8e7d&type=recovery');
    linkSignsInAs('needs-mfa');
    render(ResetPage);
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancelar y cerrar sesión' }));
    expect(shell.signOutAndLeave).toHaveBeenCalledWith('local');
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });
});
