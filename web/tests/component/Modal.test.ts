// S16 — <Modal> under jsdom: the ROADMAP "done when" as tests. bind:open is
// two-way, Escape and a scrim click close, the scroll lock saves AND restores
// the previous body overflow, focus moves in / is trapped / returns to the
// trigger, and two instances never share an element id (G-009).
//
// Everything is driven through ModalHarness, a fixture that BINDS `open` — the
// only way to prove the binding writes back to the parent — and puts a real
// trigger button outside the dialog for focus-return to aim at.
import { fireEvent, render, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from '$lib/components/Modal.svelte';
import { MODAL_VARIANTS } from '$lib/components/modal';
import { FLOATING_POPUP_CLASS, bodyScrollLockDepth } from '$lib/scroll-lock';
import { focusTrapDepth } from '$lib/focus-trap';
import ModalHarness from './fixtures/ModalHarness.svelte';

/** Press a key on whatever currently has focus, so it propagates like a real one. */
function press(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  const from = document.activeElement ?? document.body;
  return fireEvent.keyDown(from, { key, ...init });
}

const dialogOf = (): HTMLElement => document.body.querySelector('[role="dialog"]') as HTMLElement;
const scrimOf = (): HTMLElement => document.body.querySelector('.ird-modal') as HTMLElement;

beforeEach(() => {
  document.body.style.overflow = '';
  document.body.classList.remove(FLOATING_POPUP_CLASS);
});

afterEach(() => {
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('Modal — structure and a11y', () => {
  it('renders nothing while closed, and leaves the page scrollable', () => {
    render(ModalHarness, { props: { open: false } });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(bodyScrollLockDepth()).toBe(0);
  });

  it('is a labelled modal dialog with a Cerrar button, a body and a footer', () => {
    render(ModalHarness, { props: { open: true, title: 'Editar evento' } });

    const dialog = dialogOf();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Editar evento');
    expect(within(dialog).getByRole('heading', { name: 'Editar evento' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    expect(within(dialog).getByTestId('body-input')).toBeInTheDocument();
    expect(within(dialog).getByTestId('footer-save')).toBeInTheDocument();
    expect(dialog.querySelector('.ird-modal__spacer')).not.toBeNull();
  });

  it('omits the close button when showClose is false', () => {
    render(ModalHarness, { props: { open: true, showClose: false } });

    expect(within(dialogOf()).queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });

  it('renders the error region as role=alert, and only when there is an error', async () => {
    const { rerender } = render(ModalHarness, { props: { open: true, error: null } });
    expect(document.body.querySelector('[role="alert"]')).toBeNull();

    await rerender({ open: true, error: 'No pudimos guardar los cambios.' });
    const alert = document.body.querySelector('[role="alert"]') as HTMLElement;
    expect(alert).toHaveTextContent('No pudimos guardar los cambios.');
    expect(alert).toHaveClass('ird-modal__error');
  });

  it('puts the variant modifier on the scrim', () => {
    for (const variant of MODAL_VARIANTS) {
      const { unmount } = render(ModalHarness, { props: { open: true, variant } });
      expect(scrimOf()).toHaveClass('ird-modal', `ird-modal--${variant}`);
      unmount();
    }
  });

  it('gives every instance its own header id — no shared global ids (G-009)', () => {
    render(ModalHarness, { props: { open: true, title: 'Preset de calendario' } });
    render(ModalHarness, { props: { open: true, title: 'Preset de acceso' } });

    const [a, b] = Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]'));
    const idA = a.getAttribute('aria-labelledby');
    const idB = b.getAttribute('aria-labelledby');

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
    expect(a).toHaveAccessibleName('Preset de calendario');
    expect(b).toHaveAccessibleName('Preset de acceso');
  });

  it('falls back to ariaLabel when there is no title', () => {
    render(Modal, { props: { open: true, ariaLabel: 'Detalles de la inscripción' } });

    const dialog = dialogOf();
    expect(dialog).toHaveAccessibleName('Detalles de la inscripción');
    expect(dialog).not.toHaveAttribute('aria-labelledby');
  });
});

describe('Modal — bind:open and the close paths', () => {
  it('opens from the trigger and writes the binding back to the parent', async () => {
    const { getByTestId } = render(ModalHarness, { props: { open: false } });
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'false');

    await fireEvent.click(getByTestId('trigger'));
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'true');
    expect(dialogOf()).toBeInTheDocument();

    await fireEvent.click(within(dialogOf()).getByRole('button', { name: 'Cerrar' }));
    // The parent's own value flipped — this is bind:open, not a local copy.
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'false');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes on Escape and reports it once', async () => {
    const onclose = vi.fn();
    const { getByTestId } = render(ModalHarness, { props: { open: true, onclose } });

    await press('Escape');
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'false');
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when closeOnEscape is false', async () => {
    const { getByTestId } = render(ModalHarness, {
      props: { open: true, closeOnEscape: false },
    });

    await press('Escape');
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'true');
  });

  it('closes on a scrim click but not on a click inside the dialog', async () => {
    const { getByTestId } = render(ModalHarness, { props: { open: true } });
    const scrim = scrimOf();

    await fireEvent.mouseDown(dialogOf());
    await fireEvent.click(dialogOf());
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'true');

    await fireEvent.mouseDown(scrim);
    await fireEvent.click(scrim);
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'false');
  });

  it('ignores a scrim click when the press STARTED inside the dialog (a text drag)', async () => {
    const { getByTestId } = render(ModalHarness, { props: { open: true } });

    await fireEvent.mouseDown(getByTestId('body-input'));
    await fireEvent.click(scrimOf());
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'true');
  });

  it('ignores a scrim click when closeOnBackdrop is false', async () => {
    const { getByTestId } = render(ModalHarness, {
      props: { open: true, closeOnBackdrop: false },
    });

    const scrim = scrimOf();
    await fireEvent.mouseDown(scrim);
    await fireEvent.click(scrim);
    expect(getByTestId('open-state')).toHaveAttribute('data-open', 'true');
  });
});

