// S37 — the (admin) route group's root layout: the admin surface
// ([data-surface="admin"], D-021) with the toast, confirm and action-sheet
// hosts inside it, links preloading on tap, and the script frame guard
// (D-037): framed, it mounts nothing but a Spanish refusal.
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import AdminLayout from '../../src/routes/(admin)/admin/+layout.svelte';

const frame = vi.hoisted(() => ({ framed: false }));

vi.mock('#lib/components/admin/shell/shell.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/components/admin/shell/shell.js')>()),
  isFramed: () => frame.framed,
}));

const children = createRawSnippet(() => ({
  render: () => '<p data-testid="admin-page">Página del panel</p>',
}));

function renderLayout() {
  return render(AdminLayout, { props: { children, data: {}, params: {} } });
}

describe('admin layout', () => {
  it('wraps the page in the admin surface, hosts included, preloading on tap', () => {
    frame.framed = false;
    renderLayout();

    const surface = document.body.querySelector('[data-surface="admin"]') as HTMLElement;
    expect(surface).toHaveAttribute('data-sveltekit-preload-data', 'tap');
    expect(surface).toContainElement(screen.getByTestId('admin-page'));
    expect(surface.querySelector('.toast-host')).not.toBeNull();
  });

  it('inside a frame, mounts only a refusal — no page, no hosts', () => {
    frame.framed = true;
    renderLayout();

    expect(
      screen.getByRole('heading', { level: 1, name: 'El panel no se puede abrir aquí' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('admin-page')).toBeNull();
    expect(document.body.querySelector('.toast-host')).toBeNull();
    const open = screen.getByRole('link', { name: 'Abrir el panel en una pestaña nueva' });
    expect(open).toHaveAttribute('href', location.href);
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
