// S45 — Mi cuenta › Seguridad under jsdom, with the session store faked
// (fixtures/account-fakes.svelte.ts), the auth module (updatePassword) and
// the mfa module mocked, and the real toast and confirm stores: the password
// change (current password sent only when typed, the four GoTrue codes as
// inline errors, success clears and offers to close the other sessions), the
// first password of a Google / Microsoft account behind a fresh TOTP step-up,
// the two-factor devices (loading / error + Retry / empty / list, the last
// device can't go, removal = confirm → step-up → remove, adding with QR,
// secret and code), the read-only sign-in methods, and the two sign-outs.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthFailure } from '#lib/auth/errors.js';
import type { Factor } from '#lib/auth/mfa.js';
import type { RepoErrorKind } from '#lib/repos/types.js';
import { confirmState } from '#lib/stores/confirm.svelte.js';
import { toast } from '#lib/stores/toast.svelte.js';
import PasswordPanel from '#lib/components/admin/account/PasswordPanel.svelte';
import SecuritySection from '#lib/components/admin/account/SecuritySection.svelte';
import SignInMethods from '#lib/components/admin/account/SignInMethods.svelte';
import TwoFactorPanel from '#lib/components/admin/account/TwoFactorPanel.svelte';
import {
  identityFixture,
  resetAccountFakes,
  sessionFake,
  setSession,
  userFixture,
} from '../fixtures/account-fakes.svelte';

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
vi.mock('#lib/stores/session.svelte.js', async () => ({
  session: (await import('../fixtures/account-fakes.svelte')).sessionFake,
}));

const nav = vi.hoisted(() => ({ beforeNavigate: vi.fn(), goto: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => nav);

const auth = vi.hoisted(() => ({ updatePassword: vi.fn() }));
vi.mock('#lib/auth/session.js', () => auth);

const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  beginEnroll: vi.fn(),
  beginChallenge: vi.fn(),
  submitCode: vi.fn(),
  cancelEnroll: vi.fn(),
  removeFactor: vi.fn(),
}));
vi.mock('#lib/auth/mfa.js', () => mfa);

const ok = <T>(data: T) => ({ ok: true as const, data });
const authFailure = (
  code: string | null,
  message = 'copia',
  kind: RepoErrorKind = 'invalid',
): AuthFailure => ({ ok: false, error: { kind, message, code } });

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((done) => setTimeout(done, 0));
  await tick();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const toasts = () => toast.items.map((t) => [t.variant, t.message]);

/** Type into a field the way the browser reports it. */
async function type(el: HTMLElement, value: string): Promise<void> {
  await fireEvent.input(el, { target: { value } });
}

/** A whole code into the CodeInput of the open dialog (its onComplete submits). */
async function enterCode(code: string): Promise<void> {
  const dialog = screen.getByRole('dialog');
  const input = dialog.querySelector<HTMLInputElement>('.ird-code__input')!;
  input.focus();
  input.value = code;
  input.setSelectionRange(code.length, code.length);
  await fireEvent.input(input);
  await settle();
}

const device = (id: string, name: string, created = '2026-03-01T12:00:00Z'): Factor => ({
  id,
  friendly_name: name,
  factor_type: 'totp',
  status: 'verified',
  created_at: created,
  updated_at: created,
});

beforeEach(() => {
  resetAccountFakes();
  for (const fn of [...Object.values(mfa), ...Object.values(auth)]) fn.mockReset();
  nav.goto.mockClear();
  mfa.beginChallenge.mockResolvedValue(ok(true));
  mfa.submitCode.mockResolvedValue(ok({ leftover: [] }));
  mfa.cancelEnroll.mockResolvedValue(ok(undefined));
  mfa.listFactors.mockResolvedValue(ok([device('f-1', 'Teléfono de Ana')]));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  confirmState.cancelAll();
  toast.clear();
  vi.restoreAllMocks();
});

/* ── PasswordPanel — change ────────────────────────────────────────────── */

