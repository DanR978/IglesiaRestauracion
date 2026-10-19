// S39 — acceso/sin-acceso/ under jsdom with the session store mocked: a
// signed-in account with no profile or an unknown role is told so plainly
// and may sign out; every other status moves on.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/stores/session.svelte.js', () =>
  import('./mocks').then((m) => ({ session: m.store })),
);
vi.mock('#lib/components/admin/shell/sign-out.svelte.js', () =>
  import('./mocks').then((m) => m.shell),
);
vi.mock('$app/navigation', () => import('./mocks').then((m) => m.nav));

import NoAccessPage from '../../../src/routes/(admin)/admin/acceso/sin-acceso/+page.svelte';
import { lastGoto, nav, resetMocks, shell, store } from './mocks';

beforeEach(resetMocks);

describe('sin-acceso/', () => {
  it('explains, names the account, and offers to sign out', async () => {
    store.status = 'forbidden';
    store.user = { email: 'ana@example.org' };
    render(NoAccessPage);
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Tu cuenta no tiene acceso al panel',
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText('ana@example.org')).toBeInTheDocument();
    expect(screen.getByText(/pide al administrador que revise tu cuenta/)).toBeInTheDocument();

    // The shell's way out: this device only, then a reload into the sign-in page.
    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(shell.signOutAndLeave).toHaveBeenCalledWith('local');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(nav.goto).not.toHaveBeenCalled();
  });

  it.each([
    ['signed-out', '/admin/acceso/'],
    ['expired', '/admin/acceso/'],
    ['needs-mfa', '/admin/acceso/verificar/'],
    ['ready', '/admin/'],
  ] as const)('%s moves on to %s', async (status, to) => {
    store.status = status;
    render(NoAccessPage);
    await waitFor(() => expect(lastGoto()).toBe(to));
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('a session that could not be read offers Retry', async () => {
    store.status = 'error';
    store.error = { kind: 'network', message: 'No pudimos conectar con el servidor.' };
    store.retry.mockImplementation(async () => {
      store.status = 'forbidden';
    });
    render(NoAccessPage);
    await fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tu cuenta no tiene acceso al panel' }),
    ).toBeInTheDocument();
  });
});
