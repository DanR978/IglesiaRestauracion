/* ============================================================================
 * web/src/lib/components/wizard.ts — the FormWizard step machine (S21)
 * ----------------------------------------------------------------------------
 * The pure half of FormWizard.svelte: the field-type contract, defaults,
 * `showIf` visibility, per-step validation and the ONE review formatter. Kept
 * out of the component so it is unit-testable and so a caller can reuse the
 * types when it declares a spec.
 *
 * Port of js/pages/admin/form-wizard.js (the real engine behind the treasury
 * WIZ specs). Retires the three hand-rolled event / discipleship / gallery
 * wizards and their three divergent review renderers (PORT-DEBT S21).
 *
 * Deliberate differences from legacy (PORT-DEBT S21 "MUST FIX ON PORT"):
 *   • the money control's value is bound, never interpolated — legacy
 *     `form-wizard.js:89` wrote `value="${v ?? ''}"` with no esc();
 *   • money is validated through $lib/money (D-003) instead of `Number(v)>=0`,
 *     and formatted for review with formatUSD;
 *   • ONE review renderer (formatFieldValue) — legacy had three;
 *   • validation returns the offending FIELD so the component can move focus
 *     to it (legacy only printed a message).
 *
 * SPEC SHAPE — kept byte-compatible with js/pages/admin/treasury-tab.js `WIZ`
 * so S53 can port those specs verbatim:
 *   { title, editTitle, icon, submitLabel, steps, toData(row), toPayload(data) }
 *
 * Usage:
 *   import { applyDefaults, validateStep, formatFieldValue } from '$lib/components/wizard';
 * ========================================================================== */
import { formatUSD, toCents } from '$lib/money';

/** Everything a wizard field can hold. Values stay DOLLARS-as-entered for
 *  money (a spec's `toPayload` does `Number(d.amount)`); cents conversion is
 *  the repo layer's job (D-003). */
export type WizardValue = string | number | null | undefined;

export type WizardData = Record<string, WizardValue>;

/** The S21 field-type contract. DESIGN-SYSTEM §4.3 extends this union with
 *  color/checkbox/radio/toggle/multi-select/file/rich-text/icon-picker/
 *  segmented in later sessions; those are additive. */
export type WizardFieldType =
  'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'choice';

export interface WizardOption {
  value: string;
  label: string;
  /** Secondary line on a `choice` card. */
  desc?: string;
  /** Font Awesome name (no `fa-`) on a `choice` card. */
  icon?: string;
}

export interface WizardField {
  /** Key into the wizard's data record. Must be unique across ALL steps. */
  id: string;
  type: WizardFieldType;
  label?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  default?: WizardValue;
  options?: WizardOption[];
  /** Rows for a `textarea`. Legacy used 3. */
  rows?: number;
  /**
   * Re-evaluated on EVERY render, so a field can switch on another field's
   * value (treasury "ministry vs person", report "month vs year"). A hidden
   * field is neither validated nor shown on the review screen.
   */
  showIf?: (data: WizardData) => boolean;
}

export interface WizardStep {
  label?: string;
  hint?: string;
  fields: WizardField[];
}

export interface WizardSubmitError {
  message?: string | null;
}

/**
 * What `onSubmit` may resolve to. Mirrors a Supabase result: `{ error }` on
 * failure (the wizard stays open and shows it inline), anything else is
 * success. The repo-layer contract of returning — never throwing — is
 * preserved, and a thrown error is caught by the component anyway.
 */
export type WizardSubmitResult =
  { error?: WizardSubmitError | string | null } | null | undefined | void;

/**
 * The config object an admin screen declares once per entity. Compatible with
 * the legacy treasury `WIZ.<entity>()` shape so S53 ports them unchanged.
 */
export interface WizardSpec<TRow = unknown, TPayload = unknown> {
  title: string;
  /** Title used when editing an existing row. */
  editTitle?: string;
  /** Font Awesome name (no `fa-`). */
  icon?: string;
  submitLabel?: string;
  steps: WizardStep[];
  /** Row → initial wizard data (edit mode). */
  toData: (row: TRow) => WizardData;
  /** Wizard data → the payload written to the DB. */
  toPayload: (data: WizardData) => TPayload;
}

export const REVIEW_TITLE = 'Revisa antes de guardar';
export const EMPTY_DISPLAY = '—';
const GENERIC_SUBMIT_ERROR = 'No se pudo guardar. Intenta de nuevo.';

