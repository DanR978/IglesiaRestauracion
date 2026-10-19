// S37 — <AdminShell> under jsdom, at base '' (the $app/paths stub): the
// landmarks and the skip link, the grouped nav with aria-current, the one
// legacy link, the account footer, the drawer at ≤900px (a shallow history
// entry: aria-expanded, focus moved in / trapped / returned, Escape, scrim,
// "Cerrar menú", Back, a nav pick), the expired screen, the error state with
// Retry, and leaving when the session turns away mid-page. Logout is in
// AdminShell.logout.test.ts (its flag is module state). The S38 stores are
// stand-ins (fixtures/shell-stores); $app/state and $app/navigation are the
// tests/stubs; leaveTo (a full page load) is a spy.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushState } from '$app/navigation';
import { SURFACES } from '#lib/auth/surfaces.js';
import { actionSheet, showActionSheet } from '#lib/components/action-sheet.svelte.js';
import { leaveTo } from '#lib/components/admin/shell/shell.js';
import { focusTrapDepth } from '#lib/focus-trap.js';
import { bodyScrollLockDepth } from '#lib/scroll-lock.js';
import { confirmState } from '#lib/stores/confirm.svelte.js';
// The $app/state stand-in itself (vitest.config aliases $app/state to it).
import { page, resetPage } from '../stubs/app-state.svelte';
import AdminShellHarness from './fixtures/AdminShellHarness.svelte';

const stores = vi.hoisted(async () => import('./fixtures/shell-stores.svelte'));

vi.mock('#lib/stores/session.svelte.js', async () => (await stores).sessionModule);
vi.mock('#lib/stores/perms.svelte.js', async () => (await stores).permsModule);
vi.mock('#lib/components/admin/shell/shell.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/components/admin/shell/shell.js')>()),
  leaveTo: vi.fn(),
}));

const { shell, retry, resetShell } = await stores;

const NAV = SURFACES.filter((s) => s.ported);
const LEGACY = SURFACES.filter((s) => !s.ported);

/** The viewport the drawer media query sees: ≤900px or wider. */
function viewport(compact: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 900px)' ? compact : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** Back, as the browser plays it: the drawer's shallow entry gives way to the one before. */
function goBack(): void {
  page.state = {};
}

/** Press a key on whatever has focus, so it propagates like a real one. */
function press(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  return fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
}

const isInert = (el: Element | null) => (el as HTMLElement & { inert?: boolean }).inert === true;

const burger = () => screen.getByRole('button', { name: 'Abrir menú' });
const drawer = () => screen.getByRole('dialog', { name: 'Menú del panel' });
const navLink = (name: string | RegExp) =>
  within(screen.getByRole('navigation', { name: 'Navegación del panel' })).getByRole('link', {
    name,
  });

beforeEach(() => {
  resetShell({ nav: NAV, legacy: LEGACY });
  resetPage('/admin/');
  viewport(false);
  vi.mocked(leaveTo).mockClear();
  vi.mocked(pushState).mockClear();
  vi.spyOn(history, 'back').mockImplementation(goBack);
  document.body.style.overflow = '';
});

