// S39 — acceso/recuperar/ under jsdom with the auth module mocked. PORT-DEBT
// S39 PRESERVE: the answer never says whether the account exists — the one
// non-committal sentence for every outcome but too many attempts and no
// connection. The email arrives from the sign-in page in memory and goes back
// the same way (WCAG 3.3.7).
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/auth/session.js', () => import('./mocks').then((m) => m.auth));

import RecoverPage from '../../../src/routes/(admin)/admin/acceso/recuperar/+page.svelte';
import { carriedEmail, carryEmail } from '#lib/components/admin/auth/handoff.js';
import { auth, failure, resetMocks } from './mocks';

const SENT = 'Si la cuenta existe, te enviamos un enlace para restablecer tu contraseña.';
const emailInput = () => screen.getByLabelText('Correo electrónico') as HTMLInputElement;
const form = () => emailInput().form as HTMLFormElement;

async function send(email: string): Promise<void> {
  await fireEvent.input(emailInput(), { target: { value: email } });
  await fireEvent.submit(form());
}

beforeEach(() => {
  resetMocks();
  carryEmail('');
});

describe('recuperar/', () => {
  it('names itself and arrives with the email typed on the sign-in page', () => {
    carryEmail('ana@example.org');
    render(RecoverPage);
    expect(
      screen.getByRole('heading', { level: 1, name: '¿Olvidaste tu contraseña?' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('¿Olvidaste tu contraseña? · Panel · Iglesia Restauración Divina');
    expect(emailInput().value).toBe('ana@example.org');
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'username');
  });

  it('validates in Spanish before sending', async () => {
    render(RecoverPage);
    await fireEvent.submit(form());
    expect(screen.getByText('Escribe tu correo electrónico.')).toBeInTheDocument();
    await send('ana@');
    expect(
      screen.getByText('Escribe un correo electrónico válido, por ejemplo nombre@ejemplo.com.'),
    ).toBeInTheDocument();
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('sent: the non-committal answer', async () => {
    render(RecoverPage);
    await send('ana@example.org');
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('ana@example.org');
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
  });

  it.each([
    ['an address GoTrue refuses', failure('invalid', 'x', 'email_address_invalid')],
    ['a mail it could not send', failure('forbidden', 'x', 'email_address_not_authorized')],
    ['any other refusal', failure('unknown', 'x', 'unexpected_failure')],
  ])('%s: the same answer, so nothing is revealed', async (_label, answer) => {
    auth.requestPasswordReset.mockResolvedValue(answer);
    render(RecoverPage);
    await send('nadie@example.org');
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [
      'too many attempts',
      failure(
        'unknown',
        'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        'over_email_send_rate_limit',
      ),
    ],
    [
      'no connection',
      failure(
        'network',
        'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      ),
    ],
  ])('%s: says so, since it reveals nothing', async (_label, answer) => {
    auth.requestPasswordReset.mockResolvedValue(answer);
    render(RecoverPage);
    await send('ana@example.org');
    expect(await screen.findByRole('alert')).toHaveTextContent(answer.error.message);
    expect(screen.queryByText(SENT)).not.toBeInTheDocument();
  });

  it('"Volver a iniciar sesión" takes the email back, in memory', async () => {
    render(RecoverPage);
    await fireEvent.input(emailInput(), { target: { value: 'ana@example.org' } });
    const back = screen.getByRole('link', { name: 'Volver a iniciar sesión' });
    expect(back).toHaveAttribute('href', '/admin/acceso/');
    back.addEventListener('click', (event) => event.preventDefault());
    await fireEvent.click(back);
    expect(carriedEmail()).toBe('ana@example.org');
  });
});
