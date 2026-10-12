/* ============================================================================
 * web/src/lib/stores/confirm.svelte.ts — the promise-returning confirm (S16)
 * ----------------------------------------------------------------------------
 * Retires js/pages/admin/ui.js `confirm(title, msg)` + the single
 * #confirmModal block in admin/index.html:1361.
 *
 * Runes module state, so — exactly like the legacy function it replaces — it is
 * callable from NON-COMPONENT code: a repo module, a notification poller
 * (`notifications.clearAll`), any destructive action across treasury,
 * discipleship, events, gallery, ministries, users, presets and the designer.
 * <ConfirmHost> is the only renderer and holds no state of its own.
 *
 *   if (!(await confirm('¿Eliminar el álbum?', 'Esta acción no se puede deshacer.'))) return;
 *
 * `title` and `message` are rendered as TEXT by <ConfirmHost>; there is no
 * {@html} anywhere in this path (D-005), so a record name typed by a visitor
 * cannot inject markup.
 *
 * TWO THINGS THE LEGACY GOT WRONG, fixed here:
 *   1. Legacy kept ONE resolver (`setConfirmResolve`). A second confirm raised
 *      while the first was open overwrote it, and the first `await confirm(…)`
 *      never settled — a silently hung caller. Requests are QUEUED here: every
 *      call settles, in order.
 *   2. Legacy hard-cleared body overflow on close, unlocking the page when the
 *      confirm was opened over a modal. The reference-counted lock in
 *      $lib/scroll-lock (via Modal) fixes that for every overlay at once.
 *
 * Usage:
 *   import { confirm } from '$lib/stores/confirm.svelte';
 *   const ok = await confirm('¿Cerrar sesión?');                       // danger
 *   const ok = await confirm('¿Descartar cambios?', '', { danger: false });
 * ========================================================================== */

export interface ConfirmOptions {
  /** Text of the affirmative button. Default: "Sí, continuar". */
  confirmLabel?: string;
  /** Text of the safe button. Default: "No, cancelar". */
  cancelLabel?: string;
  /**
   * Red affirmative button. Defaults to TRUE — the legacy markup's
   * `btn--danger`, and near every caller is a delete. Pass `false` for a
   * merely-interrupting question so it does not read as destructive.
   */
  danger?: boolean;
}

export interface ConfirmRequest {
  readonly id: number;
  readonly title: string;
  /** May be empty: some confirms are a title alone. */
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly danger: boolean;
}

/** Fallback heading — the legacy dialog's own default text. */
export const CONFIRM_DEFAULT_TITLE = '¿Estás seguro?';
export const CONFIRM_DEFAULT_YES = 'Sí, continuar';
export const CONFIRM_DEFAULT_NO = 'No, cancelar';

interface PendingConfirm {
  readonly request: ConfirmRequest;
  readonly settle: (answer: boolean) => void;
}

/* Plain array on purpose: the queue behind the current request is bookkeeping,
   never read from a template. `current` is the one piece of state the UI
   observes, so a reactive collection would only add re-runs. */
const queue: PendingConfirm[] = [];

let current = $state<ConfirmRequest | null>(null);
let nextId = 1;

function activate(): void {
  current = queue.length > 0 ? queue[0].request : null;
}

/**
 * Ask the user. Resolves `true` only for the affirmative button — No, ×,
 * Escape and a scrim click all resolve `false`, and so does `cancelAll()`.
 * Never rejects, so a caller can `if (await confirm(…))` without a try/catch.
 */
export function confirm(
  title: string,
  message = '',
  options: ConfirmOptions = {},
): Promise<boolean> {
  return new Promise<boolean>((settle) => {
    queue.push({
      request: {
        id: nextId++,
        title: title.trim() || CONFIRM_DEFAULT_TITLE,
        message,
        confirmLabel: options.confirmLabel?.trim() || CONFIRM_DEFAULT_YES,
        cancelLabel: options.cancelLabel?.trim() || CONFIRM_DEFAULT_NO,
        danger: options.danger ?? true,
      },
      settle,
    });
    activate();
  });
}

/** Answer the request on screen and show the next queued one, if any. */
function answer(value: boolean): void {
  const entry = queue.shift();
  activate();
  entry?.settle(value);
}

/**
 * Settle everything as `false` and clear the screen — sign-out, or a route
 * change that unmounts the surface a pending confirm belonged to.
 */
function cancelAll(): void {
  const pending = queue.splice(0, queue.length);
  current = null;
  for (const entry of pending) entry.settle(false);
}

export const confirmState = {
  /** The request <ConfirmHost> is showing, or null. Read it in a template. */
  get current(): ConfirmRequest | null {
    return current;
  },
  /** How many requests are open, including the one on screen. */
  get size(): number {
    return queue.length;
  },
  answer,
  cancelAll,
};
