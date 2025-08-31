// /js/utils/calendar-utils.js
import { isIOS } from './detect-device.js';

function pad(n){ return String(n).padStart(2,'0'); }

function fmtUTC(d){
  return d.getUTCFullYear() + pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) +
         'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}

/** ev: { title, date: "YYYY-MM-DD", time?: "7:00 PM" | "7:00 PM – 8:00 PM", location?, description? } */
export function parseEventTimes(ev) {
  const base = ev.date || '';
  const toDate = (t) => t ? new Date(`${base} ${t}`) : null;

  if (!ev.time) {
    const start = new Date(`${base} 9:00 AM`);
    const end   = new Date(start.getTime() + 60*60*1000);
    return { start, end };
  }
  const [t1, t2] = ev.time.split(/–|-/).map(s => s.trim());
  const start = toDate(t1);
  const end   = t2 ? toDate(t2) : new Date(start.getTime() + 60*60*1000);
  return { start, end };
}

export function buildGoogleCalUrl(ev) {
  const { start, end } = parseEventTimes(ev);
  const dates = `${fmtUTC(start)}/${fmtUTC(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Evento',
    dates,
    details: ev.description || '',
    location: ev.location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Returns a Blob URL to a generated .ics file */
export function buildICSBlobUrl(ev){
  const { start, end } = parseEventTimes(ev);
  const uid = (ev.id || ev.title || 'evento') + '@irdlex';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IRDLEX//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmtUTC(new Date())}`,
    `DTSTART:${fmtUTC(start)}`,
    `DTEND:${fmtUTC(end)}`,
    `SUMMARY:${(ev.title || 'Evento').replace(/\r?\n/g,' ')}`,
    `DESCRIPTION:${(ev.description || '').replace(/\r?\n/g,' ')}`,
    `LOCATION:${(ev.location || '').replace(/\r?\n/g,' ')}`,
    ev.url ? `URL:${ev.url}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type:'text/calendar;charset=utf-8' });
  return URL.createObjectURL(blob);
}

/** Device-aware action for your “Agregar al calendario” button. */
export function getCalendarAction(ev) {
  if (isIOS()) {
    const href = buildICSBlobUrl(ev);
    const fname = `${(ev.title || 'evento').trim().replace(/\s+/g, '_')}.ics`;
    return { href, target: '_self', download: fname }; // Apple Calendar picks up .ics
  }
  // Android & Desktop -> Google Calendar
  return { href: buildGoogleCalUrl(ev), target: '_blank', download: null };
}
