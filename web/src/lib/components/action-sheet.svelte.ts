/* ============================================================================
 * web/src/lib/components/action-sheet.svelte.ts — the ActionSheet contract (S17)
 * ----------------------------------------------------------------------------
 * The non-visual half of ActionSheet.svelte: the action/group shapes, the
 * geometry of the desktop popover, the section builder, and the singleton
 * `showActionSheet()` every non-component caller uses.
 *
 * Retires FOUR legacy menus (DESIGN-SYSTEM §4.2 · PORT-DEBT S17): the shared
 * `showActionSheet` (js/components/action-sheet.js), `.se-menu__pop`
 * (registrations "Opciones"), `.dscp-member-pop` (discipleship member popover)
 * and the designer `.dz-pop` toolbar menus. Every row kebab routes through
 * this one primitive — that is what fixes the project-treasury
 * "kebab is delete" affordance.
 *
 * Two ways to use it:
 *
 *   1. Imperative (the legacy call shape — treasury, events, users, presets):
 *        import { showActionSheet } from '$lib/components/action-sheet.svelte';
 *        showActionSheet({ trigger: btn, title: ev.title, actions: [
 *          { label: 'Editar',   icon: 'fa-pen',   onClick: () => edit(id) },
 *          { label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: … },
 *        ]});
 *      Requires <ActionSheetHost /> mounted once inside the surface's layout.
 *
 *   2. Declarative, when a component already owns the trigger:
 *        <ActionSheet bind:open trigger={btn} {actions} />
 *
 * Only ONE sheet is ever open: showActionSheet() closes the current one first.
 * ========================================================================== */
import { isFaIconName } from './icon';

/** Row tone. `warn`/`danger` are the two "loud" variants; everything else is `default`. */
export type ActionVariant = 'default' | 'warn' | 'danger';

export interface SheetAction {
  /** Row text. Rendered as TEXT — never markup (D-005). */
  label: string;
  /** Font Awesome solid name, with or without the legacy `fa-` prefix. */
  icon?: string;
  /** Optional second line (the member menu's "Nivel 2 · Crecimiento"). */
  description?: string;
  variant?: ActionVariant;
  /** Focusable but not activatable (`aria-disabled`), so it stays discoverable. */
  disabled?: boolean;
  /** Id of a group declared in `groups`; unknown/absent = the ungrouped section. */
  group?: string;
  /** Run on a short defer so the close animation can start (legacy: 60ms). */
  onClick?: () => void | Promise<void>;
}

export interface SheetGroup {
  id: string;
  /** Section heading above the group's rows. */
  label?: string;
  /** Shown instead of the rows when the group has none ("No hay otros grupos todavía."). */
  empty?: string;
}

export interface ActionSheetRequest {
  /** The control the popover anchors to and returns focus to. */
  trigger?: HTMLElement | null;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  /** Declared groups, rendered in this order before the ungrouped rows. */
  groups?: SheetGroup[];
  /** Mobile-only cancel row. `false` (or '') removes it. */
  cancelLabel?: string | false;
}

/** A queued request, with the identity the host keys its instance on. */
export interface ActionSheetTicket extends ActionSheetRequest {
  readonly key: number;
}

/** Below this width the sheet is a bottom sheet, not an anchored popover. */
export const MOBILE_QUERY = '(max-width: 640px)';
/** The popover never comes closer than this to a viewport edge (legacy: 12px). */
export const VIEWPORT_GUTTER = 12;
/** Gap between the trigger and the popover (legacy: 8px). */
export const TRIGGER_GAP = 8;
/** Measured only after layout; these are the legacy pre-measure fallbacks. */
export const POPOVER_FALLBACK_WIDTH = 240;
export const POPOVER_FALLBACK_HEIGHT = 200;
/** Close animation length — keep in step with the CSS transition. */
export const CLOSE_MS = 240;
/** The action runs after the close has started (legacy: 60ms). */
export const ACTION_DEFER_MS = 60;
export const DEFAULT_CANCEL_LABEL = 'Cancelar';
/** Accessible name when the sheet has no title/subtitle to borrow. */
export const DEFAULT_MENU_LABEL = 'Acciones';

export interface AnchorBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BoxSize {
  width: number;
  height: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  /** true when the popover had to open upward — flips the transform origin. */
  flipped: boolean;
}

