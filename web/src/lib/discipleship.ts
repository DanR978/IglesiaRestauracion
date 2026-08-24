/* ============================================================================
 * web/src/lib/discipleship.ts — Discipulado vocabulary + display helpers (S22)
 * ----------------------------------------------------------------------------
 * The pure half of legacy `js/lib/discipleship.js`: level/weekday/status
 * vocabularies, the derived display status, and schedule/date/phone
 * formatting. Queries live in `$lib/repos/discipleship`.
 *
 * Usage:
 *   import { LEVELS, displayStatus, formatSchedule } from '$lib/discipleship';
 * ========================================================================== */

import { todayISO } from './date';

/* ── Vocabularies ──────────────────────────────────────────────────────── */

export type Level = { n: number; label: string; blurb: string };

export const LEVELS: readonly Level[] = [
  {
    n: 1,
    label: 'Fundamentos',
    blurb: 'Tu primer paso. Quién es Jesús, qué creemos, y la base del evangelio.',
  },
  {
    n: 2,
    label: 'Crecimiento',
    blurb: 'La vida del creyente — oración, lectura bíblica, comunidad y obediencia.',
  },
  {
    n: 3,
    label: 'Discípulo',
    blurb: 'Carácter cristiano, doctrina sólida y cómo aplicar la Palabra en cada área.',
  },
  {
    n: 4,
    label: 'Servidor',
    blurb: 'Dones espirituales, servir en la iglesia, y comenzar a ministrar a otros.',
  },
  {
    n: 5,
    label: 'Multiplicador',
    blurb: 'Liderar un grupo, hacer discípulos, y reproducir la fe en nuevos creyentes.',
  },
];

export type Option = { value: string; label: string };

export const WEEKDAYS: readonly Option[] = [
  { value: 'domingo', label: 'Domingo' },
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miércoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
  { value: 'sábado', label: 'Sábado' },
];

/** Raw `discipleship_groups.status` values. */
export type GroupStatus = 'open' | 'active' | 'completed' | 'cancelled';

export const STATUS_LABEL: Readonly<Record<GroupStatus, string>> = {
  open: 'Abierto',
  active: 'En curso',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

export const GENDERS: readonly Option[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'no-especifica', label: 'Prefiero no decir' },
];

export const AGE_LABEL: Readonly<Record<string, string>> = {
  teen: 'Adolescente',
  'young-adult': 'Joven adulto',
  adult: 'Adulto',
  senior: 'Adulto mayor',
};

/* ── Display status ────────────────────────────────────────────────────── */

/** What the public sees; `full` and `in_progress` are derived, not stored. */
export type DisplayStatus = 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';

export const DISPLAY_STATUS_LABEL: Readonly<Record<DisplayStatus, string>> = {
  open: 'Abierto',
  full: 'Lleno · Lista de espera',
  in_progress: 'En curso',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

/** The subset of a `discipleship_groups` row the status/capacity helpers read. */
export type GroupStatusInput = {
  status?: string | null;
  starts_on?: string | null;
  capacity?: number | null;
  member_count?: number | null;
};

/**
 * Combine raw status + start date + capacity into one display status.
 *   open        — accepting signups, hasn't started, has room
 *   full        — accepting signups but at capacity (waitlist)
 *   in_progress — already started (status='active' OR starts_on is past)
 *   completed / cancelled
 *
 * `today` is a "YYYY-MM-DD" key (viewer-local by default) so a prerender or a
 * test can pin the clock.
 */
export function displayStatus(
  group: GroupStatusInput | null | undefined,
  today: string = todayISO(),
): DisplayStatus {
  if (!group) return 'cancelled';
  const raw = group.status;
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'completed') return 'completed';
  if (raw === 'active') return 'in_progress';

  // raw === 'open' — auto-promote to in_progress once the start date has passed
  if (group.starts_on && group.starts_on < today) return 'in_progress';

  const capacity = group.capacity;
  const filled = group.member_count ?? 0;
  if (capacity != null && filled >= capacity) return 'full';
  return 'open';
}

/** Open seats, or null when the group has no (or a zero) capacity. */
export function spotsRemaining(group: GroupStatusInput | null | undefined): number | null {
  if (!group?.capacity) return null;
  return Math.max(0, group.capacity - (group.member_count ?? 0));
}

/* ── URLs ──────────────────────────────────────────────────────────────── */

/** Public production domain — used for QR codes regardless of where the admin runs. */
export const PUBLIC_BASE = 'https://www.irdlex.org';

export type GroupRef = { id?: string | null; slug?: string | null } | null | undefined;

/**
 * Public-facing URL for a group (QR codes, "Copiar enlace"). MUST point at
 * the real production domain — `origin` is an escape hatch for staging only.
 */
export function groupPublicUrl(group: GroupRef, origin?: string): string {
  const base = origin || PUBLIC_BASE;
  if (group?.slug) return `${base}/discipulado/grupo/?slug=${encodeURIComponent(group.slug)}`;
  if (group?.id) return `${base}/discipulado/grupo/?id=${encodeURIComponent(group.id)}`;
  return `${base}/discipulado`;
}

/* ── Display helpers ───────────────────────────────────────────────────── */

const DAY_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  WEEKDAYS.map((w) => [w.value, w.label]),
);

export type ScheduleInput = { meeting_day?: string | null; meeting_time?: string | null };

/** "Martes · 7:00 PM", either half alone, or "Por definir". */
export function formatSchedule(group: ScheduleInput | null | undefined): string {
  if (!group) return '';
  const day = (group.meeting_day && DAY_LABEL[group.meeting_day]) || '';
  const time = group.meeting_time ? formatTime(group.meeting_time) : '';
  if (day && time) return `${day} · ${time}`;
  return day || time || 'Por definir';
}

/** "19:00:00" or "19:00" → "7:00 PM". */
export function formatTime(hms: string | number): string {
  const [hStr, mStr] = String(hms).split(':');
  const h24 = Number(hStr) || 0;
  const m = String(mStr ?? '00').padStart(2, '0');
  const am = h24 < 12;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m} ${am ? 'AM' : 'PM'}`;
}

export type DateRangeInput = { starts_on?: string | null; ends_on?: string | null };

/** "6 de agosto de 2026 → 19 de noviembre de 2026" or "Inicia el …". */
export function formatDateRange(group: DateRangeInput | null | undefined): string {
  if (!group?.starts_on) return '';
  const start = new Date(group.starts_on + 'T00:00');
  const fmt = (d: Date): string =>
    d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  if (!group.ends_on) return `Inicia el ${fmt(start)}`;
  const end = new Date(group.ends_on + 'T00:00');
  return `${fmt(start)} → ${fmt(end)}`;
}

/** Level metadata by number; unknown levels fall back to level 1. */
export function levelMeta(n: number | string | null | undefined): Level {
  return LEVELS.find((l) => l.n === Number(n)) ?? LEVELS[0];
}

/**
 * Format a raw phone string as a US-style number.
 *   "6173200354"       → "(617) 320-0354"
 *   "16173200354"      → "+1 (617) 320-0354"
 *   "+52 55 1234 5678" → untouched (anything not 10/11-digit US-style)
 */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input).trim();
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}
