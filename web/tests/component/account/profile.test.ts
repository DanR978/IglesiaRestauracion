// S45 — Mi cuenta › Perfil under jsdom, with the session / ministries stores
// faked (fixtures/account-fakes.svelte.ts), the profiles repo and the image
// optimizer mocked, S37's $app/navigation spies, and the real toast and confirm
// stores: the avatar uploader (image-only, ≤ 5 MB, square JPEG through the
// optimizer, upload → set → refresh, progress on the button, the confirm in
// front of "Quitar foto", every outcome a Spanish toast), the display-name
// form (dirty tracking, inline validation, save → refresh → toast) and its
// unsaved-changes guard, and the account facts (each once, no fabricated
// field, the lock notes, the ministries' loading / error / retry).
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beforeNavigate, goto, type BeforeNavigate } from '$app/navigation';
import { confirmState } from '#lib/stores/confirm.svelte.js';
import { toast } from '#lib/stores/toast.svelte.js';
import { IMAGE_OPTIMIZER_MESSAGES, ImageOptimizerError } from '#lib/image-optimizer.js';
import AccountFacts from '#lib/components/admin/account/AccountFacts.svelte';
import AvatarUploader from '#lib/components/admin/account/AvatarUploader.svelte';
import DisplayNameForm from '#lib/components/admin/account/DisplayNameForm.svelte';
import ProfileSection from '#lib/components/admin/account/ProfileSection.svelte';
import {
  USER_ID,
  ministriesFake,
  profileFixture,
  resetAccountFakes,
  sessionFake,
  setMinistries,
  setSession,
  userFixture,
} from '../fixtures/account-fakes.svelte';

vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
vi.mock('#lib/stores/session.svelte.js', async () => ({
  session: (await import('../fixtures/account-fakes.svelte')).sessionFake,
}));
vi.mock('#lib/stores/ministries.svelte.js', async () => ({
  ministries: (await import('../fixtures/account-fakes.svelte')).ministriesFake,
}));

// S37's $app/navigation stand-in (tests/stubs/app-navigation.ts): router spies.
const nav = { beforeNavigate: vi.mocked(beforeNavigate), goto: vi.mocked(goto) };

const repo = vi.hoisted(() => ({
  setDisplayName: vi.fn(),
  uploadAvatar: vi.fn(),
  setAvatarUrl: vi.fn(),
}));
vi.mock('#lib/repos/profiles.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/repos/profiles.js')>()),
  ...repo,
}));

const optimizer = vi.hoisted(() => ({ optimizeSquare: vi.fn() }));
vi.mock('#lib/image-optimizer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/image-optimizer.js')>()),
  ...optimizer,
}));

const ok = <T>(data: T) => ({ ok: true as const, data });
const failed = (message: string, kind = 'network') => ({
  ok: false as const,
  error: { kind, message },
});

/** Let promises, timers and the re-render behind them settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((done) => setTimeout(done, 0));
  await tick();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const toasts = () => toast.items.map((t) => [t.variant, t.message]);

beforeEach(() => {
  resetAccountFakes();
  for (const fn of [...Object.values(repo), optimizer.optimizeSquare]) fn.mockReset();
  nav.beforeNavigate.mockClear();
  nav.goto.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  confirmState.cancelAll();
  toast.clear();
  vi.restoreAllMocks();
});

/* ── AvatarUploader ────────────────────────────────────────────────────── */

