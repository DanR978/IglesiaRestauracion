// js/lib/gallery.js
// ─────────────────────────────────────────────────────────────────────────────
// Typed Supabase queries + storage helpers for the Gallery feature.
// Uses /js/lib/image-optimizer.js to compress + resize images client-side
// before they ever leave the browser (matches scripts/optimize-images.js).
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';
import { optimizeImage } from '/js/lib/image-optimizer.js';

/* ── Constants ─────────────────────────────────────────────────────────────── */

export const EVENT_TYPES = [
  { value: 'baptism',         label: 'Bautismo',           icon: 'fa-water'        },
  { value: 'youth',           label: 'Jóvenes',             icon: 'fa-fire'         },
  { value: 'worship',         label: 'Adoración',           icon: 'fa-music'        },
  { value: 'outreach',        label: 'Evangelismo',         icon: 'fa-hands-helping' },
  { value: 'discipulado',     label: 'Discipulado',         icon: 'fa-people-group' },
  { value: 'conference',      label: 'Conferencia',         icon: 'fa-microphone'   },
  { value: 'christmas',       label: 'Navidad',             icon: 'fa-star'         },
  { value: 'easter',          label: 'Resurrección',        icon: 'fa-cross'        },
  { value: 'prayer',          label: 'Noche de oración',    icon: 'fa-pray'         },
  { value: 'missions',        label: 'Misiones',            icon: 'fa-globe'        },
  { value: 'picnic',          label: 'Convivencia',         icon: 'fa-utensils'     },
  { value: 'special_service', label: 'Servicio especial',   icon: 'fa-church'       },
  { value: 'fellowship',      label: 'Comunión',            icon: 'fa-heart'        },
  { value: 'other',           label: 'Otro',                icon: 'fa-image'        },
];

export const EVENT_TYPE_LABEL = Object.fromEntries(
  EVENT_TYPES.map(t => [t.value, t.label]),
);

export const BUCKET = 'gallery';

/* ── Slug helper ──────────────────────────────────────────────────────────── */

export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

/* ── Albums: read ─────────────────────────────────────────────────────────── */

export async function fetchAlbums({ year, eventType, includeUnpublished = false } = {}) {
  if (!sb) return [];
  let q = sb.from('gallery_albums').select('*')
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (!includeUnpublished) q = q.eq('is_published', true);
  if (year != null)         q = q.eq('year', year);
  if (eventType)            q = q.eq('event_type', eventType);
  const { data, error } = await q;
  if (error) { console.warn('[gallery] fetchAlbums:', error.message); return []; }
  return data ?? [];
}

export async function fetchAlbumBy({ id, slug } = {}) {
  if (!sb || (!id && !slug)) return null;
  let q = sb.from('gallery_albums').select('*').eq('is_published', true);
  if (id)   q = q.eq('id', id);
  if (slug) q = q.eq('slug', slug);
  const { data, error } = await q.maybeSingle();
  if (error) { console.warn('[gallery] fetchAlbumBy:', error.message); return null; }
  return data;
}

export async function fetchAlbumByIdAdmin(id) {
  if (!sb || !id) return null;
  const { data, error } = await sb.from('gallery_albums').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[gallery] fetchAlbumByIdAdmin:', error.message); return null; }
  return data;
}

export async function fetchPhotos(albumId) {
  if (!sb || !albumId) return [];
  const { data, error } = await sb.from('gallery_photos')
    .select('*')
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) { console.warn('[gallery] fetchPhotos:', error.message); return []; }
  return data ?? [];
}

export async function fetchAvailableYears({ includeUnpublished = false } = {}) {
  if (!sb) return [];
  let q = sb.from('gallery_albums').select('year');
  if (!includeUnpublished) q = q.eq('is_published', true);
  const { data, error } = await q;
  if (error) return [];
  return [...new Set((data ?? []).map(r => r.year))].sort((a, b) => b - a);
}

/* ── Albums: write (staff only via RLS) ───────────────────────────────────── */

export async function upsertAlbum(album) {
  if (!sb) return { error: 'no-supabase' };
  const payload = { ...album };
  if (!payload.slug && payload.title) payload.slug = `${slugify(payload.title)}-${payload.year ?? new Date().getFullYear()}`;
  const fn = payload.id ? sb.from('gallery_albums').update(payload).eq('id', payload.id)
                        : sb.from('gallery_albums').insert(payload);
  const { data, error } = await fn.select().single();
  if (error) { console.warn('[gallery] upsertAlbum:', error.message); return { error: error.message }; }
  return { data };
}

