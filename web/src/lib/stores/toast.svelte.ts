/* ============================================================================
 * web/src/lib/stores/toast.svelte.ts — the ONE toast system (S15)
 * ----------------------------------------------------------------------------
 * Retires BOTH legacy toast systems:
 *   · public  js/lib/toast.js        showToast(msg, { ok, ms })
 *   · admin   js/pages/admin/ui.js   toast(msg, 'success'|'error'|'info')
 *
 * Runes module state, so it is callable from NON-component code — a repo
 * module, a realtime subscription, a notification poller (S38) — exactly like
 * the two legacy functions were, and from a component just the same.
 * <ToastHost> is the only renderer and holds no state of its own.
 *
 * Messages are TEXT. <ToastHost> interpolates them; it never uses {@html}
 * (D-005), which is why a Postgres error string or an email address can never
 * inject markup — the same guarantee the legacy bought with textContent.
 *
 * The store owns the whole lifecycle (schedule → leaving → removed) so a
 * caller outside a component gets the exit animation for free and so the
 * timing is unit-testable without a DOM.
 *
 * Usage:
 *   import { toast } from '$lib/stores/toast.svelte';
 *   toast.success('Guardado');
 *   toast.error('No pudimos guardar los cambios. Intenta de nuevo.');
 *   toast.info('Sincronizando…', { duration: 0 });           // until closed
 *   toast.undo('Álbum eliminado', { onAction: () => restore(id) });
 * ========================================================================== */
import { motionMs } from '$lib/reduced-motion';

export type ToastVariant = 'success' | 'error' | 'info' | 'undo';
export type ToastRole = 'alert' | 'status';

export interface ToastAction {
  /** Button text. Defaults to TOAST_UNDO_LABEL. */
  label?: string;
  onAction: () => void;
}

export interface ToastOptions {
  /** ms before auto-dismiss. `0` (or less) keeps the toast up until it is closed. */
  duration?: number;
  /** Action button — "Deshacer" after a delete, "Reintentar" after a failed write. */
  action?: ToastAction;
}

export interface ToastItem {
  readonly id: number;
  readonly variant: ToastVariant;
  /** Rendered as text, never as HTML. */
  readonly message: string;
  /** error → assertive; everything else → polite. The legacy set the role per type. */
  readonly role: ToastRole;
  readonly action: { readonly label: string; readonly onAction: () => void } | null;
  /** True while the exit animation runs; <ToastHost> adds `.toast--leaving`. */
  readonly leaving: boolean;
}

/** The item as the store holds it: only `leaving` ever changes after creation. */
interface ToastRecord extends Omit<ToastItem, 'leaving'> {
  leaving: boolean;
}

/** Auto-dismiss window. DESIGN-SYSTEM says "~4s"; legacy admin used exactly 4000. */
export const TOAST_DURATION_MS = 4000;
/** An undo offer has to outlive the glance that notices it. */
export const TOAST_UNDO_DURATION_MS = 8000;
/** Exit animation length. Must match `.toast--leaving` in ToastHost.svelte. */
export const TOAST_EXIT_MS = 180;
/** Oldest is evicted past this: a retry loop can never bury the screen. */
export const TOAST_MAX = 4;
export const TOAST_UNDO_LABEL = 'Deshacer';

