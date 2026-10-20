/* ============================================================================
 * web/src/lib/components/button.ts — the Button contract (S14)
 * ----------------------------------------------------------------------------
 * The non-visual half of Button.svelte: the variant and size unions plus the
 * BEM block the component emits. Kept out of the component so a consumer can
 * type a prop (`variant: ButtonVariant`) or iterate every variant (the /kit/
 * showcase, the tests) without importing the component.
 *
 * THE CLASS BLOCK IS `ird-btn`, on purpose (ROADMAP S14: "keep the .ird-btn
 * classes for coexistence"). CLAUDE.md §4 names `ird-` as the one global
 * button family, and markup lifted from a legacy page keeps reading the same.
 * The emitted names are:
 *   ird-btn · ird-btn--{variant} · ird-btn--sm | ird-btn--full
 *   is-loading · is-disabled          (state hooks; also drive the CSS)
 * The legacy public modifiers map onto the variants:
 *   .ird-btn--teal → variant="primary" · .ird-btn--orange → variant="secondary"
 *
 * PR-C2 adds a passthrough (ButtonAria + DataAttributes) so a Button — and
 * IconButton, which shares it — can be a disclosure trigger, a menu button or
 * a toggle without a wrapper. The six ARIA attributes are rendered explicitly;
 * `data-*` goes through the `dataAttributes` attachment. Neither is a spread:
 * `{...attrs}` on an element compiles it to Svelte's generic attribute
 * runtime, which lands in the chunk EVERY page loads (measured: +1.4 kB gzip
 * per page).
 *
 * Usage:
 *   import Button from '#lib/components/Button.svelte';
 *   import { BUTTON_VARIANTS, type ButtonVariant } from '#lib/components/button.js';
 *   <Button aria-expanded={open} aria-controls={panelId} data-testid="filtros">Filtros</Button>
 * ========================================================================== */
import type { Attachment } from 'svelte/attachments';
import type { AriaAttributes } from 'svelte/elements';

/**
 * The button hierarchy (DESIGN-SYSTEM §4.1). `secondary` reads as brand gold on
 * the public site and slate inside `[data-surface="admin"]` — it is the same
 * token either way (D-014), so no component hardcodes a palette.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'danger',
  'ghost',
];

/**
 * `default` and `sm` size the control; `full` is the 100%-width form for a
 * stacked mobile action bar (legacy `.btn--full`). One axis, exactly as
 * DESIGN-SYSTEM §4.1 specifies — a small full-width button is not expressible.
 */
export type ButtonSize = 'default' | 'sm' | 'full';

export const BUTTON_SIZES: readonly ButtonSize[] = ['default', 'sm', 'full'];

/** The BEM block every Button emits. */
export const BUTTON_BLOCK = 'ird-btn';

/**
 * The ARIA a caller may set on a Button or IconButton: a disclosure trigger
 * (`aria-expanded` + `aria-controls`), a menu button (`aria-haspopup`), a
 * toggle (`aria-pressed`), a hint (`aria-describedby`), or a name that differs
 * from the visible label (`aria-label` — keep the visible words in it, WCAG
 * 2.5.3). `aria-busy` and `aria-disabled` stay owned by the component.
 */
export type ButtonAria = Pick<
  AriaAttributes,
  | 'aria-label'
  | 'aria-expanded'
  | 'aria-controls'
  | 'aria-haspopup'
  | 'aria-pressed'
  | 'aria-describedby'
>;

/** `data-*` hooks for tests, the router (`data-sveltekit-*`) and delegated handlers. */
export type DataAttributes = {
  [key: `data-${string}`]: string | number | boolean | null | undefined;
};

/**
 * The `data-*` entries of a component's rest props, as attribute strings
 * (`null` / `undefined` dropped, as Svelte drops them). Every other key is
 * ignored, so a stray prop can never reach the element — let alone override a
 * managed attribute (`type`, `disabled`, `href`, `aria-busy`) or add a handler.
 */
export function dataAttributesOf(rest: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key.startsWith('data-') && value !== undefined && value !== null) data[key] = String(value);
  }
  return data;
}

/**
 * Sets `data-*` attributes on the element and removes them when they change or
 * the element goes. An attachment, not a spread (see the header) — so they
 * exist once the component is mounted, not in prerendered HTML: hooks for
 * tests and the router, never for styling.
 */
export function dataAttributes(data: Record<string, string>): Attachment {
  return (node) => {
    for (const [name, value] of Object.entries(data)) node.setAttribute(name, value);
    return () => {
      for (const name of Object.keys(data)) node.removeAttribute(name);
    };
  };
}