describe('AvatarUploader', () => {
  const JPEG = new Blob(['jpeg'], { type: 'image/jpeg' });
  const PUBLIC_URL = `http://127.0.0.1:54321/storage/v1/object/public/avatars/${USER_ID}/avatar-1.jpg`;

  function mount(photo: string | null = null) {
    return render(AvatarUploader, { props: { userId: USER_ID, name: 'Ana Pérez', photo } });
  }

  async function pick(container: HTMLElement, file: File): Promise<void> {
    const input = container.querySelector<HTMLInputElement>('.avatar-up__file')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
  }

  const photoFile = (size = 2_000_000, type = 'image/png') =>
    new File([new Uint8Array(size)], 'yo.png', { type });

  it('offers "Subir foto" without a photo, and "Cambiar foto" + "Quitar foto" with one', () => {
    const { unmount } = mount();
    expect(screen.getByRole('button', { name: 'Subir foto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).toBeNull();
    unmount();
    mount(PUBLIC_URL);
    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar foto' })).toBeInTheDocument();
  });

  it('the picker takes images, and the hint states the limits', () => {
    const { container } = mount();
    const input = container.querySelector<HTMLInputElement>('.avatar-up__file')!;
    expect(input.accept).toBe('image/*');
    const button = screen.getByRole('button', { name: 'Subir foto' });
    const hint = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toMatch(/5 MB/);
  });

  it('refuses a file that is not an image, before any work', async () => {
    const { container } = mount();
    await pick(container, photoFile(1000, 'application/pdf'));
    await settle();
    expect(optimizer.optimizeSquare).not.toHaveBeenCalled();
    expect(repo.uploadAvatar).not.toHaveBeenCalled();
    expect(toasts()).toEqual([['error', 'Elige un archivo de imagen (JPG, PNG o WebP).']]);
  });

  it('refuses an image over 5 MB, before any work', async () => {
    const { container } = mount();
    await pick(container, photoFile(5 * 1024 * 1024 + 1));
    await settle();
    expect(optimizer.optimizeSquare).not.toHaveBeenCalled();
    expect(toasts()).toEqual([['error', 'La imagen es muy grande (máx. 5 MB).']]);
  });

  it('squares the image to JPEG, uploads it, points the profile at it and refreshes', async () => {
    optimizer.optimizeSquare.mockResolvedValue({ blob: JPEG, size: 512, originalSize: 2e6 });
    const upload = deferred<ReturnType<typeof ok<string>>>();
    repo.uploadAvatar.mockReturnValue(upload.promise);
    repo.setAvatarUrl.mockResolvedValue(ok(undefined));
    const { container } = mount();
    const file = photoFile();

    await pick(container, file);
    await settle();
    // Busy: the button carries the progress, the status line names the stage.
    const button = screen.getByRole('button', { name: 'Subir foto' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Subiendo la foto…');
    expect(optimizer.optimizeSquare).toHaveBeenCalledWith(file);
    expect(repo.uploadAvatar).toHaveBeenCalledWith(USER_ID, JPEG, 'jpg');

    upload.resolve(ok(PUBLIC_URL));
    await settle();
    expect(repo.setAvatarUrl).toHaveBeenCalledWith(PUBLIC_URL);
    expect(sessionFake.refresh).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([['success', 'Foto actualizada']]);
    expect(button).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it("an image the browser can't read is a Spanish toast, and nothing is uploaded", async () => {
    optimizer.optimizeSquare.mockRejectedValue(new ImageOptimizerError('decode'));
    const { container } = mount();
    await pick(container, photoFile());
    await settle();
    expect(repo.uploadAvatar).not.toHaveBeenCalled();
    expect(toasts()).toEqual([['error', IMAGE_OPTIMIZER_MESSAGES.decode]]);
  });

  it('a failed upload is the repo’s Spanish copy, and the profile is left alone', async () => {
    optimizer.optimizeSquare.mockResolvedValue({ blob: JPEG, size: 512, originalSize: 2e6 });
    repo.uploadAvatar.mockResolvedValue(failed('No pudimos conectar con el servidor.'));
    const { container } = mount();
    await pick(container, photoFile());
    await settle();
    expect(repo.setAvatarUrl).not.toHaveBeenCalled();
    expect(sessionFake.refresh).not.toHaveBeenCalled();
    expect(toasts()).toEqual([['error', 'No pudimos conectar con el servidor.']]);
    expect(screen.getByRole('button', { name: 'Subir foto' })).not.toHaveAttribute('aria-busy');
  });

  it('a refused photo URL is a toast too', async () => {
    optimizer.optimizeSquare.mockResolvedValue({ blob: JPEG, size: 512, originalSize: 2e6 });
    repo.uploadAvatar.mockResolvedValue(ok(PUBLIC_URL));
    repo.setAvatarUrl.mockResolvedValue(failed('Algunos datos no son válidos.', 'invalid'));
    const { container } = mount();
    await pick(container, photoFile());
    await settle();
    expect(sessionFake.refresh).not.toHaveBeenCalled();
    expect(toasts()).toEqual([['error', 'Algunos datos no son válidos.']]);
  });

  it('"Quitar foto" asks first; No changes nothing', async () => {
    mount(PUBLIC_URL);
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));
    expect(confirmState.current).toMatchObject({
      title: '¿Quitar tu foto?',
      confirmLabel: 'Quitar foto',
      danger: true,
    });
    confirmState.answer(false);
    await settle();
    expect(repo.setAvatarUrl).not.toHaveBeenCalled();
    expect(toasts()).toEqual([]);
  });

  it('"Quitar foto" confirmed: the profile drops the photo, refreshes and says so', async () => {
    repo.setAvatarUrl.mockResolvedValue(ok(undefined));
    mount(PUBLIC_URL);
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));
    confirmState.answer(true);
    await settle();
    expect(repo.setAvatarUrl).toHaveBeenCalledWith(null);
    expect(sessionFake.refresh).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([['success', 'Foto quitada']]);
  });

  it('a failed removal is a toast, and the photo stays', async () => {
    repo.setAvatarUrl.mockResolvedValue(failed('No pudimos conectar con el servidor.'));
    mount(PUBLIC_URL);
    await fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));
    confirmState.answer(true);
    await settle();
    expect(sessionFake.refresh).not.toHaveBeenCalled();
    expect(toasts()).toEqual([['error', 'No pudimos conectar con el servidor.']]);
  });
});

/* ── DisplayNameForm ───────────────────────────────────────────────────── */

describe('DisplayNameForm', () => {
  const input = () => screen.getByRole('textbox', { name: /Nombre visible/ }) as HTMLInputElement;
  const save = () => screen.getByRole('button', { name: 'Guardar cambios' });

  async function type(value: string): Promise<void> {
    await fireEvent.input(input(), { target: { value } });
  }

  /** The beforeNavigate callback the form registered. */
  function guard(): (navigation: BeforeNavigate) => void {
    const callback = nav.beforeNavigate.mock.calls.at(-1)?.[0];
    if (!callback) throw new Error('no beforeNavigate guard registered');
    return callback as (navigation: BeforeNavigate) => void;
  }

  function navigation(over: Partial<BeforeNavigate> & { toPath?: string } = {}) {
    const { toPath = '/admin/', ...rest } = over;
    const cancel = vi.fn();
    const target = new URL(`http://localhost${toPath}`);
    return {
      cancel,
      nav: {
        type: 'link',
        shallow: false,
        willUnload: false,
        from: { url: new URL('http://localhost/admin/cuenta/'), params: {}, route: { id: null } },
        to: { url: target, params: {}, route: { id: null } },
        complete: Promise.resolve(),
        cancel,
        ...rest,
      } as unknown as BeforeNavigate,
    };
  }

  it('shows the stored name, labelled, with nothing to save yet', () => {
    render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
    expect(input().value).toBe('Ana Pérez');
    expect(input()).toHaveAttribute('autocomplete', 'name');
    expect(input()).toHaveAttribute('aria-required', 'true');
    expect(save()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Descartar cambios' })).toBeNull();
  });

  it('is dirty only when the normalised name differs from the stored one', async () => {
    render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
    await type('  Ana   Pérez ');
    expect(save()).toBeDisabled();
    await type('Ana María Pérez');
    expect(save()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toBeInTheDocument();
  });

  it('saves the normalised name, refreshes the session and says so', async () => {
    repo.setDisplayName.mockResolvedValue(ok('Ana María Pérez'));
    render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
    await type('Ana   María Pérez');
    await fireEvent.click(save());
    await settle();
    expect(repo.setDisplayName).toHaveBeenCalledWith('Ana María Pérez');
    expect(sessionFake.refresh).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([['success', 'Nombre actualizado']]);
    expect(input().value).toBe('Ana María Pérez');
    expect(save()).toBeDisabled();
  });

  it('a name that does not fit is an inline error, and nothing is sent', async () => {
    render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
    await type('A');
    await fireEvent.click(save());
    await settle();
    expect(repo.setDisplayName).not.toHaveBeenCalled();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe un nombre de entre 2 y 80 caracteres.',
    );
    await type('Ana');
    expect(input()).not.toHaveAttribute('aria-invalid');
  });

  it('a failed save is a toast with the repo’s copy, and the draft stays', async () => {
    repo.setDisplayName.mockResolvedValue(failed('No tienes permiso.', 'forbidden'));
    render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
    await type('Ana María');
    await fireEvent.click(save());
    await settle();
    expect(toasts()).toEqual([['error', 'No tienes permiso.']]);
    expect(sessionFake.refresh).not.toHaveBeenCalled();
    expect(input().value).toBe('Ana María');
    expect(save()).toBeEnabled();
  });

  it('"Descartar cambios" brings the stored name back', async () => {
    render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
    await type('Otra persona');
    await fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(input().value).toBe('Ana Pérez');
    expect(save()).toBeDisabled();
  });

  it('follows a new stored name until the person edits, then keeps their draft', async () => {
    const view = render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
    await view.rerender({ name: 'Ana P.' });
    expect(input().value).toBe('Ana P.');
    await type('Mi borrador');
    await view.rerender({ name: 'Ana Q.' });
    expect(input().value).toBe('Mi borrador');
  });

  describe('the unsaved-changes guard', () => {
    it('lets every navigation through while nothing is dirty', () => {
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      const { nav: n, cancel } = navigation();
      guard()(n);
      expect(cancel).not.toHaveBeenCalled();
      expect(confirmState.current).toBeNull();
    });

    it('holds a navigation to another page and asks "¿Salir sin guardar los cambios?"', async () => {
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      await type('Ana María');
      const { nav: n, cancel } = navigation({ toPath: '/admin/' });
      guard()(n);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(confirmState.current).toMatchObject({
        title: '¿Salir sin guardar los cambios?',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir editando',
        danger: true,
      });
    });

    it('staying keeps the draft; leaving drops it and repeats the navigation', async () => {
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      await type('Ana María');
      guard()(navigation({ toPath: '/admin/' }).nav);
      confirmState.answer(false);
      await settle();
      expect(nav.goto).not.toHaveBeenCalled();
      expect(input().value).toBe('Ana María');

      guard()(navigation({ toPath: '/admin/' }).nav);
      confirmState.answer(true);
      await settle();
      expect(String(nav.goto.mock.calls[0][0])).toBe('http://localhost/admin/');
      expect(input().value).toBe('Ana Pérez');
    });

    it('Back to another page leaves through history, by the same step', async () => {
      const go = vi.spyOn(history, 'go').mockImplementation(() => {});
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      await type('Ana María');
      guard()(navigation({ type: 'popstate', delta: -1 } as Partial<BeforeNavigate>).nav);
      confirmState.answer(true);
      await settle();
      expect(go).toHaveBeenCalledWith(-1);
      expect(nav.goto).not.toHaveBeenCalled();
    });

    it('asks once for several held navigations, and follows the latest', async () => {
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      await type('Ana María');
      guard()(navigation({ toPath: '/admin/' }).nav);
      guard()(navigation({ toPath: '/admin/tesoreria/' }).nav);
      expect(confirmState.size).toBe(1);
      confirmState.answer(true);
      await settle();
      expect(nav.goto).toHaveBeenCalledTimes(1);
      expect(String(nav.goto.mock.calls[0][0])).toBe('http://localhost/admin/tesoreria/');
    });

    it('ignores another section of Mi cuenta (same page, new query) and shallow navigations', async () => {
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      await type('Ana María');
      const section = navigation({ toPath: '/admin/cuenta/?seccion=seguridad' });
      guard()(section.nav);
      const shallow = navigation({ shallow: true });
      guard()(shallow.nav);
      expect(section.cancel).not.toHaveBeenCalled();
      expect(shallow.cancel).not.toHaveBeenCalled();
      expect(confirmState.current).toBeNull();
    });

    it('closing or reloading the tab is held for the browser’s own prompt', async () => {
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      await type('Ana María');
      const { nav: n, cancel } = navigation({ type: 'leave', to: null, willUnload: true });
      guard()(n);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(confirmState.current).toBeNull();
    });

    it('a session that ended has nothing to save to: the navigation goes', async () => {
      render(DisplayNameForm, { props: { name: 'Ana Pérez' } });
      await type('Ana María');
      setSession({ status: 'signed-out' });
      const { nav: n, cancel } = navigation();
      guard()(n);
      expect(cancel).not.toHaveBeenCalled();
    });
  });
});

/* ── AccountFacts ──────────────────────────────────────────────────────── */

describe('AccountFacts', () => {
  const field = (label: string) => {
    const term = screen.getByText(label, { selector: 'dt' });
    return term.closest('dl') as HTMLElement;
  };

  it('shows each fact once, as text — never a disabled input', () => {
    const { container } = render(AccountFacts, {
      props: { user: userFixture(), profile: profileFixture() },
    });
    expect(container.querySelector('input')).toBeNull();
    expect(screen.getAllByText('ana@example.org')).toHaveLength(1);
    expect(within(field('Correo')).getByText('ana@example.org')).toBeInTheDocument();
    expect(within(field('Rol')).getByText('Administrador')).toBeInTheDocument();
    expect(within(field('Miembro desde')).getByText(/2026/)).toBeInTheDocument();
    expect(within(field('Último inicio de sesión')).getByText(/2026/)).toBeInTheDocument();
  });

  it('drops the fabricated fields: Usuario, Zona horaria, Idioma', () => {
    const { container } = render(AccountFacts, {
      props: { user: userFixture(), profile: profileFixture() },
    });
    const labels = [...container.querySelectorAll('dt')].map((dt) => dt.textContent?.trim());
    expect(labels).toEqual([
      'Correo',
      'Rol',
      'Ministerios',
      'Miembro desde',
      'Último inicio de sesión',
    ]);
    expect(container.textContent).not.toMatch(/Zona horaria|Idioma|Usuario|@ana\b|Activa/);
  });

  it('marks what an administrator owns with a lock note', () => {
    render(AccountFacts, { props: { user: userFixture(), profile: profileFixture() } });
    expect(within(field('Correo')).getByText('Lo gestiona un administrador.')).toBeInTheDocument();
    expect(within(field('Rol')).getByText('Lo asigna un administrador.')).toBeInTheDocument();
    expect(
      within(field('Ministerios')).getByText('Los asigna un administrador.'),
    ).toBeInTheDocument();
    expect(within(field('Miembro desde')).queryByText(/administrador/)).toBeNull();
  });

  it('names the access preset when the account may read it', () => {
    render(AccountFacts, {
      props: {
        user: userFixture(),
        profile: profileFixture({ role_presets: { name: 'Desarrollador' } }),
      },
    });
    expect(within(field('Rol')).getByText('Desarrollador')).toBeInTheDocument();
    expect(screen.queryByText('Administrador')).toBeNull();
  });

  it('a missing date is the "Sin dato" mark, not a gap', () => {
    render(AccountFacts, {
      props: { user: userFixture({ last_sign_in_at: undefined }), profile: profileFixture() },
    });
    expect(within(field('Último inicio de sesión')).getByText('Sin dato')).toBeInTheDocument();
  });

  it('an account that leads no ministry asks for no list', () => {
    render(AccountFacts, { props: { user: userFixture(), profile: profileFixture() } });
    expect(ministriesFake.load).not.toHaveBeenCalled();
    expect(within(field('Ministerios')).getByText('Ninguno asignado')).toBeInTheDocument();
  });

  it('a leader’s ministries: a skeleton while they load, then their names', async () => {
    setMinistries({ status: 'loading' });
    const profile = profileFixture({ role: 'ministry_leader', ministry_ids: ['m-1', 'm-gone'] });
    const { container } = render(AccountFacts, { props: { user: userFixture(), profile } });
    expect(ministriesFake.load).toHaveBeenCalled();
    expect(container.querySelector('.ird-state--loading')).not.toBeNull();
    expect(container.querySelector('dl')).toBeNull();

    setMinistries({
      status: 'ready',
      items: [
        { id: 'm-1', name: 'Jóvenes', color: '#2a4a9e', created_at: '2026-01-01T00:00:00Z' },
        { id: 'm-2', name: 'Alabanza', color: null, created_at: '2026-01-01T00:00:00Z' },
      ],
    });
    await tick();
    const ministries = within(field('Ministerios'));
    expect(ministries.getByText('Jóvenes')).toBeInTheDocument();
    // A ministry deleted since it was assigned is simply not listed.
    expect(ministries.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Alabanza')).toBeNull();
  });

  it('asks for the list once — a failure waits for Retry instead of looping', async () => {
    setMinistries({ status: 'loading' });
    const profile = profileFixture({ role: 'ministry_leader', ministry_ids: ['m-1'] });
    render(AccountFacts, { props: { user: userFixture(), profile } });
    await tick();
    setMinistries({ status: 'error', error: { kind: 'network', message: 'Sin conexión.' } });
    await tick();
    setMinistries({ status: 'loading', error: null });
    await tick();
    setMinistries({ status: 'error', error: { kind: 'network', message: 'Sin conexión.' } });
    await tick();
    expect(ministriesFake.load).toHaveBeenCalledTimes(1);
  });

  it('a failed ministries read is an error with Retry in that field only', async () => {
    setMinistries({ status: 'error', error: { kind: 'network', message: 'Sin conexión.' } });
    const profile = profileFixture({ role: 'ministry_leader', ministry_ids: ['m-1'] });
    render(AccountFacts, { props: { user: userFixture(), profile } });
    const ministries = within(field('Ministerios'));
    expect(ministries.getByRole('alert')).toHaveTextContent('Sin conexión.');
    expect(within(field('Correo')).getByText('ana@example.org')).toBeInTheDocument();
    ministriesFake.load.mockClear();
    await fireEvent.click(ministries.getByRole('button', { name: 'Reintentar' }));
    expect(ministriesFake.load).toHaveBeenCalledWith({ force: true });
  });
});

/* ── ProfileSection ────────────────────────────────────────────────────── */

describe('ProfileSection', () => {
  it('is the "Perfil" region: photo and name, then the account facts', () => {
    render(ProfileSection, { props: { user: userFixture(), profile: profileFixture() } });
    expect(screen.getByRole('region', { name: 'Perfil' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Foto y nombre' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Datos de la cuenta' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Nombre visible/ })).toHaveValue('Ana Pérez');
  });

  it('an account without a name shows by its email in the initials', () => {
    const { container } = render(ProfileSection, {
      props: { user: userFixture(), profile: profileFixture({ display_name: '  ' }) },
    });
    expect(container.querySelector('.ird-avatar__fallback')?.textContent?.trim()).toBe('A');
  });
});
