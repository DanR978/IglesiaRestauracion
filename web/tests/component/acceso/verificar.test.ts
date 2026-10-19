// S39 — acceso/verificar/ (D-033) under jsdom with the auth module mocked:
// the challenge and the enrollment as two distinct states, the DF-006
// ordering (insufficient_aal on enroll → challenge; no factor → enroll; an
// unsupported factor → a plain message), the QR without a stale image, the
// copyable key, cancel → signOut('local'), and every status that moves on.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/auth/mfa.js', () => import('./mocks').then((m) => m.mfa));
vi.mock('#lib/auth/session.js', () => import('./mocks').then((m) => m.auth));
vi.mock('#lib/auth/next.js', () => import('./mocks').then((m) => m.next));
vi.mock('#lib/stores/session.svelte.js', () =>
  import('./mocks').then((m) => ({ session: m.store })),
);
vi.mock('#lib/stores/toast.svelte.js', () => import('./mocks').then((m) => ({ toast: m.toast })));
vi.mock('$app/navigation', () => import('./mocks').then((m) => m.nav));

import VerifyPage from '../../../src/routes/(admin)/admin/acceso/verificar/+page.svelte';
import {
  ENROLLMENT,
  failure,
  lastGoto,
  mfa,
  nav,
  ok,
  openAt,
  resetMocks,
  settlesTo,
  store,
  toast,
} from './mocks';

const codeInput = () => screen.getByLabelText('Código de verificación') as HTMLInputElement;

async function typeCode(code: string): Promise<void> {
  await fireEvent.input(codeInput(), { target: { value: code } });
}

beforeEach(() => {
  resetMocks();
  openAt('/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F');
});

afterEach(() => vi.restoreAllMocks());

describe('verificar/ — challenge (a verified factor)', () => {
  beforeEach(() => {
    store.status = 'needs-mfa';
  });

  it('asks for the code under its own heading and title', async () => {
    render(VerifyPage);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Verifica tu identidad' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.title).toBe('Verifica tu identidad · Panel · Iglesia Restauración Divina');
    expect(codeInput()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(codeInput()).toHaveAttribute('inputmode', 'numeric');
    expect(mfa.beginChallenge).toHaveBeenCalled();
    expect(screen.queryByRole('img', { name: /Código QR/ })).not.toBeInTheDocument();
  });

  it('submits on the sixth digit, then goes to `next`', async () => {
    render(VerifyPage);
    await screen.findByLabelText('Código de verificación');
    settlesTo('ready');
    await typeCode('123456');
    expect(mfa.submitCode).toHaveBeenCalledWith('123456');
    await waitFor(() => expect(nav.goto).toHaveBeenCalledWith('/admin/cuenta/', { replace: true }));
    expect(toast.success).toHaveBeenCalledWith('Verificación completada.');
  });

  it('a wrong code says so, clears the field and keeps the step', async () => {
    mfa.submitCode.mockResolvedValue(
      failure(
        'auth',
        'Código incorrecto o expirado. Revisa tu app e inténtalo de nuevo.',
        'mfa_verification_failed',
      ),
    );
    render(VerifyPage);
    await screen.findByLabelText('Código de verificación');
    await typeCode('000000');
    expect(await screen.findByRole('alert')).toHaveTextContent('Código incorrecto o expirado.');
    expect(codeInput().value).toBe('');
    expect(codeInput()).toHaveAttribute('aria-invalid', 'true');
    expect(nav.goto).not.toHaveBeenCalled();
  });

  it('a short code is refused before the network', async () => {
    render(VerifyPage);
    await screen.findByLabelText('Código de verificación');
    await typeCode('123');
    await fireEvent.submit(codeInput().form as HTMLFormElement);
    expect(screen.getByText('Escribe el código de 6 dígitos.')).toBeInTheDocument();
    expect(mfa.submitCode).not.toHaveBeenCalled();
  });

  it('no factor at all after the fresh list: enroll instead', async () => {
    mfa.beginChallenge.mockResolvedValue(ok(false));
    mfa.listFactors.mockResolvedValue(ok([]));
    render(VerifyPage);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Protege tu cuenta' }),
    ).toBeInTheDocument();
    expect(mfa.beginEnroll).toHaveBeenCalled();
  });

  it('a verified factor this panel cannot use: a plain message and the way out', async () => {
    mfa.beginChallenge.mockResolvedValue(ok(false));
    mfa.listFactors.mockResolvedValue(
      ok([{ id: 'p-1', status: 'verified', factor_type: 'phone' }]),
    );
    render(VerifyPage);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu cuenta usa un método de verificación que este panel no admite.',
    );
    expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar y cerrar sesión' })).toBeEnabled();
  });

  it('"Cancelar y cerrar sesión" ends only this device\'s session', async () => {
    render(VerifyPage);
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancelar y cerrar sesión' }));
    expect(store.signOut).toHaveBeenCalledWith('local');
    await waitFor(() =>
      expect(lastGoto()).toBe('/admin/acceso/?next=%2Fadmin%2Fcuenta%2F&aviso=sesion-cerrada'),
    );
    expect(mfa.cancelEnroll).not.toHaveBeenCalled();
  });

  it('cancel waits while a code is being checked', async () => {
    mfa.submitCode.mockReturnValue(new Promise(() => {}));
    render(VerifyPage);
    await screen.findByLabelText('Código de verificación');
    await typeCode('123456');
    expect(screen.getByRole('button', { name: 'Cancelar y cerrar sesión' })).toBeDisabled();
  });
});

