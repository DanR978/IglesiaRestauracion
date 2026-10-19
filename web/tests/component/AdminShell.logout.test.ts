// S37 — signing out on purpose: the sidebar's logout asks first, then
// signOutAndLeave('local') ends this device's session and leaves for the
// sign-in page with the "Sesión cerrada." notice — and the shell does not
// also send the visit to sign in again with `next` when the status turns
// signed-out under it. signOutAndLeave() is S45's path too. Its flag is module
// state (the page leaves right after), hence a file of its own: every test
// file gets fresh modules. Base '' (the $app/paths stub).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SURFACES } from '#lib/auth/surfaces.js';
import { leaveTo } from '#lib/components/admin/shell/shell.js';
import { signOutAndLeave, signingOut } from '#lib/components/admin/shell/sign-out.svelte.js';
import { confirmState } from '#lib/stores/confirm.svelte.js';
import { resetPage } from '../stubs/app-state.svelte';
import AdminShellHarness from './fixtures/AdminShellHarness.svelte';

const stores = vi.hoisted(async () => import('./fixtures/shell-stores.svelte'));

vi.mock('#lib/stores/session.svelte.js', async () => (await stores).sessionModule);
vi.mock('#lib/stores/perms.svelte.js', async () => (await stores).permsModule);
vi.mock('#lib/components/admin/shell/shell.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/components/admin/shell/shell.js')>()),
  leaveTo: vi.fn(),
}));

const { shell, signOut, resetShell } = await stores;

beforeEach(() => {
  resetShell({
    nav: SURFACES.filter((s) => s.ported),
    legacy: SURFACES.filter((s) => !s.ported),
  });
  resetPage('/admin/cuenta/');
  vi.mocked(leaveTo).mockClear();
  // As the real store does: signing out turns the status `signed-out`.
  signOut.mockImplementation(async () => {
    shell.status = 'signed-out';
    return { ok: true, data: undefined };
  });
});

afterEach(() => {
  confirmState.cancelAll();
});

describe('logout', () => {
  it('cancelling keeps the session', async () => {
    render(AdminShellHarness);

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cerrar sesión?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(signOut).not.toHaveBeenCalled();
    expect(leaveTo).not.toHaveBeenCalled();
    expect(signingOut.current).toBe(false);
  });

  it('asks first, then signs this device out and leaves for the sign-in page with the notice', async () => {
    render(AdminShellHarness);

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cerrar sesión?' });
    expect(signOut).not.toHaveBeenCalled();

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(leaveTo).toHaveBeenCalled());
    expect(signOut).toHaveBeenCalledExactlyOnceWith('local');
    // Only the notice URL — not the guard's sign-in with `next=/admin/cuenta/`.
    expect(vi.mocked(leaveTo).mock.calls).toEqual([['/admin/acceso/?aviso=sesion-cerrada']]);
    expect(signingOut.current).toBe(true);
  });
});

describe('signOutAndLeave (S45: every device)', () => {
  it('signs every device out and leaves with the same notice, even when the server is unreachable', async () => {
    signOut.mockImplementation(async () => {
      shell.status = 'signed-out';
      return { ok: false, error: { kind: 'network', message: 'Sin conexión.' } };
    });

    await signOutAndLeave('global');

    expect(signOut).toHaveBeenCalledExactlyOnceWith('global');
    expect(vi.mocked(leaveTo).mock.calls).toEqual([['/admin/acceso/?aviso=sesion-cerrada']]);
    expect(signingOut.current).toBe(true);
  });
});