export async function deleteAlbum(id) {
  if (!sb) return { error: 'no-supabase' };
  // First fetch the photos so we can delete the storage objects
  const photos = await fetchPhotos(id);
  const paths = [];
  for (const p of photos) {
    if (p.storage_path) paths.push(p.storage_path);
    // Also remove the webp + thumb variants (same basename, different suffix)
    if (p.storage_path) {
      const base = p.storage_path.replace(/\.[^./]+$/, '');
      paths.push(`${base}.webp`);
      paths.push(`${base}-thumb.jpg`);
    }
  }
  if (paths.length) {
    const { error: rmErr } = await sb.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn('[gallery] storage cleanup:', rmErr.message);
  }
  const { error } = await sb.from('gallery_albums').delete().eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

/* ── Photos: upload + management ──────────────────────────────────────────── */

/**
 * Upload one photo into an album. Generates main JPEG, WebP, and thumb via
 * client-side optimizer, uploads all three to Supabase Storage, and inserts
 * a gallery_photos row.
 *
 * Returns { data, error } shaped like other helpers.
 */
export async function uploadPhoto(file, albumId, opts = {}) {
  if (!sb || !albumId || !file) return { error: 'Argumentos inválidos' };

  let opt;
  try {
    opt = await optimizeImage(file, opts);
  } catch (e) {
    return { error: `No se pudo procesar la imagen: ${e?.message || e}` };
  }

  const id   = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const base = `${albumId}/${id}`;
  const mainPath  = `${base}.jpg`;
  const webpPath  = `${base}.webp`;
  const thumbPath = `${base}-thumb.jpg`;

  const uploads = await Promise.all([
    sb.storage.from(BUCKET).upload(mainPath,  opt.main,  { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }),
    sb.storage.from(BUCKET).upload(webpPath,  opt.webp,  { contentType: 'image/webp', cacheControl: '31536000', upsert: false }),
    sb.storage.from(BUCKET).upload(thumbPath, opt.thumb, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }),
  ]);

  const firstErr = uploads.find(u => u.error);
  if (firstErr) {
    console.warn('[gallery] uploadPhoto storage:', firstErr.error.message);
    return { error: firstErr.error.message };
  }

  const url = (p) => sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
  const row = {
    album_id:      albumId,
    storage_path:  mainPath,
    public_url:    url(mainPath),
    webp_url:      url(webpPath),
    thumbnail_url: url(thumbPath),
    width:         opt.width,
    height:        opt.height,
    mime_type:     'image/jpeg',
    file_size:     opt.main.size,
  };

  const { data, error } = await sb.from('gallery_photos').insert(row).select().single();
  if (error) {
    // Best-effort cleanup if DB insert failed
    sb.storage.from(BUCKET).remove([mainPath, webpPath, thumbPath]).catch(() => {});
    return { error: error.message };
  }

  // If this is the album's first photo, set it as the cover automatically.
  // Use the WebP main asset (1920px) so cards stay sharp on retina; fall back to JPEG.
  const { count } = await sb.from('gallery_photos').select('*', { count: 'exact', head: true }).eq('album_id', albumId);
  if (count === 1) {
    await sb.from('gallery_albums')
      .update({ cover_photo_id: data.id, cover_url: data.webp_url || data.public_url })
      .eq('id', albumId);
  }

  return { data };
}

export async function deletePhoto(photo) {
  if (!sb || !photo?.id) return { error: 'Argumentos inválidos' };
  const base = photo.storage_path?.replace(/\.[^./]+$/, '');
  const paths = base
    ? [`${base}.jpg`, `${base}.webp`, `${base}-thumb.jpg`]
    : [photo.storage_path].filter(Boolean);
  if (paths.length) {
    const { error: rmErr } = await sb.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn('[gallery] deletePhoto storage:', rmErr.message);
  }
  const { error } = await sb.from('gallery_photos').delete().eq('id', photo.id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function setAlbumCover(albumId, photoId, coverUrl) {
  if (!sb) return { error: 'no-supabase' };
  const { error } = await sb.from('gallery_albums')
    .update({ cover_photo_id: photoId, cover_url: coverUrl })
    .eq('id', albumId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function updatePhoto(photoId, patch) {
  if (!sb) return { error: 'no-supabase' };
  const { data, error } = await sb.from('gallery_photos').update(patch).eq('id', photoId).select().single();
  if (error) return { error: error.message };
  return { data };
}

export async function reorderPhotos(albumId, orderedIds) {
  if (!sb || !albumId) return { error: 'no-supabase' };
  // Batched update: one query per id (kept simple, RLS-safe)
  const errors = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb.from('gallery_photos')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('album_id', albumId);
    if (error) errors.push(error.message);
  }
  return errors.length ? { error: errors[0] } : { ok: true };
}

/* ── Realtime ─────────────────────────────────────────────────────────────── */

export function subscribeAlbums(onChange) {
  if (!sb) return () => {};
  const ch = sb.channel('gallery-albums')
    .on('postgres_changes',
       { event: '*', schema: 'public', table: 'gallery_albums' },
       onChange)
    .subscribe();
  return () => { try { ch.unsubscribe(); } catch (_) {} };
}

export function subscribePhotos(albumId, onChange) {
  if (!sb) return () => {};
  const ch = sb.channel(`gallery-photos-${albumId}`)
    .on('postgres_changes',
       { event: '*', schema: 'public', table: 'gallery_photos', filter: `album_id=eq.${albumId}` },
       onChange)
    .subscribe();
  return () => { try { ch.unsubscribe(); } catch (_) {} };
}

/* ── Display helpers ──────────────────────────────────────────────────────── */

export function formatEventDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00');
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function albumPublicUrl(album, origin = 'https://www.irdlex.org') {
  if (album?.slug) return `${origin}/galeria/album/?slug=${encodeURIComponent(album.slug)}`;
  if (album?.id)   return `${origin}/galeria/album/?id=${encodeURIComponent(album.id)}`;
  return `${origin}/galeria`;
}