/** A pausable auto-dismiss timer. `remaining` is what is left when paused. */
interface Countdown {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

const items = $state<ToastRecord[]>([]);

/* Timer bookkeeping only — never read from a template, so a reactive
   SvelteMap would buy nothing and re-run readers on every tick. `items` is
   the one piece of state the UI observes. */
/* eslint-disable svelte/prefer-svelte-reactivity */
const countdowns = new Map<number, Countdown>();
const exits = new Map<number, ReturnType<typeof setTimeout>>();
/* eslint-enable svelte/prefer-svelte-reactivity */

let nextId = 1;
let paused = false;

/**
 * Timers only make sense where something renders. Under prerender (Node, no
 * document) a pending timer would hold the build process open for nothing.
 */
function canSchedule(): boolean {
  return typeof document !== 'undefined';
}

function startCountdown(id: number): void {
  const c = countdowns.get(id);
  if (!c || c.handle !== null || c.remaining <= 0) return;
  c.startedAt = Date.now();
  c.handle = setTimeout(() => {
    countdowns.delete(id);
    dismiss(id);
  }, c.remaining);
}

function stopCountdown(id: number): void {
  const c = countdowns.get(id);
  if (!c || c.handle === null) return;
  clearTimeout(c.handle);
  c.handle = null;
  c.remaining = Math.max(0, c.remaining - (Date.now() - c.startedAt));
}

function clearTimers(id: number): void {
  stopCountdown(id);
  countdowns.delete(id);
  const exit = exits.get(id);
  if (exit !== undefined) {
    clearTimeout(exit);
    exits.delete(id);
  }
}

function remove(id: number): void {
  clearTimers(id);
  const i = items.findIndex((t) => t.id === id);
  if (i !== -1) items.splice(i, 1);
}

function defaultDuration(variant: ToastVariant): number {
  return variant === 'undo' ? TOAST_UNDO_DURATION_MS : TOAST_DURATION_MS;
}

/** Push a toast onto the stack. Returns its id, so a caller can dismiss it early. */
function show(variant: ToastVariant, message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  const action = opts.action;
  items.push({
    id,
    variant,
    message,
    role: variant === 'error' ? 'alert' : 'status',
    action: action
      ? { label: action.label?.trim() || TOAST_UNDO_LABEL, onAction: action.onAction }
      : null,
    leaving: false,
  });
  while (items.length > TOAST_MAX) remove(items[0].id);

  const duration = opts.duration ?? defaultDuration(variant);
  if (duration > 0 && canSchedule()) {
    countdowns.set(id, { handle: null, remaining: duration, startedAt: 0 });
    if (!paused) startCountdown(id);
  }
  return id;
}

/** Begin the exit. The item stays in the list, flagged `leaving`, until the animation ends. */
function dismiss(id: number): void {
  const item = items.find((t) => t.id === id);
  if (!item || item.leaving) return;
  clearTimers(id);
  item.leaving = true;

  const exitMs = motionMs(TOAST_EXIT_MS);
  if (exitMs <= 0 || !canSchedule()) {
    remove(id);
    return;
  }
  exits.set(
    id,
    setTimeout(() => {
      exits.delete(id);
      remove(id);
    }, exitMs),
  );
}

/** Run the action button and close the toast — even if the handler throws. */
function runAction(id: number): void {
  const item = items.find((t) => t.id === id);
  if (!item) return;
  try {
    item.action?.onAction();
  } catch (error) {
    console.error('[toast] action failed:', error);
  } finally {
    dismiss(id);
  }
}

/** Hold every countdown (pointer over the stack, or focus inside it). */
function pause(): void {
  if (paused) return;
  paused = true;
  for (const id of countdowns.keys()) stopCountdown(id);
}

/** Resume every held countdown with the time it had left. */
function resume(): void {
  if (!paused) return;
  paused = false;
  for (const id of countdowns.keys()) startCountdown(id);
}

/** Drop everything at once, with no exit animation (route change, sign-out). */
function clear(): void {
  for (const item of [...items]) remove(item.id);
  paused = false;
}

export const toast = {
  /** The live stack, oldest first. Read it in a template; mutate it through the methods. */
  get items(): readonly ToastItem[] {
    return items;
  },
  show,
  success: (message: string, opts?: ToastOptions): number => show('success', message, opts),
  error: (message: string, opts?: ToastOptions): number => show('error', message, opts),
  info: (message: string, opts?: ToastOptions): number => show('info', message, opts),
  /** Neutral toast with an action button — the affordance destructive actions lack today. */
  undo: (message: string, action: ToastAction, opts?: ToastOptions): number =>
    show('undo', message, { ...opts, action }),
  dismiss,
  runAction,
  pause,
  resume,
  clear,
};
