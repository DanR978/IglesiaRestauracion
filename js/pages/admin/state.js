// js/pages/admin/state.js
// Shared mutable state for the admin panel.
// Import and mutate these directly — no framework needed for a panel this size.

import { sb as _sb } from '/js/lib/supabase.js';

// Re-export for all admin modules
export const sb = _sb;

// ─── Auth state ───────────────────────────────────────────────────────────────
export let currentUser    = null;
export let currentProfile = null;

export function setCurrentUser(u)    { currentUser    = u; }
export function setCurrentProfile(p) { currentProfile = p; }

export const isAdmin  = () => currentProfile?.role === 'admin';
export const isPastor = () => currentProfile?.role === 'pastor';
export const isStaff  = () => isAdmin() || isPastor();

// ─── Ministry state ───────────────────────────────────────────────────────────
export let ministries          = [];
export let selectedMinistries  = new Set();

export function setMinistries(arr) {
  ministries = arr;
  selectedMinistries = new Set(arr.map(m => m.id));
}

// ─── Calendar state ───────────────────────────────────────────────────────────
export let calEventsList = [];
export let admCalYear    = new Date().getFullYear();
export let admCalMonth   = new Date().getMonth();

export function setCalEvents(list) { calEventsList = list; }
export function setCalView(y, m)   { admCalYear = y; admCalMonth = m; }

// ─── Events list state ────────────────────────────────────────────────────────
export let _upcomingSpecial = [];
export let _upcomingRegular = [];
export let _pastSpecial     = [];
export let _pastRegular     = [];

export function setUpcoming(special, regular) {
  _upcomingSpecial = special;
  _upcomingRegular = regular;
}
export function setPast(special, regular) {
  _pastSpecial = special;
  _pastRegular = regular;
}

// ─── Form state ───────────────────────────────────────────────────────────────
export let editingEventId = null;
export let confirmResolve = null;
export let galleryImages  = null;

export function setEditingEventId(id) { editingEventId = id; }
export function setConfirmResolve(fn) { confirmResolve = fn; }
export function setGalleryImages(arr) { galleryImages  = arr; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const pad2     = n => String(n).padStart(2, '0');
export const todayISO = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
};
export const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

export const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
export const DAY_NAMES = [
  'Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado',
];
export const DAYS_S = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

export const CAT_COLORS = {
  servicio:       '#1e6b61',
  estudio:        '#2a4a9e',
  oracion:        '#5c3d9c',
  evangelizacion: '#a05a10',
  especial:       '#b02030',
  otro:           '#888',
};

// ─── Filter helper ────────────────────────────────────────────────────────────
// The ministry filter chips only exist for admins; non-admins have no filter UI,
// so they see everything they're allowed to read (RLS is the real boundary).
export function filterEventsByMinistry(events) {
  if (!isAdmin()) return events;
  if (!selectedMinistries.size) return [];
  return events.filter(ev => !ev.ministry_id || selectedMinistries.has(ev.ministry_id));
}

// ─── Normalize an `events` table row → flat event shape ──────────────────────
export function normalizeEventsRow(row) {
  if (!row?.starts_at) return null;
  const d   = new Date(row.starts_at);
  const mid = row.ministry_id || null;
  const mObj = mid ? (ministries.find(x => x.id === mid) || null) : null;
  return {
    id:            `evt-${row.id}`,
    title:         row.title || 'Evento',
    date:          `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time:          `${(d.getHours() % 12) || 12}:${pad2(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`,
    location:      row.location || '',
    description:   row.description || '',
    category:      'especial',
    cancelled:     false,
    ministry_id:   mid,
    image_url:     row.image_url || null,
    ministries:    mObj ? { name: mObj.name, color: mObj.color } : null,
    tag:           row.tag || null,
    fromEventsTable: true,
    _source:       'evt',
  };
}