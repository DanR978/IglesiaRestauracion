// S16 — `await confirm(…)` + <ConfirmHost> under jsdom: the ROADMAP "done
// when" as tests. The promise resolves true/false on every path, the call is
// made from PLAIN MODULE CODE (never a component event handler) exactly as
// notifications.clearAll and every destructive admin action will make it, and a
// confirm raised over an open Modal stacks above it, keeps the page locked when
// it closes, and hands focus back into the modal underneath.
//
// Svelte updates are applied with flushSync() because the store is mutated from
// outside the component tree.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmHost from '$lib/components/ConfirmHost.svelte';
import {
  CONFIRM_DEFAULT_NO,
  CONFIRM_DEFAULT_TITLE,
  CONFIRM_DEFAULT_YES,
  confirm,
  confirmState,
} from '$lib/stores/confirm.svelte';
import { FLOATING_POPUP_CLASS, bodyScrollLockDepth } from '$lib/scroll-lock';
import ModalHarness from './fixtures/ModalHarness.svelte';

/** Ask, then let Svelte paint the dialog. */
function ask(...args: Parameters<typeof confirm>): Promise<boolean> {
  const answer = confirm(...args);
  flushSync();
  return answer;
}

function press(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  const from = document.activeElement ?? document.body;
  return fireEvent.keyDown(from, { key, ...init });
}

const dialogs = (): HTMLElement[] =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]'));
const confirmDialog = (): HTMLElement =>
  document.body.querySelector('.ird-modal--confirm [role="dialog"]') as HTMLElement;

beforeEach(() => {
  document.body.style.overflow = '';
  document.body.classList.remove(FLOATING_POPUP_CLASS);
});

