// S39 — acceso/ (sign in) under jsdom with the auth module mocked: the
// heading and title, autocomplete, Spanish validation, GoTrue's refusals as
// an Alert, the second-factor routing after a sign-in, an existing session
// moving on, the notices, the provider buttons (only when enabled, after the
// form) and the email carried to recuperar/ in memory.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/auth/session.js', () => import('./mocks').then((m) => m.auth));
vi.mock('#lib/auth/next.js', () => import('./mocks').then((m) => m.next));
vi.mock('#lib/stores/session.svelte.js', () =>
  import('./mocks').then((m) => ({ session: m.store })),
);
vi.mock('$app/navigation', () => import('./mocks').then((m) => m.nav));

import LoginPage from '../../../src/routes/(admin)/admin/acceso/+page.svelte';
import { carriedEmail, carryEmail } from '#lib/components/admin/auth/handoff.js';
import { auth, failure, lastGoto, nav, openAt, resetMocks, settlesTo, store } from './mocks';

const emailInput = () => screen.getByLabelText('Correo electrónico') as HTMLInputElement;
const passwordInput = () => screen.getByLabelText('Contraseña') as HTMLInputElement;
const form = () => emailInput().form as HTMLFormElement;

async function fill(email: string, password: string): Promise<void> {
  await fireEvent.input(emailInput(), { target: { value: email } });
  await fireEvent.input(passwordInput(), { target: { value: password } });
}

beforeEach(() => {
  resetMocks();
  carryEmail('');
  openAt('/admin/acceso/');
});

afterEach(() => vi.restoreAllMocks());

describe('acceso/ — the page', () => {
  it('names itself: a focused h1 and the tab title', async () => {
    render(LoginPage);
    const heading = screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.title).toBe('Iniciar sesión · Panel · Iglesia Restauración Divina');
  });

  it('labels its fields with the autocomplete password managers expect', () => {
    render(LoginPage);
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'username');
    expect(passwordInput()).toHaveAttribute('type', 'password');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password');
    expect(form()).toHaveAttribute('novalidate');
  });

  it('links "¿Olvidaste tu contraseña?" to recuperar/, with nothing in the URL', () => {
    render(LoginPage);
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/admin/acceso/recuperar/',
    );
  });
});

describe('acceso/ — validation', () => {
  it('asks for the email first, focuses it, and sends nothing', async () => {
    render(LoginPage);
    await fireEvent.submit(form());
    expect(screen.getByText('Escribe tu correo electrónico.')).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(emailInput());
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('refuses an address that is not one', async () => {
    render(LoginPage);
    await fill('ana@ejemplo', 'clave');
    await fireEvent.submit(form());
    expect(
      screen.getByText('Escribe un correo electrónico válido, por ejemplo nombre@ejemplo.com.'),
    ).toBeInTheDocument();
  });

  it('asks for the password and focuses it', async () => {
    render(LoginPage);
    await fill('ana@example.org', '');
    await fireEvent.submit(form());
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(document.activeElement).toBe(passwordInput());
  });

  it('clears a field error as soon as the field is edited', async () => {
    render(LoginPage);
    await fireEvent.submit(form());
    await fireEvent.input(emailInput(), { target: { value: 'a' } });
    expect(screen.queryByText('Escribe tu correo electrónico.')).not.toBeInTheDocument();
  });
});

describe('acceso/ — signing in', () => {
  it('shows a refusal as an Alert, by its Spanish copy', async () => {
    auth.signInWithPassword.mockResolvedValue(
      failure('auth', 'Correo o contraseña incorrectos.', 'invalid_credentials'),
    );
    render(LoginPage);
    await fill('ana@example.org', 'mala');
    await fireEvent.submit(form());
    expect(auth.signInWithPassword).toHaveBeenCalledWith('ana@example.org', 'mala');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).not.toHaveAttribute('aria-busy');
  });

  it('is busy while the request is out, and ignores a second submit', async () => {
    let finish: (value: unknown) => void = () => {};
    auth.signInWithPassword.mockReturnValue(new Promise((done) => (finish = done)));
    render(LoginPage);
    await fill('ana@example.org', 'clave-segura');
    await fireEvent.submit(form());
    await fireEvent.submit(form());
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute('aria-busy', 'true');
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
    finish(failure('network', 'No pudimos conectar con el servidor.'));
  });

  it('goes on to the second factor, keeping `next` (D-033)', async () => {
    openAt('/admin/acceso/?next=%2Fadmin%2Fcuenta%2F');
    settlesTo('needs-mfa');
    render(LoginPage);
    await fill('ana@example.org', 'clave-segura');
    await fireEvent.submit(form());
    await waitFor(() =>
      expect(nav.goto).toHaveBeenCalledWith('/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F', {
        replace: true,
      }),
    );
  });

  it('a first sign-in goes to verificar/ to set up the authenticator', async () => {
    settlesTo('needs-enroll');
    render(LoginPage);
    await fill('ana@example.org', 'clave-segura');
    await fireEvent.submit(form());
    await waitFor(() => expect(lastGoto()).toBe('/admin/acceso/verificar/'));
  });

  it('an account with no access goes to sin-acceso/', async () => {
    settlesTo('forbidden');
    render(LoginPage);
    await fill('ana@example.org', 'clave-segura');
    await fireEvent.submit(form());
    await waitFor(() => expect(lastGoto()).toBe('/admin/acceso/sin-acceso/'));
  });

  it('a session that could not be read stays here with the error', async () => {
    store.settled.mockImplementation(async () => {
      store.status = 'error';
      store.error = { kind: 'network', message: 'No pudimos conectar con el servidor.' };
    });
    render(LoginPage);
    await fill('ana@example.org', 'clave-segura');
    await fireEvent.submit(form());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor.',
    );
    expect(nav.goto).not.toHaveBeenCalled();
  });

  it('a session that already exists moves on at once', async () => {
    openAt('/admin/acceso/?next=%2Fadmin%2Fcuenta%2F');
    store.status = 'ready';
    render(LoginPage);
    await waitFor(() => expect(nav.goto).toHaveBeenCalledWith('/admin/cuenta/', { replace: true }));
  });

  it('an outside `next` is never followed', async () => {
    openAt('/admin/acceso/?next=https%3A%2F%2Fevil.example%2F');
    store.status = 'ready';
    render(LoginPage);
    await waitFor(() => expect(lastGoto()).toBe('/admin/'));
  });
});