describe('verificar/ — enrollment (no factor yet)', () => {
  beforeEach(() => {
    store.status = 'needs-enroll';
  });

  it('teaches, shows the QR and the key, then asks for the code', async () => {
    render(VerifyPage);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Protege tu cuenta' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google Authenticator, Microsoft Authenticator o 1Password/));
    const qr = await screen.findByRole('img', {
      name: 'Código QR para tu app de autenticación',
    });
    expect(qr).toHaveAttribute('src', ENROLLMENT.qrCode);
    const key = screen.getByLabelText('Clave de configuración') as HTMLTextAreaElement;
    // Read and typed in fours; the copy button hands over the bare key.
    expect(key.value).toBe('JBSW Y3DP EHPK 3PXP');
    expect(key.value.replaceAll(' ', '')).toBe(ENROLLMENT.secret);
    expect(key).toHaveAttribute('readonly');
    expect(codeInput()).toBeEnabled();
  });

  it('copies the key and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(VerifyPage);
    await screen.findByRole('img', { name: 'Código QR para tu app de autenticación' });
    await fireEvent.click(screen.getByRole('button', { name: 'Copiar clave' }));
    expect(writeText).toHaveBeenCalledWith(ENROLLMENT.secret);
    expect(await screen.findByText('Clave copiada.')).toHaveAttribute('role', 'status');
    vi.unstubAllGlobals();
  });

  it('a refused copy selects the key instead', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(VerifyPage);
    await screen.findByRole('img', { name: 'Código QR para tu app de autenticación' });
    await fireEvent.click(screen.getByRole('button', { name: 'Copiar clave' }));
    expect(
      await screen.findByText('No se pudo copiar. Selecciona la clave y cópiala.'),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('never shows a previous QR while a new one loads', async () => {
    mfa.beginEnroll.mockResolvedValueOnce(
      failure('network', 'No pudimos conectar con el servidor.'),
    );
    let finish: (value: unknown) => void = () => {};
    mfa.beginEnroll.mockReturnValueOnce(new Promise((done) => (finish = done)));
    render(VerifyPage);
    await fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(screen.queryByRole('img', { name: /Código QR/ })).not.toBeInTheDocument();
    expect(screen.getByText('Preparando tu código QR…')).toBeInTheDocument();
    expect((screen.getByLabelText('Clave de configuración') as HTMLTextAreaElement).value).toBe('');
    expect(codeInput()).toBeDisabled();
    finish(ok(ENROLLMENT));
    expect(
      await screen.findByRole('img', { name: 'Código QR para tu app de autenticación' }),
    ).toBeInTheDocument();
  });

  it('a verified factor already there (insufficient_aal): the code step instead', async () => {
    mfa.beginEnroll.mockResolvedValue(
      failure(
        'auth',
        'Confirma tu identidad con el código de tu app para continuar.',
        'insufficient_aal',
      ),
    );
    render(VerifyPage);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Verifica tu identidad' }),
    ).toBeInTheDocument();
    expect(mfa.beginChallenge).toHaveBeenCalled();
  });

  it('verifies the new factor, then goes on', async () => {
    render(VerifyPage);
    await screen.findByRole('img', { name: 'Código QR para tu app de autenticación' });
    settlesTo('ready');
    await typeCode('654321');
    expect(mfa.submitCode).toHaveBeenCalledWith('654321');
    await waitFor(() => expect(lastGoto()).toBe('/admin/cuenta/'));
  });

  it('cancel removes the unverified factor, then signs out here', async () => {
    render(VerifyPage);
    await screen.findByRole('img', { name: 'Código QR para tu app de autenticación' });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar y cerrar sesión' }));
    await waitFor(() => expect(store.signOut).toHaveBeenCalledWith('local'));
    expect(mfa.cancelEnroll).toHaveBeenCalled();
    expect(mfa.cancelEnroll.mock.invocationCallOrder[0]).toBeLessThan(
      store.signOut.mock.invocationCallOrder[0],
    );
  });
});

describe('verificar/ — everyone else moves on', () => {
  it.each([
    ['signed-out', '/admin/acceso/?next=%2Fadmin%2Fcuenta%2F'],
    ['expired', '/admin/acceso/?next=%2Fadmin%2Fcuenta%2F'],
    ['ready', '/admin/cuenta/'],
    ['forbidden', '/admin/acceso/sin-acceso/'],
  ] as const)('%s → %s', async (status, to) => {
    store.status = status;
    render(VerifyPage);
    await waitFor(() => expect(lastGoto()).toBe(to));
    expect(mfa.beginChallenge).not.toHaveBeenCalled();
    expect(mfa.beginEnroll).not.toHaveBeenCalled();
  });

  it('a session that could not be read offers Retry', async () => {
    store.status = 'error';
    store.error = { kind: 'network', message: 'No pudimos conectar con el servidor.' };
    store.retry.mockImplementation(async () => {
      store.status = 'needs-mfa';
      store.error = null;
    });
    render(VerifyPage);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor.',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Verifica tu identidad' }),
    ).toBeInTheDocument();
    expect(store.retry).toHaveBeenCalled();
  });
});
