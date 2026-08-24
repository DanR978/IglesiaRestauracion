/* ============================================================================
 * web/src/lib/repos/gallery.ts — gallery albums + photos (S22)
 * ----------------------------------------------------------------------------
 * Port of the query half of legacy `js/lib/gallery.js`. Reads never throw
 * (warn with `[gallery]`, return a safe empty); writes return `WriteResult`.
 * Writes are staff-only via RLS — the client-side split is UX, not the guard.
 *
 * Image optimisation is NOT a repo concern: `uploadPhoto` takes the already
 * optimised blobs (the S46 port of image-optimizer.js produces them).
 *
 * Usage:
 *   import { fetchAlbums, fetchAlbumBy, fetchPhotos } from '$lib/repos/gallery';
 * ========================================================================== */

import { browser } from '$app/environment';
import { supabase } from '$lib/db/client';
import type { Tables, TablesInsert, TablesUpdate } from '$lib/db/database.types';
import { BUCKET } from '$lib/gallery';
import { slugify } from '$lib/slug';
import type { ChangeHandler, Unsubscribe, WriteResult } from './types';

const TAG = '[gallery]';

export type GalleryAlbum = Tables<'gallery_albums'>;
export type GalleryAlbumInsert = TablesInsert<'gallery_albums'>;
export type GalleryAlbumUpdate = TablesUpdate<'gallery_albums'>;
export type GalleryPhoto = Tables<'gallery_photos'>;
export type GalleryPhotoUpdate = TablesUpdate<'gallery_photos'>;

/* ── Albums: read ──────────────────────────────────────────────────────── */

export type AlbumFilter = {
  year?: number | null;
  eventType?: string | null;
  /** Admin only — anon RLS hides unpublished rows regardless. */
  includeUnpublished?: boolean;
};

/** Albums newest-first (by event date, then creation), published only by default. */
export async function fetchAlbums({
  year,
  eventType,
  includeUnpublished = false,
}: AlbumFilter = {}): Promise<GalleryAlbum[]> {
  let q = supabase
    .from('gallery_albums')
    .select('*')
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (!includeUnpublished) q = q.eq('is_published', true);
  if (year != null) q = q.eq('year', year);
  if (eventType) q = q.eq('event_type', eventType);
  const { data, error } = await q;
  if (error) {
    console.warn(`${TAG} fetchAlbums:`, error.message);
    return [];
  }
  return data ?? [];
}

export type AlbumLookup = { id?: string | null; slug?: string | null };

/** One published album by id or slug (slug wins when both are given). */
export async function fetchAlbumBy({ id, slug }: AlbumLookup = {}): Promise<GalleryAlbum | null> {
  if (!id && !slug) return null;
  let q = supabase.from('gallery_albums').select('*').eq('is_published', true);
  if (id) q = q.eq('id', id);
  if (slug) q = q.eq('slug', slug);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.warn(`${TAG} fetchAlbumBy:`, error.message);
    return null;
  }
  return data;
}

/** One album by id regardless of publication (admin editor). */
export async function fetchAlbumByIdAdmin(id: string): Promise<GalleryAlbum | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from('gallery_albums')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn(`${TAG} fetchAlbumByIdAdmin:`, error.message);
    return null;
  }
  return data;
}

/** An album's photos in display order. */
export async function fetchPhotos(albumId: string): Promise<GalleryPhoto[]> {
  if (!albumId) return [];
  const { data, error } = await supabase
    .from('gallery_photos')
    .select('*')
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.warn(`${TAG} fetchPhotos:`, error.message);
    return [];
  }
  return data ?? [];
}

/** Distinct album years, newest first (the year wheel). */
export async function fetchAvailableYears({
  includeUnpublished = false,
}: Pick<AlbumFilter, 'includeUnpublished'> = {}): Promise<number[]> {
  let q = supabase.from('gallery_albums').select('year');
  if (!includeUnpublished) q = q.eq('is_published', true);
  const { data, error } = await q;
  if (error) {
    console.warn(`${TAG} fetchAvailableYears:`, error.message);
    return [];
  }
  return [...new Set((data ?? []).map((r) => r.year))].sort((a, b) => b - a);
}

/* ── Albums: write (staff only via RLS) ────────────────────────────────── */

export type AlbumUpsert = GalleryAlbumInsert & { id?: string };

