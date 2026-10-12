// S15 — <ToastHost> under jsdom: the ROADMAP "done when" as tests. success /
// error / info render, errors are role=alert and the rest role=status, they
// stack, they auto-dismiss on fake timers, and the close button works.
//
// The store is driven from OUTSIDE the component (as a repo module would), so
// every assertion also proves the non-component contract end to end. Svelte
// updates are applied with flushSync() because the mutations come from plain
// module code, not from an event handler.
import { fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToastHost from '$lib/components/ToastHost.svelte';
import { TOAST_DURATION_MS, TOAST_EXIT_MS, toast } from '$lib/stores/toast.svelte';

const TO_FAKE = ['setTimeout', 'clearTimeout', 'Date'] as const;

/** Apply the store mutation, then let Svelte write it to the DOM. */
function settle(): void {
  flushSync();
}

/** Advance the fake clock and settle in one step. */
function tick(ms: number): void {
  vi.advanceTimersByTime(ms);
  flushSync();
}

const toasts = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.toast'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: [...TO_FAKE] });
  toast.clear();
});

afterEach(() => {
  toast.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ToastHost — variants and roles', () => {
  it('starts empty', () => {
    const { container } = render(ToastHost);
    expect(container.querySelector('.toast-host')).not.toBeNull();
    expect(toasts(container)).toHaveLength(0);
  });

  it('renders a success toast: role=status, its fill class and its glyph', () => {
    const { container, getByRole } = render(ToastHost);
    toast.success('Guardado');
    settle();

    const el = getByRole('status');
    expect(el).toHaveClass('toast', 'toast--success');
    expect(el).toHaveTextContent('Guardado');
    expect(el.querySelector('.fa-circle-check')).not.toBeNull();
    expect(toasts(container)).toHaveLength(1);
  });

  it('renders an error toast as role=alert (assertive)', () => {
    const { getByRole, queryByRole } = render(ToastHost);
    toast.error('No pudimos guardar los cambios.');
    settle();

    const el = getByRole('alert');
    expect(el).toHaveClass('toast--error');
    expect(el).toHaveTextContent('No pudimos guardar los cambios.');
    expect(el.querySelector('.fa-circle-exclamation')).not.toBeNull();
    expect(queryByRole('status')).toBeNull();
  });

  it('renders info and undo as role=status with their own glyphs', () => {
    const { container } = render(ToastHost);
    toast.info('Sincronizando…');
    toast.undo('Álbum eliminado', { onAction: () => {} });
    settle();

    const [info, undo] = toasts(container);
    expect(info).toHaveAttribute('role', 'status');
    expect(info).toHaveClass('toast--info');
    expect(info.querySelector('.fa-circle-info')).not.toBeNull();
    expect(undo).toHaveAttribute('role', 'status');
    expect(undo).toHaveClass('toast--undo');
    expect(undo.querySelector('.fa-rotate-left')).not.toBeNull();
  });

  it('stacks multiple toasts, oldest first', () => {
    const { container } = render(ToastHost);
    toast.success('uno');
    toast.error('dos');
    toast.info('tres');
    settle();

    expect(toasts(container).map((el) => el.querySelector('.toast__msg')?.textContent)).toEqual([
      'uno',
      'dos',
      'tres',
    ]);
  });

  it('renders the message as TEXT — never as markup (D-005)', () => {
    const payload = '<img src=x onerror="alert(1)"> & <b>bold</b>';
    const { container } = render(ToastHost);
    toast.error(payload);
    settle();

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('.toast__msg')?.textContent).toBe(payload);
  });
});

describe('ToastHost — dismissal', () => {
  it('auto-dismisses: the exit class comes first, then the node leaves', () => {
    const { container } = render(ToastHost);
    toast.success('Guardado');
    settle();

    tick(TOAST_DURATION_MS - 1);
    expect(toasts(container)[0]).not.toHaveClass('toast--leaving');

    tick(1);
    expect(toasts(container)[0]).toHaveClass('toast--leaving');

    tick(TOAST_EXIT_MS);
    expect(toasts(container)).toHaveLength(0);
  });

  it('closes on the Cerrar button before the timer runs out', async () => {
    const { container, getByLabelText } = render(ToastHost);
    toast.info('Sincronizando…', { duration: 0 });
    settle();

    await fireEvent.click(getByLabelText('Cerrar'));
    expect(toasts(container)[0]).toHaveClass('toast--leaving');

    tick(TOAST_EXIT_MS);
    expect(toasts(container)).toHaveLength(0);
  });

  it('closes only the toast whose button was pressed', async () => {
    const { container, getAllByLabelText } = render(ToastHost);
    toast.success('uno');
    toast.error('dos');
    settle();

    await fireEvent.click(getAllByLabelText('Cerrar')[0]);
    tick(TOAST_EXIT_MS);

    const remaining = toasts(container);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveTextContent('dos');
  });

  it('holds the countdown while the pointer is over a toast', async () => {
    const { container } = render(ToastHost);
    toast.success('Guardado');
    settle();

    await fireEvent.mouseEnter(toasts(container)[0]);
    tick(TOAST_DURATION_MS * 3);
    expect(toasts(container)).toHaveLength(1);
    expect(toasts(container)[0]).not.toHaveClass('toast--leaving');

    await fireEvent.mouseLeave(toasts(container)[0]);
    tick(TOAST_DURATION_MS + TOAST_EXIT_MS);
    expect(toasts(container)).toHaveLength(0);
  });
});

describe('ToastHost — the undo action', () => {
  it('shows the action button and runs it once, then closes', async () => {
    const onAction = vi.fn();
    const { container, getByRole } = render(ToastHost);
    toast.undo('Álbum eliminado', { onAction });
    settle();

    const button = getByRole('button', { name: 'Deshacer' });
    await fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);

    tick(TOAST_EXIT_MS);
    expect(toasts(container)).toHaveLength(0);
  });

  it('has no action button when no action was given', () => {
    const { container } = render(ToastHost);
    toast.success('Guardado');
    settle();
    expect(container.querySelector('.toast__action')).toBeNull();
  });
});

describe('ToastHost — accessibility', () => {
  it('names the icon-only close control and keeps its glyph decorative', () => {
    const { getByLabelText } = render(ToastHost);
    toast.success('Guardado');
    settle();

    const close = getByLabelText('Cerrar');
    expect(close.tagName).toBe('BUTTON');
    expect(close).toHaveAttribute('type', 'button');
    expect(close.querySelector('.fa-xmark')).toHaveAttribute('aria-hidden', 'true');
  });
});