/** A value the user has not supplied. Matches legacy's `String(v).trim()===''`. */
export function isBlank(value: WizardValue): boolean {
  return value == null || String(value).trim() === '';
}

/** Fields of one step that `showIf` currently allows. */
export function visibleFields(step: WizardStep, data: WizardData): WizardField[] {
  return (step.fields ?? []).filter((f) => !f.showIf || f.showIf(data));
}

/** Every visible field across every step, in step order — the review list. */
export function allVisibleFields(steps: WizardStep[], data: WizardData): WizardField[] {
  return steps.flatMap((s) => visibleFields(s, data));
}

/**
 * A fresh data record: the caller's values, plus each field's `default` where
 * the caller supplied nothing. Never mutates the input (legacy mutated the
 * caller's `cfg.data`).
 */
export function applyDefaults(steps: WizardStep[], data: WizardData = {}): WizardData {
  const out: WizardData = { ...data };
  for (const step of steps) {
    for (const field of step.fields ?? []) {
      if (out[field.id] == null && field.default != null) out[field.id] = field.default;
    }
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate one field against the current data.
 * @returns a Spanish message, or null when the field is acceptable.
 */
export function validateField(field: WizardField, data: WizardData): string | null {
  const value = data[field.id];
  const name = field.label || 'este campo';

  if (isBlank(value)) {
    return field.required ? `Por favor completa: ${name}.` : null;
  }

  if (field.type === 'money') {
    let cents: number;
    try {
      cents = toCents(typeof value === 'number' ? value : String(value).trim());
    } catch {
      return `Escribe un monto válido en: ${name}.`;
    }
    if (cents < 0) return `El monto no puede ser negativo en: ${name}.`;
    return null;
  }

  if (field.type === 'number' && !Number.isFinite(Number(value))) {
    return `Escribe un número válido en: ${name}.`;
  }

  if (field.type === 'date' && !ISO_DATE.test(String(value))) {
    return `Escribe una fecha válida en: ${name}.`;
  }

  return null;
}

export interface WizardStepError {
  field: WizardField;
  message: string;
}

/**
 * Validate the visible fields of a step, in order.
 * @returns the FIRST offending field + message so the caller can focus it, or
 *          null when the step may advance.
 */
export function validateStep(step: WizardStep, data: WizardData): WizardStepError | null {
  for (const field of visibleFields(step, data)) {
    const message = validateField(field, data);
    if (message) return { field, message };
  }
  return null;
}

/** Validate every visible field of every step — the guard before submit. */
export function validateAll(steps: WizardStep[], data: WizardData): WizardStepError | null {
  for (const step of steps) {
    const bad = validateStep(step, data);
    if (bad) return bad;
  }
  return null;
}

/**
 * THE review renderer — the single source of truth for how a value reads on
 * the review screen (legacy had three divergent ones).
 *   money  → USD                      choice/select → the option's label
 *   date   → localized Spanish        blank         → "—"
 */
export function formatFieldValue(field: WizardField, data: WizardData): string {
  const value = data[field.id];
  if (isBlank(value)) return EMPTY_DISPLAY;

  if (field.type === 'money') {
    try {
      return formatUSD(toCents(typeof value === 'number' ? value : String(value).trim()));
    } catch {
      return String(value);
    }
  }

  if (field.type === 'choice' || field.type === 'select') {
    const option = (field.options ?? []).find((o) => String(o.value) === String(value));
    return option ? option.label : String(value);
  }

  if (field.type === 'date') {
    // G-002: calendar dates are "YYYY-MM-DD" strings. Build the Date from the
    // parts in LOCAL time — `new Date('2026-03-01')` is parsed as UTC and
    // renders as February 28 west of Greenwich.
    const [y, m, d] = String(value).split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }

  return String(value);
}

/** The review row's leading glyph (Font Awesome name, no `fa-`). */
export function reviewIcon(field: WizardField): string {
  if (field.type === 'money' || field.type === 'number') return 'dollar-sign';
  if (field.type === 'date') return 'calendar-day';
  if (field.type === 'choice' || field.type === 'select') return 'list';
  return 'pen';
}

/**
 * Read a submit result's error.
 * @returns the message to show inline, or null when the save succeeded.
 */
export function submitErrorMessage(result: WizardSubmitResult): string | null {
  if (!result || typeof result !== 'object') return null;
  const { error } = result;
  if (!error) return null;
  if (typeof error === 'string') return error.trim() || GENERIC_SUBMIT_ERROR;
  return (error.message ?? '').trim() || GENERIC_SUBMIT_ERROR;
}
