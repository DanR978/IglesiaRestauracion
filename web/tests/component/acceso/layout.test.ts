// S39 — the acceso/ frame and its heading: the church's name, the page's own
// content, the one help line every sign-in page repeats in the same place
// (WCAG 3.2.6), and the h1 that takes focus whenever a step appears.
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import AccessLayout from '../../../src/routes/(admin)/admin/acceso/+layout.svelte';
import AccessHeading from '#lib/components/admin/auth/AccessHeading.svelte';

const page = createRawSnippet(() => ({ render: () => '<p>Contenido de la página</p>' }));

describe('acceso/+layout', () => {
  it('frames the page: church name, the page, then the help line', () => {
    render(AccessLayout, { props: { children: page, data: {}, params: {} } as never });
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('Iglesia Restauración Divina');
    expect(main).toHaveTextContent('Panel de administración');
    expect(main).toHaveTextContent('Contenido de la página');

    const help = screen.getByRole('contentinfo');
    expect(help).toHaveTextContent('¿Problemas para entrar? Escribe a contactanos@irdlex.org');
    expect(screen.getByRole('link', { name: 'contactanos@irdlex.org' })).toHaveAttribute(
      'href',
      'mailto:contactanos@irdlex.org',
    );
    // After the page, never inside it: the same place on every sign-in page.
    expect(main.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('AccessHeading', () => {
  it('is the h1 and the start of the tab title, and takes focus', () => {
    render(AccessHeading, { props: { title: 'Iniciar sesión', lede: 'Una línea.' } });
    const heading = screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);
    expect(document.title).toBe('Iniciar sesión · Panel · Iglesia Restauración Divina');
    expect(screen.getByText('Una línea.')).toBeInTheDocument();
  });

  it('takes focus again when the step changes', async () => {
    const { rerender } = render(AccessHeading, { props: { title: 'Verificación en dos pasos' } });
    (document.activeElement as HTMLElement).blur();
    await rerender({ title: 'Verifica tu identidad' });
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Verifica tu identidad' }),
    );
    expect(document.title).toBe('Verifica tu identidad · Panel · Iglesia Restauración Divina');
  });
});