describe('acceso/ — notices', () => {
  it('"Sesión cerrada." after the shell signs out', () => {
    openAt('/admin/acceso/?aviso=sesion-cerrada');
    render(LoginPage);
    expect(screen.getByRole('status')).toHaveTextContent('Sesión cerrada.');
  });

  it('"Tu sesión expiró…" for a session the store saw end unasked', () => {
    store.status = 'expired';
    render(LoginPage);
    expect(screen.getByRole('status')).toHaveTextContent(/^Advertencia: Tu sesión expiró\./);
  });

  it('none on a plain visit', () => {
    render(LoginPage);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('acceso/ — Google and Microsoft (D-035)', () => {
  it('shows nothing while the providers are unknown, or when none is on', async () => {
    render(LoginPage);
    await waitFor(() => expect(auth.fetchEnabledProviders).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Continuar con/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/abre esta página en Safari o Chrome/)).not.toBeInTheDocument();
  });

  it('offers the enabled ones after the form, with the in-app browser hint', async () => {
    auth.fetchEnabledProviders.mockResolvedValue(['google', 'azure']);
    render(LoginPage);
    const google = await screen.findByRole('button', { name: 'Continuar con Google' });
    const microsoft = screen.getByRole('button', { name: 'Continuar con Microsoft' });
    expect(
      screen.getByText(
        'Si Google o Microsoft no te dejan entrar desde otra app, abre esta página en Safari o Chrome.',
      ),
    ).toBeInTheDocument();
    // After the form in document order: nothing above the form moves when they arrive.
    expect(form().compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(microsoft).toBeInTheDocument();
  });

  it('starts the provider with `next`', async () => {
    openAt('/admin/acceso/?next=%2Fadmin%2Fcuenta%2F');
    auth.fetchEnabledProviders.mockResolvedValue(['google']);
    render(LoginPage);
    const google = await screen.findByRole('button', { name: 'Continuar con Google' });
    await waitFor(() => expect(store.ready).toHaveBeenCalled());
    await fireEvent.click(google);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith('google', { next: '/admin/cuenta/' });
  });

  it('reserves nothing while the answer is pending', async () => {
    auth.fetchEnabledProviders.mockReturnValue(new Promise(() => {}));
    render(LoginPage);
    await waitFor(() => expect(auth.fetchEnabledProviders).toHaveBeenCalled());
    expect(document.querySelector('.providers')).toBeNull();
  });

  it('a page restored from the back/forward cache is usable again', async () => {
    auth.fetchEnabledProviders.mockResolvedValue(['google']);
    render(LoginPage);
    const google = await screen.findByRole('button', { name: 'Continuar con Google' });
    await fireEvent.click(google);
    expect(google).toHaveAttribute('aria-busy', 'true');
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);
    await waitFor(() => expect(google).not.toHaveAttribute('aria-busy'));
  });

  it('a start that fails before leaving shows why', async () => {
    auth.fetchEnabledProviders.mockResolvedValue(['azure']);
    auth.signInWithOAuth.mockResolvedValue(
      failure('invalid', 'Ese método de acceso no está disponible.'),
    );
    render(LoginPage);
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar con Microsoft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese método de acceso no está disponible.',
    );
  });
});

describe('acceso/ — the email, carried (WCAG 3.3.7)', () => {
  it('goes to recuperar/ in memory when the link is followed', async () => {
    render(LoginPage);
    await fireEvent.input(emailInput(), { target: { value: 'ana@example.org' } });
    const link = screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' });
    link.addEventListener('click', (event) => event.preventDefault());
    await fireEvent.click(link);
    expect(carriedEmail()).toBe('ana@example.org');
    expect(link.getAttribute('href')).not.toContain('ana');
  });

  it('comes back filled in', () => {
    carryEmail('ana@example.org');
    render(LoginPage);
    expect(emailInput().value).toBe('ana@example.org');
  });
});
