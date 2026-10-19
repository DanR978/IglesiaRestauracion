// S45 — the /admin/cuenta/ route under jsdom: the page header, the section
// list in link mode driven by `?seccion=` (default Perfil, anything unknown is
// Perfil), a section kept mounted once opened (an unsaved name survives a look
// at Seguridad), the skeleton until the session is ready — and Preferencias,
// whose one control is the admin's own theme (D-038). The stores are faked,
// $app/state's page is a reactive stand-in, the auth / mfa / repo calls are
// mocked so every section can mount.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_THEME_STORAGE_KEY, THEME_STORAGE_KEY, adminTheme } from '#lib/theme.svelte.js';
import PreferencesSection from '#lib/components/admin/account/PreferencesSection.svelte';
import AccountPage from '../../../src/routes/(admin)/admin/(app)/cuenta/+page.svelte';
import {
  resetAccountFakes,
  sessionFake,
  setSession,
  visit,
} from '../fixtures/account-fakes.svelte';

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
vi.mock('#lib/stores/session.svelte.js', async () => ({
  session: (await import('../fixtures/account-fakes.svelte')).sessionFake,
}));
vi.mock('#lib/stores/ministries.svelte.js', async () => ({
  ministries: (await import('../fixtures/account-fakes.svelte')).ministriesFake,
}));
vi.mock('$app/state', async () => ({
  page: (await import('../fixtures/account-fakes.svelte')).pageFake,
}));
vi.mock('#lib/auth/mfa.js', () => ({
  listFactors: vi.fn(async () => ({ ok: true, data: [] })),
  beginEnroll: vi.fn(),
  beginChallenge: vi.fn(),
  submitCode: vi.fn(),
  cancelEnroll: vi.fn(),
  removeFactor: vi.fn(),
}));
vi.mock('#lib/auth/session.js', () => ({ updatePassword: vi.fn() }));

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 0));
  await tick();
}

const nav = () => screen.getByRole('navigation', { name: 'Secciones de Mi cuenta' });
const link = (name: string) => within(nav()).getByRole('link', { name });
const region = (name: string) => screen.queryByRole('region', { name });

beforeEach(() => {
  resetAccountFakes();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/admin/cuenta/', () => {
  it('is titled "Mi cuenta", and the tab says so', async () => {
    render(AccountPage);
    await settle();
    expect(screen.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument();
    expect(document.title).toBe('Mi cuenta');
  });

  it('lists the three sections as links that change only the query', async () => {
    const { container } = render(AccountPage);
    await settle();
    expect(
      within(nav())
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['?seccion=perfil', '?seccion=seguridad', '?seccion=preferencias']);
    // Switching keeps focus on the link and the page where it is.
    expect(container.querySelector('[data-sveltekit-reset="false"]')).toContainElement(nav());
  });

  it('opens on Perfil, marked as the current page', async () => {
    render(AccountPage);
    await settle();
    expect(link('Perfil')).toHaveAttribute('aria-current', 'page');
    expect(region('Perfil')).toBeVisible();
    expect(region('Seguridad')).toBeNull();
    expect(region('Preferencias')).toBeNull();
  });

  it('opens the section the URL names', async () => {
    visit('?seccion=seguridad');
    render(AccountPage);
    await settle();
    expect(link('Seguridad')).toHaveAttribute('aria-current', 'page');
    expect(link('Perfil')).not.toHaveAttribute('aria-current');
    expect(region('Seguridad')).toBeVisible();
    expect(region('Perfil')).toBeNull();
  });

  it('treats an unknown section as Perfil', async () => {
    visit('?seccion=actividad');
    render(AccountPage);
    await settle();
    expect(link('Perfil')).toHaveAttribute('aria-current', 'page');
    expect(region('Perfil')).toBeVisible();
  });

  it('follows the URL, and keeps an opened section mounted — the draft survives', async () => {
    render(AccountPage);
    await settle();
    const name = screen.getByRole('textbox', { name: /Nombre visible/ }) as HTMLInputElement;
    await fireEvent.input(name, { target: { value: 'Ana María' } });

    visit('?seccion=seguridad');
    await settle();
    expect(link('Seguridad')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: 'Seguridad' })).toBeVisible();
    // Perfil is hidden, not gone: a hidden section leaves the accessibility tree.
    expect(region('Perfil')).toBeNull();
    expect(name.isConnected).toBe(true);
    expect(name.closest('[hidden]')).not.toBeNull();

    visit('?seccion=perfil');
    await settle();
    expect(region('Perfil')).toBeVisible();
    expect(name.value).toBe('Ana María');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it('shows a skeleton, and no account data, until the session is ready', async () => {
    setSession({ status: 'loading', user: null, profile: null });
    const { container } = render(AccountPage);
    await settle();
    expect(sessionFake.ready).toHaveBeenCalled();
    expect(container.querySelector('.ird-state--loading')).not.toBeNull();
    expect(region('Perfil')).toBeNull();
    // The header and the section list are already there.
    expect(screen.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument();
    expect(nav()).toBeInTheDocument();

    setSession({ status: 'ready', user: sessionFake.user, profile: sessionFake.profile });
    await settle();
  });
});

describe('Preferencias', () => {
  beforeEach(() => {
    localStorage.clear();
    adminTheme.current = 'system';
  });

  it('is one choice, the theme: Claro, Oscuro, Sistema', () => {
    render(PreferencesSection);
    expect(screen.getByRole('region', { name: 'Preferencias' })).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Tema del panel' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent?.trim()),
    ).toEqual(['Claro', 'Oscuro', 'Sistema']);
    expect(within(group).getByRole('radio', { name: 'Sistema' })).toBeChecked();
    expect(
      screen.getByText(
        'Se guarda en este dispositivo. El sitio público conserva su propia elección.',
      ),
    ).toBeInTheDocument();
    // Density, reduce-motion and landing-tab are not ported (PORT-DEBT S45).
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
  });

  it('stores the admin’s choice under its own key, never the public one', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(PreferencesSection);
    await fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(adminTheme.current).toBe('dark');
    expect(localStorage.getItem(ADMIN_THEME_STORAGE_KEY)).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await fireEvent.click(screen.getByRole('radio', { name: 'Sistema' }));
    expect(adminTheme.current).toBe('system');
    expect(localStorage.getItem(ADMIN_THEME_STORAGE_KEY)).toBeNull();
  });

  it('shows the stored choice', () => {
    adminTheme.current = 'light';
    render(PreferencesSection);
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
  });
});
