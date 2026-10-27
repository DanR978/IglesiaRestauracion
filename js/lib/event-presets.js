// js/lib/event-presets.js
// ─────────────────────────────────────────────────────────────────────────────
// Repository for special-event presets (event_presets — Noche de Caballeros,
// Vigilia, …) and for putting a preset on the calendar (public.events rows).
// The admin Presets panel, the event forms and the Agregar wizard all go
// through here; none of them touches sb.from() for this feature.
//
//   • A preset holds every field the event forms have, plus an optional rule
//     (js/utils/recurrence.js) — e.g. Caballeros = last Saturday of the month.
//   • RLS (20261026000001_event_presets.sql) mirrors the events table: any
//     Eventos page reads the presets; Calendario / Próximos holders write them.
//   • Until that migration is applied every read returns NOT_INSTALLED and the
//     callers fall back to "Personalizado" — nothing else breaks.
//
// Usage:
//   import { fetchEventPresets, saveEventPreset, createEventsOn } from '/js/lib/event-presets.js';
//   const { data, error } = await fetchEventPresets();             // data: preset[]
//   const res = await saveEventPreset(values, id);                 // { ok, id } | { error }
//   const out = await createEventsOn(values, ['2026-11-28']);      // { ok, created } | { error }
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';
import { sanitizeHtml, htmlIsEmpty } from '/js/lib/sanitize-html.js';
import { isValidEmail } from '/js/lib/validators.js';
import { isRepeating } from '/js/utils/recurrence.js';

const T     = 'event_presets';
const COLS  = 'id,title,tag,description,location,image_url,start_time,end_time,'
            + 'organizer_name,organizer_email,pattern_type,day_of_week,nth_week,sort_order';
const NY    = 'America/New_York';
const NO_DB = 'Supabase no está configurado.';
const NOT_INSTALLED = 'Los presets aún no están instalados: falta aplicar la migración '
                    + '20261026000001_event_presets.sql en Supabase.';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PATTERNS = [
  { id: 'none',        label: 'No se repite' },
  { id: 'weekly',      label: 'Cada semana' },
  { id: 'lastWeekday', label: 'Último día del mes (ej. último sábado)' },
  { id: 'nthWeekday',  label: 'N-ésimo día del mes (ej. 3.er viernes)' },
];

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

let cache = null;   // last good list; every write drops it

/* ── Reads ────────────────────────────────────────────────────────────────── */

/** All presets in display order. Cached until a write or `{ fresh: true }`. */
export async function fetchEventPresets({ fresh = false } = {}) {
  if (!sb) return { error: NO_DB };
  if (cache && !fresh) return { data: cache };
  const { data, error } = await sb.from(T).select(COLS)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (error) {
    console.warn('[event-presets] fetchEventPresets:', error.message);
    return { error: isMissingTable(error) ? NOT_INSTALLED : error.message };
  }
  cache = (data ?? []).map(normalize);
  return { data: cache };
}

/** NY calendar days in [fromDay, toDay] that already hold an event titled `title`. */
export async function existingEventDays(title, fromDay, toDay) {
  if (!sb) return { error: NO_DB };
  // starts_at is UTC; pad the window a day each side, then bucket by NY day.
  const from = new Date(`${fromDay}T00:00`); from.setDate(from.getDate() - 1);
  const to   = new Date(`${toDay}T00:00`);   to.setDate(to.getDate() + 2);
  const { data, error } = await sb.from('events').select('starts_at')
    .eq('title', title)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString());
  if (error) {
    console.warn('[event-presets] existingEventDays:', error.message);
    return { error: error.message };
  }
  return { data: new Set((data ?? []).filter(r => r.starts_at).map(r => nyDay(r.starts_at))) };
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

/** Create (no id) or update a preset. */
export async function saveEventPreset(values, id) {
  if (!sb) return { error: NO_DB };
  const row = toRow(values);
  const bad = validate(row);
  if (bad) return { error: bad };
  if (!id) row.sort_order = nextSortOrder();

  const query = id
    ? sb.from(T).update(row).eq('id', id).select('id')
    : sb.from(T).insert(row).select('id');
  const { data, error } = await query;
  if (error) return { error: writeError(error) };
  // RLS filters a blocked update to zero rows instead of raising.
  if (!data?.length) return { error: 'No se guardó: no tienes permiso o el preset ya no existe.' };
  cache = null;
  return { ok: true, id: data[0].id };
}

export async function deleteEventPreset(id) {
  if (!sb) return { error: NO_DB };
  const { data, error } = await sb.from(T).delete().eq('id', id).select('id');
  if (error) return { error: writeError(error) };
  if (!data?.length) return { error: 'No se eliminó: no tienes permiso o el preset ya no existe.' };
  cache = null;
  return { ok: true };
}