/**
 * Where the desktop popover goes: right-aligned to the trigger, below it,
 * flipped above when it would overflow the viewport bottom, then clamped
 * VIEWPORT_GUTTER inside both horizontal gutters.
 *
 * Clamp order is the legacy one (left gutter first, right gutter second), so a
 * sheet wider than the viewport hangs off the LEFT edge rather than the right.
 * That case cannot occur in popover mode (it only runs above 640px, and the
 * panel maxes out at 280px), but keeping the order keeps the parity exact.
 */
export function popoverPosition(
  anchor: AnchorBox,
  sheet: BoxSize,
  viewport: BoxSize,
): PopoverPosition {
  const width = sheet.width || POPOVER_FALLBACK_WIDTH;
  const height = sheet.height || POPOVER_FALLBACK_HEIGHT;

  let left = anchor.right - width;
  let top = anchor.bottom + TRIGGER_GAP;
  let flipped = false;

  if (top + height > viewport.height - VIEWPORT_GUTTER) {
    top = anchor.top - height - TRIGGER_GAP;
    flipped = true;
  }
  if (top < VIEWPORT_GUTTER) top = VIEWPORT_GUTTER;

  if (left < VIEWPORT_GUTTER) left = VIEWPORT_GUTTER;
  if (left + width > viewport.width - VIEWPORT_GUTTER) {
    left = viewport.width - width - VIEWPORT_GUTTER;
  }

  return { top, left, flipped };
}

/**
 * A Font Awesome name the Icon component will accept, or undefined.
 * Legacy callers pass `'fa-pen'`; `'pen'` works too. Anything that is not a
 * kebab token is dropped rather than rendered, so a stored/peer value can
 * never smuggle a second class onto the element (S13 `isFaIconName`).
 */
export function iconName(icon: string | undefined): string | undefined {
  if (typeof icon !== 'string') return undefined;
  const name = icon.trim().replace(/^fa-/, '');
  return isFaIconName(name) ? name : undefined;
}

export interface RenderRow {
  action: SheetAction;
  /** Position in the roving-tabindex ring (cancel takes the last slot). */
  index: number;
  /** First row of its section — draws no top hairline. */
  first: boolean;
  icon?: string;
}

export interface RenderSection {
  id: string;
  label?: string;
  empty?: string;
  rows: RenderRow[];
}

/**
 * Split the flat action list into the sections the sheet renders, numbering
 * every row for the roving tabindex.
 *
 * Order: each group declared in `groups`, in that order, then one trailing
 * section for the rows with no (or an undeclared) group. A declared group with
 * no rows survives only if it has an `empty` fallback — that is the member
 * menu's "Mover a otro grupo → No hay otros grupos todavía." A caller that
 * wants an unlabelled block before its groups declares a group with no label.
 */
export function buildSections(
  actions: readonly SheetAction[],
  groups?: readonly SheetGroup[],
): RenderSection[] {
  const declared = groups ?? [];
  const ids = declared.map((g) => g.id);
  const sections: RenderSection[] = [];
  let index = 0;

  const push = (id: string, rows: readonly SheetAction[], label?: string, empty?: string) => {
    if (!rows.length && !empty) return;
    sections.push({
      id,
      label,
      empty,
      rows: rows.map((action, i) => ({
        action,
        index: index++,
        first: i === 0,
        icon: iconName(action.icon),
      })),
    });
  };

  for (const group of declared) {
    push(
      group.id,
      actions.filter((a) => a.group === group.id),
      group.label,
      group.empty,
    );
  }
  push(
    '',
    actions.filter((a) => !a.group || !ids.includes(a.group)),
  );

  return sections;
}

/** Total rows across every section — the cancel row's index in the ring. */
export function countRows(sections: readonly RenderSection[]): number {
  return sections.reduce((n, s) => n + s.rows.length, 0);
}

/** Whether the viewport is in bottom-sheet territory. Safe on the server. */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

let ticket = $state<ActionSheetTicket | null>(null);
let sequence = 0;

/** The request <ActionSheetHost> is currently showing, if any. */
export const actionSheet = {
  get current(): ActionSheetTicket | null {
    return ticket;
  },
};

/**
 * Open the sheet. Closes whatever is open first — only one at a time, as in
 * legacy. A request with no actions is ignored (legacy returned early too).
 */
export function showActionSheet(request: ActionSheetRequest): void {
  ticket = null;
  if (!request?.actions?.length) return;
  ticket = { ...request, key: ++sequence };
}

/**
 * Close the sheet. With a `key` it only closes that request, so the sheet an
 * action opened is not torn down by the previous sheet's close timer.
 */
export function closeActionSheet(key?: number): void {
  if (key !== undefined && ticket?.key !== key) return;
  ticket = null;
}