/** Insert (no `id`) or update (with `id`); derives `slug` from the title when missing. */
export async function upsertAlbum(album: AlbumUpsert): Promise<WriteResult<GalleryAlbum>> {
  const payload: AlbumUpsert = { ...album };
  if (!payload.slug && payload.title) {
    payload.slug = `${slugify(payload.title)}-${payload.year ?? new Date().getFullYear()}`;
  }
  const query = payload.id
    ? supabase.from('gallery_albums').update(payload).eq('id', payload.id)
    : supabase.from('gallery_albums').insert(payload);
  const { data, error } = await query.select().single();
  if (error) {
    console.warn(`${TAG} upsertAlbum:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

/** Every storage object a photo owns: main JPEG, WebP, and thumb. */
function storageVariants(storagePath: string): string[] {
  const base = storagePath.replace(/\.[^./]+$/, '');
  return [storagePath, `${base}.webp`, `${base}-thumb.jpg`];
}

/** Delete an album and best-effort its storage objects first. */
export async function deleteAlbum(id: string): Promise<WriteResult> {
  const photos = await fetchPhotos(id);
  const paths = photos.flatMap((p) => (p.storage_path ? storageVariants(p.storage_path) : []));
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn(`${TAG} storage cleanup:`, rmErr.message);
  }
  const { error } = await supabase.from('gallery_albums').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/* ── Photos: upload + management ───────────────────────────────────────── */

/** Output of the client-side optimiser: three renditions plus the main size. */
export type OptimizedImage = {
  main: Blob;
  webp: Blob;
  thumb: Blob;
  width: number | null;
  height: number | null;
};

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Upload one optimised photo into an album — three storage objects and one
 * `gallery_photos` row. The album's first photo becomes its cover (WebP main
 * asset so cards stay sharp on retina; JPEG fallback).
 */
export async function uploadPhoto(
  albumId: string,
  image: OptimizedImage,
): Promise<WriteResult<GalleryPhoto>> {
  if (!albumId || !image) return { ok: false, error: 'Argumentos inválidos' };

  const base = `${albumId}/${newId()}`;
  const mainPath = `${base}.jpg`;
  const webpPath = `${base}.webp`;
  const thumbPath = `${base}-thumb.jpg`;
  const bucket = supabase.storage.from(BUCKET);
  const opts = { cacheControl: '31536000', upsert: false };

  const uploads = await Promise.all([
    bucket.upload(mainPath, image.main, { ...opts, contentType: 'image/jpeg' }),
    bucket.upload(webpPath, image.webp, { ...opts, contentType: 'image/webp' }),
    bucket.upload(thumbPath, image.thumb, { ...opts, contentType: 'image/jpeg' }),
  ]);
  const failed = uploads.find((u) => u.error);
  if (failed?.error) {
    console.warn(`${TAG} uploadPhoto storage:`, failed.error.message);
    return { ok: false, error: failed.error.message };
  }

  const url = (p: string): string => bucket.getPublicUrl(p).data.publicUrl;
  const row: TablesInsert<'gallery_photos'> = {
    album_id: albumId,
    storage_path: mainPath,
    public_url: url(mainPath),
    webp_url: url(webpPath),
    thumbnail_url: url(thumbPath),
    width: image.width,
    height: image.height,
    mime_type: 'image/jpeg',
    file_size: image.main.size,
  };

  const { data, error } = await supabase.from('gallery_photos').insert(row).select().single();
  if (error) {
    // Best-effort cleanup so a failed insert leaves no orphan objects.
    bucket.remove([mainPath, webpPath, thumbPath]).catch(() => {});
    return { ok: false, error: error.message };
  }

  const { count } = await supabase
    .from('gallery_photos')
    .select('*', { count: 'exact', head: true })
    .eq('album_id', albumId);
  if (count === 1) {
    await supabase
      .from('gallery_albums')
      .update({ cover_photo_id: data.id, cover_url: data.webp_url || data.public_url })
      .eq('id', albumId);
  }

  return { ok: true, data };
}

/** Delete a photo row and best-effort its storage objects first. */
export async function deletePhoto(
  photo: Pick<GalleryPhoto, 'id'> & { storage_path?: string | null },
): Promise<WriteResult> {
  if (!photo?.id) return { ok: false, error: 'Argumentos inválidos' };
  const base = photo.storage_path?.replace(/\.[^./]+$/, '');
  const paths = base
    ? [`${base}.jpg`, `${base}.webp`, `${base}-thumb.jpg`]
    : photo.storage_path
      ? [photo.storage_path]
      : [];
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn(`${TAG} deletePhoto storage:`, rmErr.message);
  }
  const { error } = await supabase.from('gallery_photos').delete().eq('id', photo.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function setAlbumCover(
  albumId: string,
  photoId: string,
  coverUrl: string,
): Promise<WriteResult> {
  const { error } = await supabase
    .from('gallery_albums')
    .update({ cover_photo_id: photoId, cover_url: coverUrl })
    .eq('id', albumId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function updatePhoto(
  photoId: string,
  patch: GalleryPhotoUpdate,
): Promise<WriteResult<GalleryPhoto>> {
  const { data, error } = await supabase
    .from('gallery_photos')
    .update(patch)
    .eq('id', photoId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/** Persist a drag order: one update per id (simple, RLS-safe). First error wins. */
export async function reorderPhotos(albumId: string, orderedIds: string[]): Promise<WriteResult> {
  if (!albumId) return { ok: false, error: 'Argumentos inválidos' };
  const errors: string[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('gallery_photos')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('album_id', albumId);
    if (error) errors.push(error.message);
  }
  return errors.length ? { ok: false, error: errors[0] } : { ok: true, data: undefined };
}

/* ── Realtime ──────────────────────────────────────────────────────────── */

/** Any change to `gallery_albums`. No-op during prerender. */
export function subscribeAlbums(onChange: ChangeHandler<GalleryAlbum>): Unsubscribe {
  if (!browser) return () => {};
  const ch = supabase
    .channel('gallery-albums')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_albums' }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

/** Any change to one album's photos. No-op during prerender. */
export function subscribePhotos(
  albumId: string,
  onChange: ChangeHandler<GalleryPhoto>,
): Unsubscribe {
  if (!browser) return () => {};
  const ch = supabase
    .channel(`gallery-photos-${albumId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'gallery_photos', filter: `album_id=eq.${albumId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
