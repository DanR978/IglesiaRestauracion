// S37 — <AdminShell> under BASE_PATH=/app, how the port ships until the
// cutover (D-008): every admin link carries the base, except "Abrir panel
// actual", which goes to the legacy panel at the domain root — /admin/, never
// /app/admin/ (the new admin's own Inicio). AdminShell.test.ts covers base ''.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SURFACES } from '#lib/auth/surfaces.js';
import { leaveTo } from '#lib/components/admin/shell/shell.js';
import { confirmState } from '#lib/stores/confirm.svelte.js';
// The $app/state stand-in itself (vitest.config aliases $app/state to it).
import { resetPage } from '../stubs/app-state.svelte';
import AdminShellHarness from './fixtures/AdminShellHarness.svelte';

vi.mock('$app/paths', async () => (await import('../helpers/app-paths')).pathsAt('/app'));

const stores = vi.hoisted(async () => import('./fixtures/shell-stores.svelte'));

vi.mock('#lib/stores/session.svelte.js', async () => (await stores).sessionModule);
vi.mock('#lib/stores/perms.svelte.js', async () => (await stores).permsModule);
vi.mock('#lib/components/admin/shell/shell.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/components/admin/shell/shell.js')>()),
  leaveTo: vi.fn(),
}));

const { shell, resetShell } = await stores;

const nav = () => screen.getByRole('navigation', { name: 'Navegación del panel' });

beforeEach(() => {
  resetShell({
    nav: SURFACES.filter((s) => s.ported),
    legacy: SURFACES.filter((s) => !s.ported),
  });
  resetPage('/app/admin/');
  vi.mocked(leaveTo).mockClear();
});

afterEach(() => {
  confirmState.cancelAll();
});

describe('AdminShell at base /app', () => {
  it('links the ported surfaces under /app and marks the open one', () => {
    render(AdminShellHarness);

    const inicio = within(nav()).getByRole('link', { name: 'Inicio' });
    expect(inicio).toHaveAttribute('href', '/app/admin/');
    expect(inicio).toHaveAttribute('aria-current', 'page');
    expect(within(nav()).getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute(
      'href',
      '/app/admin/cuenta/',
    );
  });

  it('sends "Abrir panel actual" to the legacy panel at the site root, outside the base', () => {
    render(AdminShellHarness);

    expect(within(nav()).getByRole('link', { name: 'Abrir panel actual' })).toHaveAttribute(
      'href',
      '/admin/',
    );
  });

  it('logout leaves for /app/admin/acceso/ with the notice', async () => {
    render(AdminShellHarness);

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cerrar sesión?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() =>
      expect(leaveTo).toHaveBeenCalledWith('/app/admin/acceso/?aviso=sesion-cerrada'),
    );
  });

  it('the expired screen comes back to the page under /app', () => {
    resetPage('/app/admin/cuenta/');
    render(AdminShellHarness);

    shell.status = 'expired';
    flushSync();

    expect(screen.getByRole('link', { name: 'Iniciar sesión de nuevo' })).toHaveAttribute(
      'href',
      '/app/admin/acceso/?next=%2Fapp%2Fadmin%2Fcuenta%2F&aviso=sesion-expirada',
    );
  });
});
