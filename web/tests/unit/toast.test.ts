// S15 — the toast store on its own, with no component in the loop: this is the
// "callable from non-component code" contract (S38) under test. Fake timers
// drive the auto-dismiss → leaving → removed lifecycle; only setTimeout /
// clearTimeout / Date are faked so Svelte's microtask flush stays real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOAST_DURATION_MS,
  TOAST_EXIT_MS,
  TOAST_MAX,
  TOAST_UNDO_DURATION_MS,
  TOAST_UNDO_LABEL,
  toast,
} from '$lib/stores/toast.svelte';

// Only the timer surface the store uses. queueMicrotask stays real so Svelte's
// own flush keeps working in the sibling component suite.
const TO_FAKE = ['setTimeout', 'clearTimeout', 'Date'] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: [...TO_FAKE] });
  toast.clear();
});

afterEach(() => {
  toast.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('toast store — the unified API', () => {
  it('success / error / info push one item each, oldest first', () => {
    toast.success('Guardado');
    toast.error('No pudimos guardar los cambios.');
    toast.info('Sincronizando…');

    expect(toast.items).toHaveLength(3);
    expect(toast.items.map((t) => t.variant)).toEqual(['success', 'error', 'info']);
    expect(toast.items.map((t) => t.message)).toEqual([
      'Guardado',
      'No pudimos guardar los cambios.',
      'Sincronizando…',
    ]);
  });

  it('gives every toast a unique id and returns it', () => {
    const a = toast.success('a');
    const b = toast.success('b');
    expect(a).not.toBe(b);
    expect(toast.items.map((t) => t.id)).toEqual([a, b]);
  });

  it('errors are assertive (role=alert), everything else polite (role=status)', () => {
    toast.error('e');
    toast.success('s');
    toast.info('i');
    toast.undo('u', { onAction: () => {} });
    expect(toast.items.map((t) => t.role)).toEqual(['alert', 'status', 'status', 'status']);
  });

  it('stores the message verbatim — escaping is the renderer’s job, not the store’s', () => {
    toast.error('<img src=x onerror="alert(1)">');
    expect(toast.items[0].message).toBe('<img src=x onerror="alert(1)">');
  });
});

describe('toast store — lifecycle', () => {
  it('auto-dismisses after TOAST_DURATION_MS, then removes after the exit animation', () => {
    toast.success('Guardado');

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    expect(toast.items[0].leaving).toBe(false);

    vi.advanceTimersByTime(1);
    expect(toast.items).toHaveLength(1);
    expect(toast.items[0].leaving).toBe(true);

    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(toast.items).toHaveLength(0);
  });

  it('honours an explicit duration', () => {
    toast.info('breve', { duration: 500 });
    vi.advanceTimersByTime(499);
    expect(toast.items[0].leaving).toBe(false);
    vi.advanceTimersByTime(1 + TOAST_EXIT_MS);
    expect(toast.items).toHaveLength(0);
  });

  it('duration 0 stays up until it is dismissed', () => {
    const id = toast.info('Sincronizando…', { duration: 0 });
    vi.advanceTimersByTime(TOAST_DURATION_MS * 10);
    expect(toast.items).toHaveLength(1);

    toast.dismiss(id);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(toast.items).toHaveLength(0);
  });

  it('dismiss() is idempotent and unknown ids are a no-op', () => {
    const id = toast.success('Guardado');
    toast.dismiss(id);
    toast.dismiss(id);
    toast.dismiss(id + 999);
    expect(toast.items).toHaveLength(1);
    expect(toast.items[0].leaving).toBe(true);

    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(toast.items).toHaveLength(0);
  });

  it('a dismissed toast never fires its auto-dismiss timer afterwards', () => {
    const id = toast.success('Guardado');
    toast.dismiss(id);
    vi.advanceTimersByTime(TOAST_DURATION_MS * 3);
    expect(toast.items).toHaveLength(0);
  });

  it('clear() drops everything immediately, animation and timers included', () => {
    toast.success('a');
    toast.error('b');
    toast.clear();
    expect(toast.items).toHaveLength(0);
    vi.advanceTimersByTime(TOAST_DURATION_MS * 3);
    expect(toast.items).toHaveLength(0);
  });

  it(`keeps at most TOAST_MAX (${TOAST_MAX}) toasts, evicting the oldest`, () => {
    for (let i = 1; i <= TOAST_MAX + 2; i++) toast.info(`m${i}`);
    expect(toast.items).toHaveLength(TOAST_MAX);
    expect(toast.items[0].message).toBe('m3');
    expect(toast.items.at(-1)?.message).toBe(`m${TOAST_MAX + 2}`);
  });
});

describe('toast store — undo / action', () => {
  it('undo() gets the longer window and the default Spanish label', () => {
    toast.undo('Álbum eliminado', { onAction: () => {} });
    expect(toast.items[0].variant).toBe('undo');
    expect(toast.items[0].action?.label).toBe(TOAST_UNDO_LABEL);

    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(toast.items[0].leaving).toBe(false);
    vi.advanceTimersByTime(TOAST_UNDO_DURATION_MS - TOAST_DURATION_MS);
    expect(toast.items[0].leaving).toBe(true);
  });

  it('accepts a custom label, and falls back when it is blank', () => {
    toast.undo('a', { label: 'Restaurar', onAction: () => {} });
    toast.undo('b', { label: '   ', onAction: () => {} });
    expect(toast.items[0].action?.label).toBe('Restaurar');
    expect(toast.items[1].action?.label).toBe(TOAST_UNDO_LABEL);
  });

  it('an action can ride on any variant (e.g. "Reintentar" on an error)', () => {
    toast.error('No pudimos guardar los cambios.', {
      action: { label: 'Reintentar', onAction: () => {} },
    });
    expect(toast.items[0].variant).toBe('error');
    expect(toast.items[0].action?.label).toBe('Reintentar');
  });

  it('runAction() runs the handler once and dismisses the toast', () => {
    const onAction = vi.fn();
    const id = toast.undo('Álbum eliminado', { onAction });

    toast.runAction(id);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toast.items[0].leaving).toBe(true);

    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(toast.items).toHaveLength(0);

    toast.runAction(id);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('a throwing handler is logged with the module tag and still closes the toast', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = toast.undo('Álbum eliminado', {
      onAction: () => {
        throw new Error('boom');
      },
    });

    expect(() => toast.runAction(id)).not.toThrow();
    expect(console.error).toHaveBeenCalledWith('[toast] action failed:', expect.any(Error));
    expect(toast.items[0].leaving).toBe(true);
  });
});

describe('toast store — pause / resume', () => {
  it('pause() holds the countdown and resume() gives back exactly the time left', () => {
    toast.info('Sincronizando…');
    vi.advanceTimersByTime(3000);

    toast.pause();
    vi.advanceTimersByTime(TOAST_DURATION_MS * 5);
    expect(toast.items[0].leaving).toBe(false);

    toast.resume();
    vi.advanceTimersByTime(999);
    expect(toast.items[0].leaving).toBe(false);
    vi.advanceTimersByTime(1);
    expect(toast.items[0].leaving).toBe(true);
  });

  it('a toast raised while paused does not start counting down until resume()', () => {
    toast.pause();
    toast.success('Guardado');
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    expect(toast.items[0].leaving).toBe(false);

    toast.resume();
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(toast.items[0].leaving).toBe(true);
  });

  it('pause() and resume() are idempotent', () => {
    toast.info('a');
    toast.pause();
    toast.pause();
    toast.resume();
    toast.resume();
    vi.advanceTimersByTime(TOAST_DURATION_MS + TOAST_EXIT_MS);
    expect(toast.items).toHaveLength(0);
  });
});
