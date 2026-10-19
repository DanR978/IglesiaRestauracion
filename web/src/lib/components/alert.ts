/* ============================================================================
 * web/src/lib/components/alert.ts — the Alert contract (PR-C2, S15)
 * ----------------------------------------------------------------------------
 * The non-visual half of Alert.svelte: the tone union, the live-region role,
 * glyph and spoken prefix per tone, and the strings the component renders
 * itself. Alert is the IN-FLOW message (a form's failed save, the sign-in
 * error, "Abre esta página en Safari o Chrome"); the transient one is Toast.
 * Retires `.auth-error` / `.auth-ok` / `.acct-error` and their setErr()
 * plumbing (DESIGN-SYSTEM §4.3 "Alert / Callout", PORT-DEBT S39 / S45).
 *
 * Roles: an error interrupts (`alert`, assertive); success, info and warn wait
 * their turn (`status`, polite) — the same split Toast uses.
 *
 * Emitted names:
 *   ird-alert · ird-alert--{error|success|info|warn}
 *   ird-alert__icon · __body · __text · __title · __message · __actions · __dismiss
 *
 * Usage:
 *   import Alert from '#lib/components/Alert.svelte';
 *   {#if error}<Alert tone="error" message={error.message} />{/if}
 *   <Alert tone="warn" title="Navegador integrado" message="Abre esta página en Safari o Chrome." />
 * ========================================================================== */

export type AlertTone = 'error' | 'success' | 'info' | 'warn';

export const ALERT_TONES: readonly AlertTone[] = ['error', 'success', 'info', 'warn'];

export type AlertRole = 'alert' | 'status';

export const ALERT_ROLES: Readonly<Record<AlertTone, AlertRole>> = {
  error: 'alert',
  success: 'status',
  info: 'status',
  warn: 'status',
};

/** Distinct glyph per tone (the same set Toast uses, plus the warning triangle). */
export const ALERT_ICONS: Readonly<Record<AlertTone, string>> = {
  error: 'circle-exclamation',
  success: 'circle-check',
  info: 'circle-info',
  warn: 'triangle-exclamation',
};

/**
 * Read before the text, visually hidden: the tone is never carried by colour
 * and glyph alone, for someone who cannot see either.
 */
export const ALERT_TONE_LABELS: Readonly<Record<AlertTone, string>> = {
  error: 'Error',
  success: 'Éxito',
  info: 'Información',
  warn: 'Advertencia',
};

/** Accessible name of the optional dismiss control. */
export const ALERT_DISMISS_LABEL = 'Cerrar aviso';

/** The BEM block every Alert emits. */
export const ALERT_BLOCK = 'ird-alert';
