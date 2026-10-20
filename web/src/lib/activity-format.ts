/* ============================================================================
 * web/src/lib/activity-format.ts — how an audit row reads in Spanish (S41)
 * ----------------------------------------------------------------------------
 * Port of the ACTION verb map, the ENTITY phrase map and timeAgo() from
 * js/pages/admin/activity-tab.js — the words Inicio's "Actividad reciente"
 * (S41) and the Actividad tab (S42) put on screen:
 *   <quién> <verbo> <qué> “<etiqueta>”  ·  hace 5 min
 *
 * tests/golden/activity-format.test.ts holds this module to the legacy
 * output, captured by RUNNING the legacy tab (tests/unit/capture-activity-
 * format.test.ts; TZ America/New_York, clock pinned). Deliberate departures,
 * recorded in docs/migration/sessions/S41-dashboard.md:
 *   · every audited table has a phrase: legacy read "un registro" for
 *     accounts and access presets (audited since 20261019000001 and by
 *     admin-invite), registration events, registrations, funds and the two
 *     category lists (audited since the baseline, never mapped);
 *   · an operation other than INSERT / UPDATE / DELETE reads "modificó"
 *     (legacy printed the raw code in lower case, or nothing at all);
 *   · an unreadable timestamp gives '' (legacy printed "Invalid Date").
 * Lookups go through own keys only, so a value like "constructor" falls back
 * instead of reaching Object.prototype.
 *
 * Pure: no DOM, no store. A week or more ago shows the date in the viewer's
 * time zone, as legacy did.
 *
 * Usage:
 *   import { activityPredicate, formatActivity } from '#lib/activity-format.js';
 *   const line = formatActivity(row);   // { who, verb, what, label, when }
 *   `${line.who} ${activityPredicate(line)}`   // "Ana creó un evento “Culto”"
 * ========================================================================== */

/** The audit-row fields a sentence needs; #lib/repos/activity's AuditEntry fits. */
export interface ActivityRow {
  readonly actor_name: string | null;
  readonly action: string | null;
  readonly entity: string | null;
  readonly label: string | null;
  readonly created_at: string;
}

/** One row in words. Rendered as `who verb what “label”`, with `when` beside it. */
export interface ActivityLine {
  /** The actor's display name when the row was written, or ACTIVITY_ACTOR_FALLBACK. */
  readonly who: string;
  readonly verb: string;
  readonly what: string;
  /** The record's name or title, unquoted; null when it had none. */
  readonly label: string | null;
  /** "hace 5 min", the date after a week, or '' for an unreadable timestamp. */
  readonly when: string;
}

/** Row operation → past-tense verb (legacy ACTION). */
export const ACTIVITY_VERBS: Readonly<Record<string, string>> = {
  INSERT: 'creó',
  UPDATE: 'editó',
  DELETE: 'eliminó',
};

/** Any other operation. The database writes only the three above. */
export const ACTIVITY_VERB_FALLBACK = 'modificó';

/** Audited table → what it holds, with its article (legacy ENTITY, then S41's additions). */
export const ACTIVITY_ENTITIES: Readonly<Record<string, string>> = {
  events: 'un evento especial',
  calendar_events: 'un evento',
  calendar_presets: 'una plantilla de calendario',
  ministries: 'un ministerio',
  discipleship_groups: 'un grupo de discipulado',
  discipleship_members: 'un miembro de discipulado',
  discipleship_messages: 'un mensaje de discipulado',
  gallery_albums: 'un álbum de galería',
  leader_sections: 'una sección de Líderes',
  leader_members: 'una persona de Líderes',
  app_settings: 'la configuración',
  invitations: 'una invitación',
  fin_income: 'un ingreso',
  fin_expenses: 'un gasto',
  fin_budgets: 'un presupuesto',
  fin_payables: 'una cuenta por pagar',
  fin_recurring: 'un pago recurrente',
  fin_notes: 'una nota de tesorería',
  // S41: audited, but legacy read them as "un registro".
  profiles: 'una cuenta',
  role_presets: 'un preset de acceso',
  special_events: 'un evento con registro',
  event_registrations: 'una inscripción',
  fin_funds: 'un fondo',
  fin_income_categories: 'una categoría de ingresos',
  fin_expense_categories: 'una categoría de gastos',
};

/** A table with no phrase of its own. */
export const ACTIVITY_ENTITY_FALLBACK = 'un registro';

/** A row without an actor name. */
export const ACTIVITY_ACTOR_FALLBACK = 'Alguien';

/** The empty state of an activity list (legacy copy). */
export const ACTIVITY_EMPTY = 'Aún no hay actividad registrada.';

const SECOND = 1000;
const ABSOLUTE_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

function phrase(map: Readonly<Record<string, string>>, key: string | null): string | undefined {
  return key !== null && Object.hasOwn(map, key) ? map[key] : undefined;
}

/**
 * How long ago `iso` was, as legacy said it: "hace un momento" under a
 * minute (and for a time ahead of `now`), then minutes, hours and days, and
 * from seven days on the date ("12 oct 2026") in the viewer's time zone.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((now - then) / SECOND));
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(then).toLocaleDateString('es-ES', ABSOLUTE_DATE);
}

/** One audit row in words, relative to `now`. */
export function formatActivity(row: ActivityRow, now: number = Date.now()): ActivityLine {
  return {
    who: row.actor_name || ACTIVITY_ACTOR_FALLBACK,
    verb: phrase(ACTIVITY_VERBS, row.action) ?? ACTIVITY_VERB_FALLBACK,
    what: phrase(ACTIVITY_ENTITIES, row.entity) ?? ACTIVITY_ENTITY_FALLBACK,
    label: row.label || null,
    when: timeAgo(row.created_at, now),
  };
}

/** The sentence after the actor: `creó un evento “Culto dominical”`. */
export function activityPredicate(line: ActivityLine): string {
  return `${line.verb} ${line.what}${line.label ? ` “${line.label}”` : ''}`;
}
