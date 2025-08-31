import { isIOS } from './detect-device.js';

function pad(n){ return String(n).padStart(2,'0'); }

function fmtUTC(d){
  // YYYYMMDDTHHMMSSZ
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth()+1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z'
  );
}

/** Simple 12/24h time parser -> Date in local TZ */
function toLocalDate(dateStr, timeStr) {
  // Accept "7:00 PM", "19:00", "7pm", "7 PM", etc.
  if (!timeStr) return new Date(`${dateStr} 09:00`); // default 9 AM local
  const clean = timeStr.replace(/\s+/g,' ').trim();
  return new Date(`${dateStr} ${clean}`);
}

/** ev: { id?, title, date: "YYYY-MM-DD", time?: "7:00 PM" | "7:00 PM – 8:00 PM" | "19:00-20:00", location?, description?, url?, tz? } */
export function parseEventTimes(ev) {
  const base = ev.date || '';
  if (!base) throw new Error('Event date is required (YYYY-MM-DD)');

  if (!ev.time) {
    // Treat as ALL-DAY single-day event when time missing
    const start = new Date(`${base}T00:00:00`);
    const end = new Date(start.getTime() + 24*60*60*1000);
    return { start, end, allDay: true };
  }

  const [t1, t2] = ev.time.split(/–|—|-|to/i).map(s => s.trim());
  const start = toLocalDate(base, t1);
  const end   = t2 ? toLocalDate(base, t2) : new Date(start.getTime() + 60*60*1000);
  return { start, end, allDay: false };
}

/* ---------- Google Calendar ---------- */

function getLocalTZ(ev) {
  return ev?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function buildGoogleCalUrl(ev) {
  const { start, end, allDay } = parseEventTimes(ev);
  // Google accepts either date or datetime; if all-day, use YYYYMMDD/YYYYMMDD (end exclusive)
  const fmtDate = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const dates = allDay
    ? `${fmtDate(start)}/${fmtDate(end)}`
    : `${fmtUTC(start)}/${fmtUTC(end)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Evento',
    dates,
    details: ev.description || '',
    location: ev.location || '',
    // Calendar Time Zone for UI rendering in Google
    ctz: getLocalTZ(ev),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ---------- ICS generation ---------- */

function icsEscape(s='') {
  // Escape commas, semicolons, backslashes; normalize newlines as \n
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldICSLines(str) {
  // RFC 5545 line folding at 75 octets (approx; safe for ASCII content)
  return str.split('\r\n').map(line => {
    if (line.length <= 75) return line;
    const chunks = [];
    let i = 0;
    while (i < line.length) {
      chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + 75));
      i += 75;
    }
    return chunks.join('\r\n');
  }).join('\r\n');
}

/** Returns a Blob URL to a generated .ics file */
export function buildICSBlobUrl(ev){
  const { start, end, allDay } = parseEventTimes(ev);
  const uidBase = (ev.id || ev.title || 'evento').toString().replace(/\s+/g,'-').toLowerCase();
  const uid = `${uidBase}@irdlex`;
  const nowUTC = fmtUTC(new Date());

  const dtStart = allDay
    ? `${start.getFullYear()}${pad(start.getMonth()+1)}${pad(start.getDate())}`
    : fmtUTC(start);

  const dtEnd = allDay
    ? `${end.getFullYear()}${pad(end.getMonth()+1)}${pad(end.getDate())}`
    : fmtUTC(end);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IRDLEX//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUTC}`,
    allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    allDay ? `DTEND;VALUE=DATE:${dtEnd}`   : `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(ev.title || 'Evento')}`,
    ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : 'DESCRIPTION:',
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : 'LOCATION:',
    ev.url ? `URL:${icsEscape(ev.url)}` : null,
    // Optional default reminder: 30 minutes before
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  const folded = foldICSLines(lines + '\r\n');
  const blob = new Blob([folded], { type:'text/calendar;charset=utf-8' });
  return URL.createObjectURL(blob);
}

/** Device-aware action for your “Agregar al calendario” button. */
export function getCalendarAction(ev) {
  if (isIOS()) {
    const href = buildICSBlobUrl(ev);
    const fname = `${(ev.title || 'evento').trim().replace(/\s+/g, '_')}.ics`;
    return { href, target: '_self', download: fname, type: 'ics' };
  }
  // Android & Desktop -> Google Calendar (user can switch accounts in UI)
  return { href: buildGoogleCalUrl(ev), target: '_blank', download: null, type: 'gcal' };
}

/** Optional: perform action directly instead of returning attrs */
export function handleCalendarClick(ev, el) {
  const action = getCalendarAction(ev);
  // Apply to a link/button if provided
  if (el) {
    el.setAttribute('href', action.href);
    el.setAttribute('target', action.target || '_self');
    if (action.download) el.setAttribute('download', action.download);
  }
  // Kick off navigation immediately for buttons
  if (!el || el.tagName !== 'A') {
    const a = document.createElement('a');
    a.href = action.href;
    if (action.download) a.download = action.download;
    a.target = action.target || '_self';
    document.body.appendChild(a);
    a.click();
    // Revoke ICS blob after a tick to free memory
    if (action.type === 'ics') {
      setTimeout(() => URL.revokeObjectURL(action.href), 5000);
    }
    requestAnimationFrame(() => a.remove());
  }
  return action;
}