afterEach(() => {
  confirmState.cancelAll();
  flushSync();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('confirm() — the promise contract', () => {
  it('shows nothing until something asks', () => {
    render(ConfirmHost);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(confirmState.current).toBeNull();
  });

  it('resolves true on the affirmative button', async () => {
    const { getByRole } = render(ConfirmHost);
    const answer = ask('¿Eliminar el álbum?', 'Esta acción no se puede deshacer.');

    await fireEvent.click(getByRole('button', { name: CONFIRM_DEFAULT_YES }));
    await expect(answer).resolves.toBe(true);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('resolves false on the cancel button', async () => {
    const { getByRole } = render(ConfirmHost);
    const answer = ask('¿Eliminar el álbum?');

    await fireEvent.click(getByRole('button', { name: CONFIRM_DEFAULT_NO }));
    await expect(answer).resolves.toBe(false);
  });

  it('resolves false on the × button', async () => {
    const { getByRole } = render(ConfirmHost);
    const answer = ask('¿Eliminar el álbum?');

    await fireEvent.click(getByRole('button', { name: 'Cerrar' }));
    await expect(answer).resolves.toBe(false);
  });

  it('resolves false on Escape', async () => {
    render(ConfirmHost);
    const answer = ask('¿Eliminar el álbum?');

    await press('Escape');
    await expect(answer).resolves.toBe(false);
  });

  it('resolves false on a scrim click', async () => {
    render(ConfirmHost);
    const answer = ask('¿Eliminar el álbum?');

    const scrim = document.body.querySelector('.ird-modal--confirm') as HTMLElement;
    await fireEvent.mouseDown(scrim);
    await fireEvent.click(scrim);
    await expect(answer).resolves.toBe(false);
  });

  it('resolves false for everything still pending when cancelAll() runs', async () => {
    render(ConfirmHost);
    const first = ask('¿Cerrar sesión?');
    const second = ask('¿Descartar cambios?');

    confirmState.cancelAll();
    flushSync();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('confirm() — content and copy', () => {
  it('uses the legacy Spanish defaults and renders the message as TEXT', () => {
    render(ConfirmHost);
    // A record name a visitor typed. It must reach the screen as characters.
    ask('', '<img src=x onerror="alert(1)">');

    const dialog = confirmDialog();
    expect(dialog).toHaveAccessibleName(CONFIRM_DEFAULT_TITLE);
    expect(dialog).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(dialog.querySelector('img')).toBeNull();
    expect(within(dialog).getByRole('button', { name: CONFIRM_DEFAULT_YES })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: CONFIRM_DEFAULT_NO })).toBeInTheDocument();
  });

  it('is danger-styled by default and plain when danger is false', async () => {
    const { getByRole } = render(ConfirmHost);

    const dangerous = ask('¿Eliminar el ingreso?');
    expect(getByRole('button', { name: CONFIRM_DEFAULT_YES })).toHaveClass('ird-btn--danger');
    await fireEvent.click(getByRole('button', { name: CONFIRM_DEFAULT_NO }));
    await expect(dangerous).resolves.toBe(false);

    const benign = ask('¿Descartar los cambios?', '', {
      danger: false,
      confirmLabel: 'Sí, descartar',
      cancelLabel: 'Seguir editando',
    });
    const yes = getByRole('button', { name: 'Sí, descartar' });
    expect(yes).toHaveClass('ird-btn--primary');
    expect(yes).not.toHaveClass('ird-btn--danger');
    expect(getByRole('button', { name: 'Seguir editando' })).toBeInTheDocument();
    await fireEvent.click(yes);
    await expect(benign).resolves.toBe(true);
  });

  it('lands focus on the SAFER button, never the destructive one', () => {
    const { getByRole } = render(ConfirmHost);
    ask('¿Eliminar el grupo?');

    expect(document.activeElement).toBe(getByRole('button', { name: CONFIRM_DEFAULT_NO }));
  });
});

describe('confirm() — queueing (the legacy overwrote its single resolver)', () => {
  it('answers each request in turn instead of hanging the first one', async () => {
    const { getByRole } = render(ConfirmHost);

    const first = ask('¿Eliminar A?');
    const second = ask('¿Eliminar B?');
    expect(confirmState.size).toBe(2);
    expect(dialogs()).toHaveLength(1);
    expect(confirmDialog()).toHaveAccessibleName('¿Eliminar A?');

    await fireEvent.click(getByRole('button', { name: CONFIRM_DEFAULT_YES }));
    await expect(first).resolves.toBe(true);

    // The second one takes the screen; the legacy lost its resolver here.
    expect(confirmDialog()).toHaveAccessibleName('¿Eliminar B?');
    await fireEvent.click(getByRole('button', { name: CONFIRM_DEFAULT_NO }));
    await expect(second).resolves.toBe(false);
    expect(confirmState.size).toBe(0);
  });
});

describe('confirm() — stacking above an open Modal', () => {
  // Vitest has no layout engine and does not inject a component's scoped
  // <style>, so the elevation itself is asserted on the CSS SOURCE (the same
  // approach $lib/test/css.ts takes for the token sheets); the browser-side
  // computed z-index is checked in tests/e2e/kit-modal.spec.ts.
  it('declares the legacy #confirmModal elevation', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/components/Modal.svelte'), 'utf8');
    expect(source).toMatch(
      /\.ird-modal--confirm\s*\{[^}]*z-index:\s*calc\(var\(--z-modal\) \+ 10\)/,
    );
  });

  it('opens above the modal, traps focus in itself, and Escape closes only it', async () => {
    const modal = render(ModalHarness, { props: { open: true, title: 'Inscripción' } });
    render(ConfirmHost);

    const base = modal.getByRole('dialog');
    const save = within(base).getByTestId('footer-save');
    save.focus();

    // Raised from plain module code while the modal is up, exactly as an admin
    // delete handler will raise it.
    const answer = ask('¿Eliminar la inscripción?');

    const dialog = confirmDialog();
    expect(dialogs()).toHaveLength(2);
    expect(dialog.closest('.ird-modal')).toHaveClass('ird-modal--confirm');
    // Two overlays, one page: the lock is counted, not a flag.
    expect(bodyScrollLockDepth()).toBe(2);

    // Tab cycles inside the confirm; the modal's own controls are unreachable.
    const inConfirm = within(dialog).getByRole('button', { name: CONFIRM_DEFAULT_YES });
    inConfirm.focus();
    await press('Tab');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(base.contains(document.activeElement)).toBe(false);

    await press('Escape');
    await expect(answer).resolves.toBe(false);

    // The modal underneath survived, kept the page locked, and took focus back.
    expect(dialogs()).toHaveLength(1);
    expect(modal.getByTestId('open-state')).toHaveAttribute('data-open', 'true');
    expect(bodyScrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body).toHaveClass(FLOATING_POPUP_CLASS);
    expect(base.contains(document.activeElement)).toBe(true);
  });

  it('unlocks the page only once the modal beneath it closes too', async () => {
    const modal = render(ModalHarness, { props: { open: true } });
    render(ConfirmHost);

    const answer = ask('¿Eliminar?');
    await press('Escape');
    await expect(answer).resolves.toBe(false);
    expect(document.body.style.overflow).toBe('hidden');

    await press('Escape');
    expect(modal.getByTestId('open-state')).toHaveAttribute('data-open', 'false');
    expect(bodyScrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe('');
    expect(document.body).not.toHaveClass(FLOATING_POPUP_CLASS);
  });
});
