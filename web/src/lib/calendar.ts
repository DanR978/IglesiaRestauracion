/* ============================================================================
 * web/src/lib/calendar.ts — "add to calendar" (port of js/utils/calendar.js, S07)
 * ----------------------------------------------------------------------------
 * Works natively per platform:
 *   • iOS / iPadOS → download an .ics file, which opens the native Calendar app.
 *   • everyone else → Google Calendar "add event" URL.
 * An .ics is also the universal format for Apple Calendar / Outlook, so it's
 * the right primitive to expose.
 *
 * G-002: event timestamps arrive as ISO strings (timestamptz → explicit
 * offset); output stamps are UTC (`getUTC*`), so results are TZ-independent.
 *
 * Usage:
 *   import { addToCalendar, buildICS, buildGoogleCalUrl } from '$lib/calendar';
 * ========================================================================== */

import { isIOS } from './detect-device';
import { pad2 as pad } from './date';
import { richToPlain } from './sanitize-html';

/** The subset of an `events` row the calendar flows read. */
export type CalendarEvent = {
  id?: string | number | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
};

// UTC stamp in iCalendar form: 20260621T180000Z
const fmtUTC = (d: Date): string =>
  d.getUTCFullYear() +
  pad(d.getUTCMonth() + 1) +
  pad(d.getUTCDate()) +
  'T' +
  pad(d.getUTCHours()) +
  pad(d.getUTCMinutes()) +
  pad(d.getUTCSeconds()) +
  'Z';

function bounds(ev: CalendarEvent): { start: Date; end: Date } {
  const start = new Date(ev.starts_at);
  const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 3600000);
  return { start, end };
}

export function buildGoogleCalUrl(ev: CalendarEvent): string {
  const { start, end } = bounds(ev);
  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Evento',
    dates: `${fmtUTC(start)}/${fmtUTC(end)}`,
    details: richToPlain(ev.description),
    location: ev.location || '',
  });
  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
}

// Escape per RFC 5545: backslash, comma, semicolon, and newlines.
const icsEscape = (s: string | null | undefined): string =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([,;])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');

export function buildICS(ev: CalendarEvent): string {
  const { start, end } = bounds(ev);
  const uid = `${ev.id || fmtUTC(start)}@irdlex.org`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Iglesia Restauración Divina//irdlex.org//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmtUTC(new Date())}`,
    `DTSTART:${fmtUTC(start)}`,
    `DTEND:${fmtUTC(end)}`,
    `SUMMARY:${icsEscape(ev.title || 'Evento')}`,
    ev.description ? `DESCRIPTION:${icsEscape(richToPlain(ev.description))}` : null,
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n'); // iCalendar requires CRLF
}

export function downloadICS(ev: CalendarEvent): void {
  const blob = new Blob([buildICS(ev)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Character class respelled from legacy `[^\w\-]` to `[^\w-]` (identical
  // set; avoids no-useless-escape).
  a.download = `${(ev.title || 'evento')
    .replace(/[^\w-]+/g, '-')
    .toLowerCase()
    .slice(0, 50)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Add to calendar using the best flow for the current device. */
export function addToCalendar(ev: CalendarEvent): void {
  if (isIOS()) downloadICS(ev);
  else window.open(buildGoogleCalUrl(ev), '_blank', 'noopener');
}
