// S37 — the (app) layout runs the S38 guard (guardAdmin) before the group's
// first page renders: nothing until it answers; a target is left for in place
// of this history entry (leaveTo → goto with replace, as a load's redirect
// was); null renders the shell. Each new visit inside the group — a path or
// query, not a hash or a shallow entry — is decided again with the shell kept,
// and an answer for an older visit is ignored. guardAdmin's own decisions are
// tested in tests/unit/stores/session.test.ts.
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../../src/routes/(admin)/admin/(app)/+layout.svelte';
import { page, resetPage } from '../stubs/app-state.svelte';

const guard = vi.hoisted(() => ({
  calls: [] as URL[],
  answers: [] as Array<(target: string | null) => void>,
}));

vi.mock('#lib/stores/session.svelte.js', () => ({
  guardAdmin: (url: URL) => {
    guard.calls.push(url);
    return new Promise<string | null>((answer) => guard.answers.push(answer));
  },
}));
vi.mock('#lib/components/admin/auth/destination.js', () => ({ leaveTo: vi.fn(async () => {}) }));
vi.mock('#lib/components/admin/shell/AdminShell.svelte', async () => ({
  default: (await import('./fixtures/ShellStub.svelte')).default,
}));

const { leaveTo } = await import('#lib/components/admin/auth/destination.js');

const children = createRawSnippet(() => ({
  render: () => '<p data-testid="admin-page">Página del panel</p>',
}));

/** Let the guard's answer reach the layout and the DOM. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await tick();
}

function renderLayout() {
  return render(AppLayout, { props: { children, data: {}, params: {} } as never });
}

beforeEach(() => {
  guard.calls.length = 0;
  guard.answers.length = 0;
  vi.mocked(leaveTo).mockClear();
  resetPage('/admin/cuenta/?seccion=seguridad');
});

describe('(app) layout — the guard', () => {
  it('renders nothing until the guard answers, then the shell with the page', async () => {
    renderLayout();
    await tick();
    expect(guard.calls).toHaveLength(1);
    expect(guard.calls[0].pathname + guard.calls[0].search).toBe(
      '/admin/cuenta/?seccion=seguridad',
    );
    expect(screen.queryByTestId('admin-shell')).toBeNull();
    expect(screen.queryByTestId('admin-page')).toBeNull();

    guard.answers[0](null);
    await settle();
    expect(screen.getByTestId('admin-shell')).toContainElement(screen.getByTestId('admin-page'));
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it('leaves for the target it names, never rendering the page', async () => {
    renderLayout();
    await tick();
    guard.answers[0]('/admin/acceso/?next=%2Fadmin%2Fcuenta%2F');
    await settle();
    expect(leaveTo).toHaveBeenCalledExactlyOnceWith('/admin/acceso/?next=%2Fadmin%2Fcuenta%2F');
    expect(screen.queryByTestId('admin-page')).toBeNull();
  });

  it('decides again on a new path or query, keeping the shell meanwhile', async () => {
    renderLayout();
    await tick();
    guard.answers[0](null);
    await settle();

    page.url = new URL('http://localhost/admin/');
    await tick();
    expect(guard.calls).toHaveLength(2);
    expect(guard.calls[1].pathname + guard.calls[1].search).toBe('/admin/');
    expect(screen.getByTestId('admin-shell')).toBeInTheDocument();

    page.url = new URL('http://localhost/admin/?vista=lista');
    await tick();
    expect(guard.calls).toHaveLength(3);
    guard.answers[2]('/admin/acceso/sin-acceso/');
    await settle();
    expect(leaveTo).toHaveBeenCalledExactlyOnceWith('/admin/acceso/sin-acceso/');
  });

  it('a hash or a shallow history entry is not a new visit', async () => {
    renderLayout();
    await tick();
    guard.answers[0](null);
    await settle();

    page.url = new URL('http://localhost/admin/cuenta/?seccion=seguridad#contenido');
    page.state = { drawer: true };
    await tick();
    expect(guard.calls).toHaveLength(1);
  });

  it('ignores an answer for a visit that is no longer the current one', async () => {
    renderLayout();
    await tick();
    page.url = new URL('http://localhost/admin/');
    await tick();
    expect(guard.calls).toHaveLength(2);

    guard.answers[0]('/admin/acceso/');
    await settle();
    expect(leaveTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('admin-shell')).toBeNull();

    guard.answers[1](null);
    await settle();
    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
  });
});
