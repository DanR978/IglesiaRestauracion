/* ============================================================================
 * web/src/lib/gallery.ts — gallery constants + display helpers (S22)
 * ----------------------------------------------------------------------------
 * The pure half of legacy `js/lib/gallery.js`: event-type vocabulary, the
 * storage bucket name, and URL/date formatting. Queries live in
 * `$lib/repos/gallery` so UI can import this without pulling in the client.
 *
 * Usage:
 *   import { EVENT_TYPES, EVENT_TYPE_LABEL, albumPublicUrl } from '$lib/gallery';
 * ========================================================================== */

export type GalleryEventType = {
  value: string;
  label: string;
  /** Font Awesome class suffix (`fa-water`). */
  icon: string;
};

export const EVENT_TYPES: readonly GalleryEventType[] = [
  { value: 'baptism', label: 'Bautismo', icon: 'fa-water' },
  { value: 'wedding', label: 'Matrimonio', icon: 'fa-ring' },
  { value: 'youth', label: 'Jóvenes', icon: 'fa-fire' },
  { value: 'kids', label: 'Niños', icon: 'fa-children' },
  { value: 'worship', label: 'Adoración', icon: 'fa-music' },
  { value: 'outreach', label: 'Evangelismo', icon: 'fa-hands-helping' },
  { value: 'discipulado', label: 'Discipulado', icon: 'fa-people-group' },
  { value: 'conference', label: 'Conferencia', icon: 'fa-microphone' },
  { value: 'christmas', label: 'Navidad', icon: 'fa-star' },
  { value: 'easter', label: 'Resurrección', icon: 'fa-cross' },
  { value: 'prayer', label: 'Noche de oración', icon: 'fa-pray' },
  { value: 'missions', label: 'Misiones', icon: 'fa-globe' },
  { value: 'picnic', label: 'Convivencia', icon: 'fa-utensils' },
  { value: 'special_service', label: 'Servicio especial', icon: 'fa-church' },
  { value: 'fellowship', label: 'Comunión', icon: 'fa-heart' },
  { value: 'other', label: 'Otro', icon: 'fa-image' },
];

export const EVENT_TYPE_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t.label]),
);

/** Supabase Storage bucket that holds every gallery asset. */
export const BUCKET = 'gallery';

/** The subset of a `gallery_albums` row the URL builders read. */
export type AlbumRef = { id?: string | null; slug?: string | null } | null | undefined;

/**
 * "6 de agosto de 2026" for a "YYYY-MM-DD" `event_date`; '' when missing or
 * unparseable. Splits the string and rebuilds a *local* Date — never
 * `new Date('2026-08-06')`, which parses as UTC midnight and renders the
 * previous day west of Greenwich.
 */
export function formatEventDate(value: string | null | undefined): string {
  const [y, m, d] = String(value ?? '')
    .split('-')
    .map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Public URL of an album (QR codes, "Copiar enlace"), on the production
 * domain by default so it never points at localhost or a preview host.
 */
export function albumPublicUrl(album: AlbumRef, origin = 'https://www.irdlex.org'): string {
  if (album?.slug) return `${origin}/galeria/album/?slug=${encodeURIComponent(album.slug)}`;
  if (album?.id) return `${origin}/galeria/album/?id=${encodeURIComponent(album.id)}`;
  return `${origin}/galeria`;
}
