/* ============================================================================
 * web/src/lib/components/card.ts — the Card contract (S14)
 * ----------------------------------------------------------------------------
 * The non-visual half of Card.svelte: the variant union, the KPI-tile shape and
 * the BEM block. One card retires .dash-card, .acct-card, .se-evcard, .dscp-card,
 * .trez-card, the project/gallery/designer cards — one radius (--radius-md) and
 * one shadow token, never .dash-card's 16px + amber wipe + 3px lift.
 *
 * THE FALSE-AFFORDANCE RULE (DESIGN-SYSTEM §4.1, hard):
 *   `static`      → a <div>. No hover, no cursor, nothing that suggests a click.
 *   `interactive` → a real <a> (href) or <button> (onclick) that DOES the
 *                   primary thing. Enter/Space work because it is a real
 *                   control, not a div with role="button" and a click listener.
 * There is no third option, and an interactive card must not contain another
 * control (nested interactives are invalid HTML) — a card that needs both a
 * primary action and a row menu is `static` plus an explicit Button/IconButton.
 *
 * Emitted classes:
 *   ird-card · ird-card--static | ird-card--interactive · ird-card--kpi
 *   ird-card--alert
 *
 * Usage:
 *   import Card from '$lib/components/Card.svelte';
 *   import type { KpiTile } from '$lib/components/card';
 * ========================================================================== */

/** Static container, or a real control that performs the card's primary action. */
export type CardVariant = 'static' | 'interactive';

export const CARD_VARIANTS: readonly CardVariant[] = ['static', 'interactive'];

/**
 * KPI tone. `alert` is the ONE non-slate colour a tile may take, and only
 * because it means something (D-014); it reads from the AA-tuned, theme-
 * reversing --status-overdue pair, never a hex (D-016/§2.5).
 */
export type KpiTone = 'default' | 'alert';

export const KPI_TONES: readonly KpiTone[] = ['default', 'alert'];

/**
 * The KPI-tile sub-variant: icon + big number + label — plus `scope`, which is
 * REQUIRED on purpose. The legacy Resumen mixes month-scoped tiles with an
 * all-time "Por pagar" tile that looks identical, so a tile that cannot say
 * what period it covers is the bug (PORT-DEBT S14 §8). Write "Este mes",
 * "Todo el tiempo", "Últimos 30 días" — never leave the reader guessing.
 */
export interface KpiTile {
  /** Font Awesome solid glyph for the tile (decorative — the label names it). */
  icon?: string;
  /** The number, already formatted (money via formatUSD from $lib/money). */
  value: string | number;
  /** What is being counted, e.g. "Inscritos". */
  label: string;
  /** The honest scope of `value`, e.g. "Este mes". Required. */
  scope: string;
  tone?: KpiTone;
}

/** The BEM block every Card emits. */
export const CARD_BLOCK = 'ird-card';