describe('PasswordPanel — an account that signs in with its email', () => {
  const current = () => screen.getByLabelText('Contraseña actual') as HTMLInputElement;
  const next = () => screen.getByLabelText(/^Nueva contraseña/) as HTMLInputElement;
  const repeat = () => screen.getByLabelText(/^Confirma la nueva contraseña/) as HTMLInputElement;
  const submit = () => screen.getByRole('button', { name: 'Cambiar contraseña' });

  function mount(onChanged = vi.fn()) {
    render(PasswordPanel, { props: { user: userFixture(), onChanged } });
    return onChanged;
  }

  async function fill(cur: string, pw: string, again = pw): Promise<void> {
    await type(current(), cur);
    await type(next(), pw);
    await type(repeat(), again);
  }

  it('asks for the current password (optional, explained), a new one and its confirmation', () => {
    const { container } = render(PasswordPanel, {
      props: { user: userFixture(), onChanged: vi.fn() },
    });
    expect(current()).toHaveAttribute('autocomplete', 'current-password');
    expect(current()).not.toHaveAttribute('aria-required');
    const hint = document.getElementById(
      (current().getAttribute('aria-describedby') ?? '').split(' ')[0],
    );
    expect(hint?.textContent).toBe(
      'Déjala vacía solo si nunca creaste una contraseña (entras con Google o Microsoft).',
    );
    expect(next()).toHaveAttribute('autocomplete', 'new-password');
    expect(repeat()).toHaveAttribute('autocomplete', 'new-password');
    expect(container.querySelector('.ird-pw__meter')).not.toBeNull();
    // A password manager files the new password under this account.
    const username = container.querySelector<HTMLInputElement>('input[autocomplete="username"]');
    expect(username?.value).toBe('ana@example.org');
    expect(screen.queryByRole('button', { name: 'Crear una contraseña' })).toBeNull();
  });

  it('sends the current password when it is typed', async () => {
    auth.updatePassword.mockResolvedValue(ok(undefined));
    mount();
    await fill('vieja-clave-1', 'Una frase larga 2026');
    await fireEvent.click(submit());
    await settle();
    expect(auth.updatePassword).toHaveBeenCalledWith({
      password: 'Una frase larga 2026',
      current_password: 'vieja-clave-1',
    });
  });

  it('leaves current_password out when it is empty (never created one)', async () => {
    auth.updatePassword.mockResolvedValue(ok(undefined));
    mount();
    await fill('', 'Una frase larga 2026');
    await fireEvent.click(submit());
    await settle();
    expect(auth.updatePassword).toHaveBeenCalledWith({ password: 'Una frase larga 2026' });
    expect(auth.updatePassword.mock.calls[0][0]).not.toHaveProperty('current_password');
  });

  it('success clears the fields, says so and reports the change', async () => {
    auth.updatePassword.mockResolvedValue(ok(undefined));
    const changed = mount();
    await fill('vieja-clave-1', 'Una frase larga 2026');
    await fireEvent.click(submit());
    await settle();
    expect(toasts()).toEqual([['success', 'Contraseña actualizada']]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect([current().value, next().value, repeat().value]).toEqual(['', '', '']);
  });

  it('a weak new password is an inline error, and nothing is sent', async () => {
    mount();
    await fill('', 'Luz.Sol');
    await fireEvent.click(submit());
    await settle();
    expect(auth.updatePassword).not.toHaveBeenCalled();
    expect(next()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
  });

  it('a confirmation that does not match stops the change', async () => {
    mount();
    await fill('', 'Una frase larga 2026', 'Una frase larga 2025');
    await fireEvent.click(submit());
    await settle();
    expect(auth.updatePassword).not.toHaveBeenCalled();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  });

  it.each([
    ['current_password_required', 'Contraseña actual', 'Escribe tu contraseña actual.'],
    ['current_password_invalid', 'Contraseña actual', 'La contraseña actual no es correcta.'],
    ['same_password', 'Nueva contraseña', 'La nueva contraseña debe ser distinta de la actual.'],
    ['weak_password', 'Nueva contraseña', 'Esa contraseña no es lo bastante segura.'],
  ])('%s is an inline error under "%s"', async (code, label, message) => {
    auth.updatePassword.mockResolvedValue(authFailure(code));
    const changed = mount();
    await fill('vieja-clave-1', 'Una frase larga 2026');
    await fireEvent.click(submit());
    await settle();
    const field = label === 'Contraseña actual' ? current() : next();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const errorId = (field.getAttribute('aria-describedby') ?? '').split(' ').at(-1)!;
    expect(document.getElementById(errorId)?.textContent).toContain(message);
    expect(toasts()).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });

  it('editing the field clears its error', async () => {
    auth.updatePassword.mockResolvedValue(authFailure('current_password_invalid'));
    mount();
    await fill('vieja-clave-1', 'Una frase larga 2026');
    await fireEvent.click(submit());
    await settle();
    expect(current()).toHaveAttribute('aria-invalid', 'true');
    await type(current(), 'vieja-clave-2');
    expect(current()).not.toHaveAttribute('aria-invalid');
  });

  it('any other failure is a toast with the Spanish copy', async () => {
    auth.updatePassword.mockResolvedValue(
      authFailure('over_request_rate_limit', 'Demasiados intentos.', 'unknown'),
    );
    mount();
    await fill('vieja-clave-1', 'Una frase larga 2026');
    await fireEvent.click(submit());
    await settle();
    expect(toasts()).toEqual([['error', 'Demasiados intentos.']]);
    expect(current()).not.toHaveAttribute('aria-invalid');
  });
});

/* ── PasswordPanel — create ────────────────────────────────────────────── */

describe('PasswordPanel — a Google / Microsoft-only account', () => {
  const oauthOnly = () =>
    userFixture({
      identities: [identityFixture('google'), identityFixture('azure')],
      app_metadata: { provider: 'google', providers: ['google', 'azure'] },
    });

  function mount(onChanged = vi.fn()) {
    render(PasswordPanel, { props: { user: oauthOnly(), onChanged } });
    return onChanged;
  }

  it('offers "Crear una contraseña" and no password field until the step-up', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Crear una contraseña' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i, { selector: 'input' })).toBeNull();
    expect(mfa.beginChallenge).not.toHaveBeenCalled();
  });

  it('asks for a fresh code first, then opens the form without "Contraseña actual"', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Crear una contraseña' }));
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Confirma que eres tú' });
    expect(mfa.beginChallenge).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText(/Para crear tu contraseña/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Nueva contraseña/)).toBeNull();

    await enterCode('123456');
    expect(mfa.submitCode).toHaveBeenCalledWith('123456');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(/^Nueva contraseña/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña actual')).toBeNull();
  });

  it('a wrong code stays in the dialog as an inline error', async () => {
    mfa.submitCode.mockResolvedValue(
      authFailure('mfa_verification_failed', 'Código incorrecto o expirado.'),
    );
    mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Crear una contraseña' }));
    await settle();
    await enterCode('000000');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Código incorrecto o expirado.');
    expect(screen.queryByLabelText(/^Nueva contraseña/, { selector: 'input' })).toBeNull();
  });

  it('cancelling the step-up opens nothing', async () => {
    mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Crear una contraseña' }));
    await settle();
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mfa.submitCode).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Crear una contraseña' })).toBeInTheDocument();
  });

  it('creates the password without a current one, then becomes the change form', async () => {
    auth.updatePassword.mockResolvedValue(ok(undefined));
    const changed = mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Crear una contraseña' }));
    await settle();
    await enterCode('123456');
    await type(screen.getByLabelText(/^Nueva contraseña/), 'Una frase larga 2026');
    await type(screen.getByLabelText(/^Confirma la nueva contraseña/), 'Una frase larga 2026');
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await settle();
    expect(auth.updatePassword).toHaveBeenCalledWith({ password: 'Una frase larga 2026' });
    expect(toasts()).toEqual([['success', 'Contraseña creada']]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument();
  });

  it('GoTrue saying a current password is required turns it into the change form', async () => {
    auth.updatePassword.mockResolvedValue(authFailure('current_password_required'));
    mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Crear una contraseña' }));
    await settle();
    await enterCode('123456');
    await type(screen.getByLabelText(/^Nueva contraseña/), 'Una frase larga 2026');
    await type(screen.getByLabelText(/^Confirma la nueva contraseña/), 'Una frase larga 2026');
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await settle();
    const current = screen.getByLabelText('Contraseña actual');
    expect(current).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Tu cuenta ya tiene una contraseña/)).toBeInTheDocument();
  });
});