afterEach(() => {
  confirmState.cancelAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminShell — landmarks, title, skip link', () => {
  it('skips to <main id="contenido">, and has the banner, the nav and the main', () => {
    render(AdminShellHarness);

    const skip = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(skip).toHaveAttribute('href', '#contenido');
    // The skip link is the first stop in the tab order.
    expect(document.body.querySelector('a, button, input')).toBe(skip);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'contenido');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(within(main).getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación del panel' })).toBeInTheDocument();
  });

  it("puts the page's title in the tab and in the topbar (hidden from assistive tech)", () => {
    render(AdminShellHarness);

    expect(document.title).toBe('Inicio · Panel · Iglesia Restauración Divina');
    const title = screen.getByRole('banner').querySelector('.adm-topbar__title');
    expect(title).toHaveTextContent('Inicio');
    expect(title).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('AdminShell — navigation', () => {
  it('lists the ported surfaces by group, the open page marked aria-current="page"', () => {
    render(AdminShellHarness);

    const principal = screen.getByRole('list', { name: 'Principal' });
    const links = within(principal).getAllByRole('link');
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Inicio', 'Mi cuenta']);
    expect(navLink('Inicio')).toHaveAttribute('href', '/admin/');
    expect(navLink('Mi cuenta')).toHaveAttribute('href', '/admin/cuenta/');
    expect(navLink('Inicio')).toHaveAttribute('aria-current', 'page');
    expect(navLink('Mi cuenta')).not.toHaveAttribute('aria-current');
    // Only the groups with something in them.
    expect(screen.queryByRole('list', { name: 'Finanzas' })).toBeNull();
  });

  it('follows the open page: Inicio is current on itself only', () => {
    render(AdminShellHarness);

    page.url = new URL('http://localhost/admin/cuenta/');
    flushSync();
    expect(navLink('Mi cuenta')).toHaveAttribute('aria-current', 'page');
    expect(navLink('Inicio')).not.toHaveAttribute('aria-current');
  });

  it('ends with ONE link to the legacy panel at /admin/, described by its hint', () => {
    render(AdminShellHarness);

    const legacy = navLink('Abrir panel actual');
    expect(legacy).toHaveAttribute('href', '/admin/');
    // A full page load, never the client router.
    expect(legacy).toHaveAttribute('rel', 'external');
    expect(legacy).toHaveAccessibleDescription('Las demás secciones siguen en el panel actual.');
    expect(screen.getAllByRole('link', { name: 'Abrir panel actual' })).toHaveLength(1);
  });

  it('leaves the legacy link out when the account has nothing left there', () => {
    shell.legacy = [];
    render(AdminShellHarness);

    expect(screen.queryByRole('link', { name: 'Abrir panel actual' })).toBeNull();
  });

  it('shows a count in a nav item through the badge slot, inside the link', () => {
    render(AdminShellHarness, { props: { badge: 'cuenta' } });

    const badge = screen.getByTestId('nav-badge');
    expect(navLink(/^Mi cuenta\s*3\s*pendientes$/)).toContainElement(badge);
    expect(navLink('Inicio')).not.toContainElement(badge);
  });
});

describe('AdminShell — the account footer', () => {
  it('shows the display name, the role in Spanish and the avatar beside them', () => {
    render(AdminShellHarness);

    const nav = screen.getByRole('navigation', { name: 'Navegación del panel' });
    const footer = nav.parentElement?.querySelector('.adm-account') as HTMLElement;
    expect(footer).toHaveTextContent('Ana Pérez');
    expect(footer).toHaveTextContent('Administrador');
    // Decorative: the name is right there.
    expect(footer.querySelector('.ird-avatar')).toHaveAttribute('aria-hidden', 'true');
    expect(within(footer).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('falls back to the address when the profile has no name', () => {
    shell.profile = { display_name: '  ', avatar_url: null };
    render(AdminShellHarness);

    expect(document.body.querySelector('.adm-account__name')).toHaveTextContent('ana@example.org');
  });
});

describe('AdminShell — the drawer (≤900px)', () => {
  beforeEach(() => viewport(true));

  it('the burger opens it with a history entry, as a modal dialog that holds focus', async () => {
    render(AdminShellHarness);
    const menu = burger();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    // Closed, its links are out of the tab order and the accessibility tree.
    // (The `inert` property: jsdom does not reflect it to the attribute.)
    const sidebar = document.getElementById(menu.getAttribute('aria-controls') ?? '');
    expect(isInert(sidebar)).toBe(true);

    await fireEvent.click(menu);

    expect(pushState).toHaveBeenCalledExactlyOnceWith('', { drawer: true });
    const panel = drawer();
    expect(panel).toBe(sidebar);
    expect(isInert(panel)).toBe(false);
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveAttribute('aria-controls', panel.id);
    expect(document.activeElement).toBe(panel);
    expect(bodyScrollLockDepth()).toBe(1);
    expect(focusTrapDepth()).toBe(1);
    // A pick replaces the drawer's history entry, so Back will not reopen it.
    expect(panel).toHaveAttribute('data-sveltekit-replacestate');
  });

  it('a second tap while the entry is on its way pushes nothing more', async () => {
    let finish = () => {};
    vi.mocked(pushState).mockImplementationOnce(
      (_url, state) =>
        new Promise<void>((done) => {
          finish = () => {
            page.state = state;
            done();
          };
        }),
    );
    render(AdminShellHarness);

    await fireEvent.click(burger());
    await fireEvent.click(burger());
    finish();
    await waitFor(() => expect(drawer()).toBeInTheDocument());
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it through history and gives focus back to the burger', async () => {
    render(AdminShellHarness);
    await fireEvent.click(burger());

    await press('Escape');

    expect(history.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(burger());
    expect(burger()).toHaveAttribute('aria-expanded', 'false');
    expect(bodyScrollLockDepth()).toBe(0);
    expect(focusTrapDepth()).toBe(0);
  });

  it('a click on the scrim closes it', async () => {
    render(AdminShellHarness);
    await fireEvent.click(burger());

    await fireEvent.click(document.body.querySelector('.adm-drawer-scrim') as HTMLElement);

    expect(history.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(burger());
  });

  it('"Cerrar menú" closes it', async () => {
    render(AdminShellHarness);
    await fireEvent.click(burger());

    await fireEvent.click(within(drawer()).getByRole('button', { name: 'Cerrar menú' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(burger());
  });

  it('Back closes it (the shallow entry is gone)', async () => {
    render(AdminShellHarness);
    await fireEvent.click(burger());

    goBack();
    flushSync();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(burger());
    expect(bodyScrollLockDepth()).toBe(0);
  });

  it('picking a page closes it by navigating, and leaves focus to the navigation', async () => {
    render(AdminShellHarness);
    await fireEvent.click(burger());
    // jsdom does not follow links; the router's part is played below.
    const stopNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', stopNavigation);

    await fireEvent.click(within(drawer()).getByRole('link', { name: 'Mi cuenta' }));
    // What the router then does: the new page, in the entry the drawer had.
    page.url = new URL('http://localhost/admin/cuenta/');
    page.state = {};
    flushSync();
    document.removeEventListener('click', stopNavigation);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(history.back).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(burger());
    expect(navLink('Mi cuenta')).toHaveAttribute('aria-current', 'page');
  });

  it('traps Tab inside: past the last control back to the first, and the other way', async () => {
    render(AdminShellHarness);
    await fireEvent.click(burger());
    const panel = drawer();
    const close = within(panel).getByRole('button', { name: 'Cerrar menú' });
    const logout = within(panel).getByRole('button', { name: 'Cerrar sesión' });

    logout.focus();
    await press('Tab');
    expect(document.activeElement).toBe(close);

    await press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(logout);
  });

  it('a logout confirm opened from the drawer takes Escape first', async () => {
    render(AdminShellHarness);
    await fireEvent.click(burger());
    await fireEvent.click(within(drawer()).getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('dialog', { name: '¿Cerrar sesión?' });

    await press('Escape');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '¿Cerrar sesión?' })).toBeNull(),
    );
    expect(drawer()).toBeInTheDocument();
    expect(history.back).not.toHaveBeenCalled();
  });

  it('above 900px there is no drawer, whatever the history entry says', () => {
    viewport(false);
    page.state = { drawer: true };
    render(AdminShellHarness);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(burger()).toHaveAttribute('aria-expanded', 'false');
    expect(bodyScrollLockDepth()).toBe(0);
    // The sidebar is a column of the page, never inert.
    expect(
      isInert(screen.getByRole('navigation', { name: 'Navegación del panel' }).parentElement),
    ).toBe(false);
  });
});

describe('AdminShell — when the session changes under the page', () => {
  it('"Tu sesión expiró" replaces the panel, with a way back in to this page', async () => {
    resetPage('/admin/cuenta/?seccion=seguridad');
    render(AdminShellHarness);

    shell.status = 'expired';
    flushSync();

    const heading = screen.getByRole('heading', { level: 1, name: 'Tu sesión expiró' });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByTestId('page-input')).toBeNull();
    const back = screen.getByRole('link', { name: 'Iniciar sesión de nuevo' });
    expect(back).toHaveAttribute(
      'href',
      '/admin/acceso/?next=%2Fadmin%2Fcuenta%2F%3Fseccion%3Dseguridad&aviso=sesion-expirada',
    );
    // A full page load: nothing of the old session stays in memory.
    expect(back).toHaveAttribute('data-sveltekit-reload');
    expect(document.title).toBe('Tu sesión expiró · Panel · Iglesia Restauración Divina');
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it('from Inicio the way back carries no next', () => {
    render(AdminShellHarness);

    shell.status = 'expired';
    flushSync();

    expect(screen.getByRole('link', { name: 'Iniciar sesión de nuevo' })).toHaveAttribute(
      'href',
      '/admin/acceso/?aviso=sesion-expirada',
    );
  });

  it('closes a menu the panel had open', () => {
    render(AdminShellHarness);
    showActionSheet({ actions: [{ label: 'Editar', onClick: () => {} }] });
    expect(actionSheet.current).not.toBeNull();

    shell.status = 'expired';
    flushSync();

    expect(actionSheet.current).toBeNull();
  });

  it.each([
    ['signed-out', '/admin/acceso/?next=%2Fadmin%2Fcuenta%2F'],
    ['needs-mfa', '/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F'],
    ['needs-enroll', '/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F'],
    ['forbidden', '/admin/acceso/sin-acceso/'],
  ] as const)('a session that turns %s leaves for %s', (status, target) => {
    resetPage('/admin/cuenta/');
    render(AdminShellHarness);

    shell.status = status;
    flushSync();

    expect(vi.mocked(leaveTo).mock.calls).toEqual([[target]]);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('a session that could not be read says so, with Reintentar', async () => {
    shell.status = 'error';
    shell.error = { kind: 'network', message: 'No hay conexión con el servidor.' };
    let settle = () => {};
    retry.mockImplementation(
      () =>
        new Promise<void>((done) => {
          settle = done;
        }),
    );
    render(AdminShellHarness);

    expect(
      screen.getByRole('heading', { level: 1, name: 'No pudimos abrir el panel' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
    expect(screen.queryByRole('navigation')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
    // The error stays up while Retry runs — its button shows the progress.
    shell.status = 'loading';
    flushSync();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveAttribute('aria-busy', 'true');

    shell.status = 'ready';
    settle();
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Navegación del panel' })).toBeInTheDocument(),
    );
  });
});