describe('Modal — reference-counted scroll lock', () => {
  it('locks on open and RESTORES the previous overflow on close (not "")', async () => {
    document.body.style.overflow = 'auto';

    const { getByTestId } = render(ModalHarness, { props: { open: false } });
    await fireEvent.click(getByTestId('trigger'));

    expect(document.body.style.overflow).toBe('hidden');
    expect(bodyScrollLockDepth()).toBe(1);
    expect(document.body).toHaveClass(FLOATING_POPUP_CLASS);

    await press('Escape');
    // Legacy hard-cleared this to ''; the port puts back what was there.
    expect(document.body.style.overflow).toBe('auto');
    expect(bodyScrollLockDepth()).toBe(0);
    expect(document.body).not.toHaveClass(FLOATING_POPUP_CLASS);
  });

  it('counts: closing one of two open modals keeps the page locked', async () => {
    const a = render(ModalHarness, { props: { open: true, title: 'A' } });
    render(ModalHarness, { props: { open: true, title: 'B' } });
    expect(bodyScrollLockDepth()).toBe(2);
    expect(document.body.style.overflow).toBe('hidden');

    a.unmount();
    flushSync();
    expect(bodyScrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body).toHaveClass(FLOATING_POPUP_CLASS);
  });
});

describe('Modal — focus', () => {
  it('moves focus into the dialog on open and back to the trigger on close', async () => {
    const { getByTestId } = render(ModalHarness, { props: { open: false } });
    const trigger = getByTestId('trigger');

    trigger.focus();
    await fireEvent.click(trigger);
    expect(document.activeElement).toBe(dialogOf());

    await press('Escape');
    expect(document.activeElement).toBe(trigger);
  });

  it('honours initialFocus, resolved inside this dialog only', async () => {
    const { getByTestId } = render(ModalHarness, {
      props: { open: true, initialFocus: '[data-testid="footer-save"]' },
    });

    expect(document.activeElement).toBe(getByTestId('footer-save'));
  });

  it('traps Tab at both ends of the dialog', async () => {
    render(ModalHarness, { props: { open: true } });
    const dialog = dialogOf();
    const close = within(dialog).getByRole('button', { name: 'Cerrar' });
    const save = within(dialog).getByTestId('footer-save');

    save.focus();
    await press('Tab');
    expect(document.activeElement).toBe(close);

    await press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(save);
  });

  it('pulls a stray Tab back into the dialog', async () => {
    render(ModalHarness, { props: { open: true } });
    const dialog = dialogOf();

    (document.activeElement as HTMLElement | null)?.blur();
    expect(dialog.contains(document.activeElement)).toBe(false);

    await press('Tab');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('releases the trap when it closes', async () => {
    render(ModalHarness, { props: { open: true } });
    expect(focusTrapDepth()).toBe(1);

    await press('Escape');
    expect(focusTrapDepth()).toBe(0);
  });
});