/* ── TwoFactorPanel ────────────────────────────────────────────────────── */

describe('TwoFactorPanel', () => {
  function mount(onChanged = vi.fn()) {
    const view = render(TwoFactorPanel, { props: { onChanged } });
    return { ...view, onChanged };
  }

  const TWO = [device('f-1', 'Teléfono de Ana'), device('f-2', 'Tableta', '2026-05-01T12:00:00Z')];

  it('a list skeleton until the devices arrive, fetched fresh', async () => {
    const pending = deferred<ReturnType<typeof ok<Factor[]>>>();
    mfa.listFactors.mockReturnValue(pending.promise);
    const { container } = mount();
    expect(container.querySelector('.ird-state--loading')).not.toBeNull();
    pending.resolve(ok([device('f-1', 'Teléfono de Ana')]));
    await settle();
    expect(container.querySelector('.ird-state--loading')).toBeNull();
    expect(screen.getByText('Teléfono de Ana')).toBeInTheDocument();
  });

  it('lists each verified device: its name, when it was added, "Verificado"', async () => {
    mfa.listFactors.mockResolvedValue(
      ok([...TWO, { ...device('f-3', 'A medias'), status: 'unverified' }]),
    );
    mount();
    await settle();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Teléfono de Ana')).toBeInTheDocument();
    expect(within(items[0]).getByText(/Agregado el .*2026/)).toBeInTheDocument();
    expect(within(items[0]).getByText('Verificado')).toBeInTheDocument();
    expect(screen.queryByText('A medias')).toBeNull();
  });

  it('a failed read is an error with Retry, never an empty list', async () => {
    mfa.listFactors.mockResolvedValueOnce(authFailure(null, 'Sin conexión.', 'network'));
    mount();
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión.');
    expect(screen.queryByText(/Aún no tienes/)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await settle();
    expect(mfa.listFactors).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Teléfono de Ana')).toBeInTheDocument();
  });

  it('no device at all is the empty state, with the add action', async () => {
    mfa.listFactors.mockResolvedValue(ok([]));
    mount();
    await settle();
    expect(screen.getByText('Aún no tienes dispositivos de verificación.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar dispositivo' })).toBeInTheDocument();
  });

  it('the last device has no "Quitar", and the panel says why (D-033)', async () => {
    mount();
    await settle();
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull();
    expect(screen.getByText(/Es tu único dispositivo/)).toHaveTextContent(/obligatoria/);
  });

  it('with two devices each one can go, named in its button', async () => {
    mfa.listFactors.mockResolvedValue(ok(TWO));
    mount();
    await settle();
    expect(screen.getByRole('button', { name: 'Quitar Teléfono de Ana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar Tableta' })).toBeInTheDocument();
    expect(screen.queryByText(/Es tu único dispositivo/)).toBeNull();
  });

  it('removing asks first (danger) — No changes nothing and asks for no code', async () => {
    mfa.listFactors.mockResolvedValue(ok(TWO));
    mount();
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar Tableta' }));
    expect(confirmState.current).toMatchObject({
      title: '¿Quitar «Tableta»?',
      confirmLabel: 'Quitar dispositivo',
      danger: true,
    });
    confirmState.answer(false);
    await settle();
    expect(mfa.beginChallenge).not.toHaveBeenCalled();
    expect(mfa.removeFactor).not.toHaveBeenCalled();
  });

  it('confirmed, it takes a fresh code before removing, then reloads and reports', async () => {
    mfa.listFactors.mockResolvedValue(ok(TWO));
    mfa.removeFactor.mockResolvedValue(ok(undefined));
    const { onChanged } = mount();
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar Tableta' }));
    confirmState.answer(true);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Confirma que eres tú' })).toBeInTheDocument();
    expect(mfa.beginChallenge).toHaveBeenCalledTimes(1);
    expect(mfa.removeFactor).not.toHaveBeenCalled();

    mfa.listFactors.mockResolvedValue(ok([TWO[0]]));
    await enterCode('654321');
    expect(mfa.submitCode).toHaveBeenCalledWith('654321');
    expect(mfa.removeFactor).toHaveBeenCalledWith('f-2');
    expect(toasts()).toEqual([['success', 'Dispositivo quitado']]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Tableta')).toBeNull();
  });

  it('a step-up that is cancelled removes nothing', async () => {
    mfa.listFactors.mockResolvedValue(ok(TWO));
    mount();
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar Tableta' }));
    confirmState.answer(true);
    await settle();
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );
    await settle();
    expect(mfa.removeFactor).not.toHaveBeenCalled();
  });

  it('a refused removal is a toast, and the list is read again', async () => {
    mfa.listFactors.mockResolvedValue(ok(TWO));
    mfa.removeFactor.mockResolvedValue(
      authFailure(null, 'Debes conservar al menos un dispositivo de verificación.'),
    );
    const { onChanged } = mount();
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar Tableta' }));
    confirmState.answer(true);
    await settle();
    await enterCode('654321');
    expect(toasts()).toEqual([
      ['error', 'Debes conservar al menos un dispositivo de verificación.'],
    ]);
    expect(mfa.listFactors).toHaveBeenCalledTimes(2);
    expect(onChanged).not.toHaveBeenCalled();
  });

  describe('adding a device', () => {
    const ENROLLMENT = {
      factorId: 'f-new',
      qrCode: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/IRD:ana@example.org?secret=JBSWY3DPEHPK3PXP',
    };

    let writeText: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      writeText = vi.fn(async () => {});
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
    });

    async function open(): Promise<HTMLElement> {
      await settle();
      await fireEvent.click(screen.getByRole('button', { name: 'Agregar dispositivo' }));
      await settle();
      return screen.getByRole('dialog', { name: 'Agregar un dispositivo' });
    }

    it('shows the steps, the QR with alt text, the secret in blocks and a code field', async () => {
      mfa.beginEnroll.mockResolvedValue(ok(ENROLLMENT));
      mount();
      const dialog = await open();
      expect(mfa.beginEnroll).toHaveBeenCalledTimes(1);
      const qr = within(dialog).getByRole('img', { name: /Código QR/ }) as HTMLImageElement;
      expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
      expect(within(dialog).getByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Código de verificación')).toHaveAttribute(
        'autocomplete',
        'one-time-code',
      );
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    });

    it('copies the raw secret', async () => {
      mfa.beginEnroll.mockResolvedValue(ok(ENROLLMENT));
      mount();
      const dialog = await open();
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar clave' }));
      await settle();
      expect(writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');
      expect(toasts()).toEqual([['success', 'Clave copiada']]);
    });

    it('a copy the browser refuses says how to do it by hand', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      mfa.beginEnroll.mockResolvedValue(ok(ENROLLMENT));
      mount();
      const dialog = await open();
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar clave' }));
      await settle();
      expect(toasts()).toEqual([
        ['error', 'No pudimos copiar la clave. Selecciónala y cópiala a mano.'],
      ]);
    });

    it('the right code adds it: closed, said, reloaded, reported', async () => {
      mfa.beginEnroll.mockResolvedValue(ok(ENROLLMENT));
      const { onChanged } = mount();
      await open();
      mfa.listFactors.mockResolvedValue(ok(TWO));
      await enterCode('112233');
      expect(mfa.submitCode).toHaveBeenCalledWith('112233');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(toasts()).toEqual([['success', 'Dispositivo agregado']]);
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Tableta')).toBeInTheDocument();
      expect(mfa.cancelEnroll).not.toHaveBeenCalled();
    });

    it('cancelling abandons the half-made factor', async () => {
      mfa.beginEnroll.mockResolvedValue(ok(ENROLLMENT));
      mount();
      const dialog = await open();
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await settle();
      expect(mfa.cancelEnroll).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('a failure to start is an error with Retry inside the dialog', async () => {
      mfa.beginEnroll.mockResolvedValueOnce(authFailure(null, 'Sin conexión.', 'network'));
      mfa.beginEnroll.mockResolvedValueOnce(ok(ENROLLMENT));
      mount();
      const dialog = await open();
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Sin conexión.');
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Reintentar' }));
      await settle();
      expect(within(dialog).getByRole('img', { name: /Código QR/ })).toBeInTheDocument();
    });
  });
});