/** Insert one special event per day, all from the same values (a preset, maybe edited). */
export async function createEventsOn(values, days) {
  if (!sb) return { error: NO_DB };
  const title = (values.title || '').trim();
  if (!title) return { error: 'El evento necesita un nombre.' };
  if (!TIME_RE.test(values.start_time || '')) return { error: 'La hora de inicio es obligatoria.' };
  if (values.end_time && !TIME_RE.test(values.end_time)) return { error: 'La hora de fin no es válida.' };
  if (!days.length) return { error: 'Elige al menos una fecha.' };

  const desc = sanitizeHtml(values.description || '');
  const base = {
    title,
    tag:             text(values.tag),
    location:        text(values.location),
    description:     htmlIsEmpty(desc) ? null : desc,
    organizer_name:  text(values.organizer_name),
    organizer_email: text(values.organizer_email),
    image_url:       text(values.image_url),
  };
  const rows = days.map(day => ({ ...base, ...eventTimes(day, values.start_time, values.end_time) }));
  const { error } = await sb.from('events').insert(rows);
  if (error) return { error: error.message };
  return { ok: true, created: rows.length };
}

/* ── Labels / time helpers ───────────────────────────────────────────────── */

/** "Último sábado del mes" · "Cada domingo" · "3.º viernes del mes" · "No se repite". */
export function ruleLabel(p) {
  if (!isRepeating(p)) return 'No se repite';
  const day = WEEKDAYS[Number(p.day_of_week)];
  if (p.pattern_type === 'weekly') return `Cada ${day}`;
  if (p.pattern_type === 'lastWeekday') return `Último ${day} del mes`;
  return `${p.nth_week}.º ${day} del mes`;
}

/** "19:00" → "7:00 PM" ("" for no time). */
export function formatTime12(hhmm) {
  if (!TIME_RE.test(hhmm || '')) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** starts_at / ends_at for a local day + "HH:MM" times. An end before the start
 *  means the event runs past midnight (a vigilia), so it ends the next day. */
export function eventTimes(day, start, end) {
  const starts = new Date(`${day}T${start}`);
  if (!end) return { starts_at: starts.toISOString(), ends_at: null };
  const ends = new Date(`${day}T${end}`);
  if (end < start) ends.setDate(ends.getDate() + 1);
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
}

/* ── Internals ────────────────────────────────────────────────────────────── */

const nyDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: NY });

function text(v) {
  return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}

function int(v) {
  return (v === null || v === undefined || v === '') ? null : Number(v);
}

// Postgres `time` comes back as "19:00:00"; the forms use "HH:MM".
function normalize(p) {
  return {
    ...p,
    start_time: p.start_time ? p.start_time.slice(0, 5) : '',
    end_time:   p.end_time ? p.end_time.slice(0, 5) : '',
  };
}

function toRow(v) {
  const rule = PATTERNS.some(p => p.id === v.pattern_type) ? v.pattern_type : 'none';
  const desc = sanitizeHtml(v.description || '');
  return {
    title:           text(v.title) ?? '',
    tag:             text(v.tag),
    description:     htmlIsEmpty(desc) ? null : desc,
    location:        text(v.location),
    image_url:       text(v.image_url),
    start_time:      text(v.start_time),
    end_time:        text(v.end_time),
    organizer_name:  text(v.organizer_name),
    organizer_email: text(v.organizer_email),
    pattern_type:    rule,
    day_of_week:     rule === 'none' ? null : int(v.day_of_week),
    nth_week:        rule === 'nthWeekday' ? int(v.nth_week) : null,
  };
}

// Mirrors the table's CHECKs so the admin reads Spanish, not a constraint name.
function validate(r) {
  if (!r.title) return 'El nombre del preset es obligatorio.';
  if (r.title.length > 120) return 'El nombre es demasiado largo (máx. 120 caracteres).';
  if (r.tag && r.tag.length > 80) return 'Las categorías son demasiado largas.';
  if (r.location && r.location.length > 200) return 'La ubicación es demasiado larga (máx. 200).';
  if (r.description && r.description.length > 10000) return 'La descripción es demasiado larga.';
  if (r.organizer_name && r.organizer_name.length > 120) return 'El nombre del organizador es demasiado largo.';
  if (r.organizer_email && (r.organizer_email.length > 254 || !isValidEmail(r.organizer_email))) {
    return 'El email del organizador no es válido.';
  }
  if (r.image_url && (r.image_url.length > 1000 || !/^https:\/\//.test(r.image_url))) return 'La imagen no es válida.';
  if (r.start_time && !TIME_RE.test(r.start_time)) return 'La hora de inicio no es válida.';
  if (r.end_time && !TIME_RE.test(r.end_time)) return 'La hora de fin no es válida.';
  if (r.pattern_type !== 'none' && !(r.day_of_week >= 0 && r.day_of_week <= 6)) return 'Elige el día de la semana.';
  if (r.pattern_type === 'nthWeekday' && !(r.nth_week >= 1 && r.nth_week <= 5)) return 'Elige la semana del mes (1.ª a 5.ª).';
  return '';
}

function nextSortOrder() {
  return (cache ?? []).reduce((max, p) => Math.max(max, p.sort_order ?? 0), -1) + 1;
}

function isMissingTable(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

function writeError(error) {
  if (isMissingTable(error)) return NOT_INSTALLED;
  if (error.code === '23505') return 'Ya existe un preset con ese nombre.';
  if (error.code === '42501') return 'No tienes permiso para cambiar los presets.';
  if (error.code === '23514') return 'Algún dato del preset no es válido.';
  return error.message;
}
