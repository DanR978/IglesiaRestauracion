// S37 — <PageHeader>, the API S41 (Inicio) and S45 (Mi cuenta) build on:
// `title` is the h1, the tab title and the mobile topbar title; `description`
// one muted line; `actions` a snippet beside the title. It moves no focus.
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import PageHeader from '#lib/components/admin/shell/PageHeader.svelte';
import { pageTitle } from '#lib/components/admin/shell/page-title.svelte.js';

const button = (label: string) =>
  createRawSnippet(() => ({ render: () => `<button type="button">${label}</button>` }));

describe('PageHeader', () => {
  it('renders the title as the page h1, and nothing else by default', () => {
    render(PageHeader, { props: { title: 'Inicio' } });

    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(document.body.querySelector('.adm-page-header__description')).toBeNull();
    expect(document.body.querySelector('.adm-page-header__actions')).toBeNull();
  });

  it('adds the description under the title, and the actions beside it', () => {
    render(PageHeader, {
      props: {
        title: 'Mi cuenta',
        description: 'Tu perfil, la seguridad de tu cuenta y tus preferencias.',
        actions: button('Guardar cambios'),
      },
    });

    expect(
      screen.getByText('Tu perfil, la seguridad de tu cuenta y tus preferencias.'),
    ).toHaveClass('adm-page-header__description');
    expect(screen.getByRole('button', { name: 'Guardar cambios' }).parentElement).toHaveClass(
      'adm-page-header__actions',
    );
  });

  it('names the browser tab "<title> · Panel · Iglesia Restauración Divina"', () => {
    render(PageHeader, { props: { title: 'Mi cuenta' } });

    expect(document.title).toBe('Mi cuenta · Panel · Iglesia Restauración Divina');
  });

  it('hands its title to the topbar, follows changes, and takes it back when it goes', async () => {
    const { rerender, unmount } = render(PageHeader, { props: { title: 'Inicio' } });
    expect(pageTitle.current).toBe('Inicio');

    await rerender({ title: 'Mi cuenta' });
    expect(pageTitle.current).toBe('Mi cuenta');
    expect(document.title).toBe('Mi cuenta · Panel · Iglesia Restauración Divina');

    unmount();
    flushSync();
    expect(pageTitle.current).toBe('');
  });

  it('moves no focus', () => {
    const before = document.activeElement;
    render(PageHeader, { props: { title: 'Inicio' } });

    expect(document.activeElement).toBe(before);
  });
});