/* ── SignInMethods ─────────────────────────────────────────────────────── */

describe('SignInMethods', () => {
  it('lists the methods read-only, with the linking note', () => {
    render(SignInMethods, {
      props: {
        identities: [
          identityFixture('google', { last_sign_in_at: '2026-10-18T12:00:00Z' }),
          identityFixture('email'),
        ],
      },
    });
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Correo y contraseña'),
      expect.stringContaining('Google'),
    ]);
    expect(within(items[1]).getByText(/Último uso: .*2026/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Google o Microsoft se vinculan solos cuando su correo coincide con el tuyo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

/* ── SecuritySection ───────────────────────────────────────────────────── */

describe('SecuritySection', () => {
  function mount() {
    return render(SecuritySection, { props: { user: userFixture() } });
  }

  async function changePassword(): Promise<void> {
    auth.updatePassword.mockResolvedValue(ok(undefined));
    await type(screen.getByLabelText(/^Nueva contraseña/), 'Una frase larga 2026');
    await type(screen.getByLabelText(/^Confirma la nueva contraseña/), 'Una frase larga 2026');
    await fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await settle();
  }

  it('is the "Seguridad" region with its four panels', async () => {
    mount();
    await settle();
    expect(screen.getByRole('region', { name: 'Seguridad' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim())).toEqual([
      'Contraseña',
      'Verificación en dos pasos',
      'Métodos de inicio de sesión',
      'Sesiones',
    ]);
  });

  it('offers to close the other sessions after a password change, and does it', async () => {
    mount();
    await settle();
    expect(screen.queryByText('¿Cerrar sesión en tus otros dispositivos?')).toBeNull();
    await changePassword();
    expect(screen.getByText('¿Cerrar sesión en tus otros dispositivos?')).toBeInTheDocument();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar sesión en otros dispositivos' }),
    );
    await settle();
    expect(sessionFake.signOut).toHaveBeenCalledWith('others');
    expect(toasts()).toContainEqual(['success', 'Cerramos tu sesión en tus otros dispositivos.']);
    expect(screen.queryByText('¿Cerrar sesión en tus otros dispositivos?')).toBeNull();
  });

  it('the offer can be dismissed, and a failed sign-out keeps it with a toast', async () => {
    sessionFake.signOut.mockResolvedValueOnce(authFailure(null, 'Sin conexión.', 'network'));
    mount();
    await settle();
    await changePassword();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar sesión en otros dispositivos' }),
    );
    await settle();
    expect(toasts()).toContainEqual(['error', 'Sin conexión.']);
    expect(screen.getByText('¿Cerrar sesión en tus otros dispositivos?')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByText('¿Cerrar sesión en tus otros dispositivos?')).toBeNull();
  });

  it('offers it after a device change too', async () => {
    mfa.listFactors.mockResolvedValue(ok([device('f-1', 'Uno'), device('f-2', 'Dos')]));
    mfa.removeFactor.mockResolvedValue(ok(undefined));
    mount();
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar Dos' }));
    confirmState.answer(true);
    await settle();
    await enterCode('123456');
    expect(screen.getByText('¿Cerrar sesión en tus otros dispositivos?')).toBeInTheDocument();
  });

  it('"Cerrar sesión en todos los dispositivos" asks first; No signs nobody out', async () => {
    mount();
    await settle();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }),
    );
    expect(confirmState.current).toMatchObject({
      title: '¿Cerrar sesión en todos los dispositivos?',
      danger: true,
    });
    confirmState.answer(false);
    await settle();
    expect(sessionFake.signOut).not.toHaveBeenCalled();
    expect(nav.goto).not.toHaveBeenCalled();
  });

  it('confirmed, it signs out everywhere and goes to the sign-in page', async () => {
    sessionFake.signOut.mockImplementation(async () => {
      setSession({ status: 'signed-out', user: null, profile: null });
      return ok(undefined);
    });
    mount();
    await settle();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }),
    );
    confirmState.answer(true);
    await settle();
    expect(sessionFake.signOut).toHaveBeenCalledWith('global');
    expect(toasts()).toContainEqual(['success', 'Cerraste tu sesión en todos tus dispositivos.']);
    expect(nav.goto).toHaveBeenCalledWith('/admin/acceso/', { replace: true });
  });

  it('a server that did not confirm: signed out here anyway, told so, sent to sign in', async () => {
    sessionFake.signOut.mockImplementation(async () => {
      setSession({ status: 'signed-out', user: null, profile: null });
      return authFailure(null, 'Sin conexión.', 'network');
    });
    mount();
    await settle();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }),
    );
    confirmState.answer(true);
    await settle();
    expect(toasts()).toContainEqual([
      'error',
      expect.stringContaining('no pudimos confirmar el cierre en tus otros dispositivos'),
    ]);
    expect(nav.goto).toHaveBeenCalledWith('/admin/acceso/', { replace: true });
  });

  it('nothing ended at all: a toast, and the page stays', async () => {
    sessionFake.signOut.mockResolvedValue(authFailure(null, 'Tu sesión expiró.', 'auth'));
    mount();
    await settle();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }),
    );
    confirmState.answer(true);
    await settle();
    expect(toasts()).toEqual([['error', 'Tu sesión expiró.']]);
    expect(nav.goto).not.toHaveBeenCalled();
  });
});
