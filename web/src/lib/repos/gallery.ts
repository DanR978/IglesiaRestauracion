/* ============================================================================
 * web/src/lib/repos/gallery.ts — gallery albums + photos (S22)
 * ----------------------------------------------------------------------------
 * Port of the query half of legacy `js/lib/gallery.js`. Reads return a
 * `ReadResult` and writes a `WriteResult` (ADR-0004); neither throws, and a
 * failed read is `{ ok: false, error }` — never the empty album list legacy
 * rendered as "Aún no hay álbumes". Writes are staff-only via RLS — the
 * client-side split is UX, not the guard.
 *
 * Staff-only calls — every write, `fetchAlbumByIdAdmin`, and the reads that
 * pass `includeUnpublished` — check for a live session first (`./session`):
 * signed out, the anon key would read only the published albums and call
 * that the whole gallery. The published reads stay public.
 *
 * Image optimisation is NOT a repo concern: `uploadPhoto` takes the already
 * optimised blobs (the S46 port of image-optimizer.js produces them).
 *
 * S40 adds `countAlbums` for the admin Inicio (dashboard.js "Álbumes de
 * galería"): every album, drafts included — staff-only for the same reason.
 *
 * Usage:
 *   import { fetchAlbums, fetchAlbumBy, fetchPhotos } from '#lib/repos/gallery.js';
 *   const res = await fetchAlbums();
 *   if (!res.ok) showError(res.error.message);
 * ========================================================================== */

import { browser } from '$app/env';
import { supabase } from '#lib/db/client.js';
import type { Tables, TablesInsert, TablesUpdate } from '#lib/db/database.types.js';
import { BUCKET } from '#lib/gallery.js';
import { slugify } from '#lib/slug.js';
import { fail, invalid, noCount, noRows, ok } from './errors';
import { requireSession } from './session';
import type { ChangeHandler, ReadResult, RepoFailure, Unsubscribe, WriteResult } from './types';

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
  /** Admin only — needs a session; anon RLS hides unpublished rows regardless. */
  includeUnpublished?: boolean;
};

/** Albums newest-first (by event date, then creation), published only by default. */
export async function fetchAlbums({
  year,
  eventType,
  includeUnpublished = false,
}: AlbumFilter = {}): Promise<ReadResult<GalleryAlbum[]>> {
  if (includeUnpublished) {
    const denied = await requireSession(TAG, 'fetchAlbums');
    if (denied) return denied;
  }
  let q = supabase
    .from('gallery_albums')
    .select('*')
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (!includeUnpublished) q = q.eq('is_published', true);
  if (year != null) q = q.eq('year', year);
  if (eventType) q = q.eq('event_type', eventType);
  const { data, error, status } = await q;
  if (error) return fail(TAG, 'fetchAlbums', error, status);
  return ok(data ?? []);
}

export type AlbumLookup = { id?: string | null; slug?: string | null };

/** One published album by id or slug (slug wins when both are given); `null` when none. */
export async function fetchAlbumBy({ id, slug }: AlbumLookup = {}): Promise<
  ReadResult<GalleryAlbum | null>
> {
  if (!id && !slug) return ok(null);
  let q = supabase.from('gallery_albums').select('*').eq('is_published', true);
  if (id) q = q.eq('id', id);
  if (slug) q = q.eq('slug', slug);
  const { data, error, status } = await q.maybeSingle();
  if (error) return fail(TAG, 'fetchAlbumBy', error, status);
  return ok(data);
}

/** One album by id regardless of publication (admin editor); `null` when none. */
export async function fetchAlbumByIdAdmin(id: string): Promise<ReadResult<GalleryAlbum | null>> {
  const denied = await requireSession(TAG, 'fetchAlbumByIdAdmin');
  if (denied) return denied;
  if (!id) return ok(null);
  const { data, error, status } = await supabase
    .from('gallery_albums')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(TAG, 'fetchAlbumByIdAdmin', error, status);
  return ok(data);
}

/** An album's photos in display order. */
export async function fetchPhotos(albumId: string): Promise<ReadResult<GalleryPhoto[]>> {
  if (!albumId) return ok([]);
  const { data, error, status } = await supabase
    .from('gallery_photos')
    .select('*')
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return fail(TAG, 'fetchPhotos', error, status);
  return ok(data ?? []);
}

/** Distinct album years, newest first (the year wheel). */
export async function fetchAvailableYears({
  includeUnpublished = false,
}: Pick<AlbumFilter, 'includeUnpublished'> = {}): Promise<ReadResult<number[]>> {
  if (includeUnpublished) {
    const denied = await requireSession(TAG, 'fetchAvailableYears');
    if (denied) return denied;
  }
  let q = supabase.from('gallery_albums').select('year');
  if (!includeUnpublished) q = q.eq('is_published', true);
  const { data, error, status } = await q;
  if (error) return fail(TAG, 'fetchAvailableYears', error, status);
  return ok([...new Set((data ?? []).map((r) => r.year))].sort((a, b) => b - a));
}

/** How many albums exist, published or not (Inicio, S41). Staff-only. */
export async function countAlbums(): Promise<ReadResult<number>> {
  const denied = await requireSession(TAG, 'countAlbums');
  if (denied) return denied;
  const { count, error, status } = await supabase
    .from('gallery_albums')
    .select('id', { count: 'exact', head: true });
  if (error) return fail(TAG, 'countAlbums', error, status);
  if (count === null) return noCount(TAG, 'countAlbums');
  return ok(count);
}

/* ── Albums: write (staff only via RLS) ────────────────────────────────── */

export type AlbumUpsert = GalleryAlbumInsert & { id?: string };

/** Insert (no `id`) or update (with `id`); derives `slug` from the title when missing. */
export async function upsertAlbum(album: AlbumUpsert): Promise<WriteResult<GalleryAlbum>> {
  const denied = await requireSession(TAG, 'upsertAlbum');
  if (denied) return denied;
  const payload: AlbumUpsert = { ...album };
  if (!payload.slug && payload.title) {
    payload.slug = `${slugify(payload.title)}-${payload.year ?? new Date().getFullYear()}`;
  }
  const query = payload.id
    ? supabase.from('gallery_albums').update(payload).eq('id', payload.id)
    : supabase.from('gallery_albums').insert(payload);
  const { data, error, status } = await query.select().single();
  if (error) return fail(TAG, 'upsertAlbum', error, status);
  return ok(data);
}

/** Every storage object a photo owns: main JPEG, WebP, and thumb. */
function storageVariants(storagePath: string): string[] {
  const base = storagePath.replace(/\.[^./]+$/, '');
  return [storagePath, `${base}.webp`, `${base}-thumb.jpg`];
}

/**
 * Delete an album and best-effort its storage objects first. A failed photo
 * listing aborts the delete: the photo rows would cascade away and leave their
 * storage objects with nothing pointing at them.
 */
export async function deleteAlbum(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteAlbum');
  if (denied) return denied;
  const photos = await fetchPhotos(id);
  if (!photos.ok) return photos;
  const paths = photos.data.flatMap((p) => (p.storage_path ? storageVariants(p.storage_path) : []));
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn(`${TAG} storage cleanup:`, rmErr.message);
  }
  const { error, status, count } = await supabase
    .from('gallery_albums')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteAlbum', error, status);
  if (!count) return noRows(TAG, 'deleteAlbum');
  return ok(undefined);
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
 * asset so cards stay sharp on retina; JPEG fallback). The cover step is
 * best-effort: once the photo row exists, a cover failure is logged rather
 * than returned, so a Retry never uploads the same photo twice.
 */
export async function uploadPhoto(
  albumId: string,
  image: OptimizedImage,
): Promise<WriteResult<GalleryPhoto>> {
  const denied = await requireSession(TAG, 'uploadPhoto');
  if (denied) return denied;
  if (!albumId || !image) return invalid('Falta el álbum o la foto.');

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
  if (failed?.error) return fail(TAG, 'uploadPhoto storage', failed.error);

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

  const { data, error, status } = await supabase
    .from('gallery_photos')
    .insert(row)
    .select()
    .single();
  if (error) {
    // Best-effort cleanup so a failed insert leaves no orphan objects.
    bucket.remove([mainPath, webpPath, thumbPath]).catch(() => {});
    return fail(TAG, 'uploadPhoto', error, status);
  }

  const { count, error: countErr } = await supabase
    .from('gallery_photos')
    .select('*', { count: 'exact', head: true })
    .eq('album_id', albumId);
  if (countErr) console.warn(`${TAG} uploadPhoto cover:`, countErr.message);
  if (count === 1) {
    const { error: coverErr } = await supabase
      .from('gallery_albums')
      .update({ cover_photo_id: data.id, cover_url: data.webp_url || data.public_url })
      .eq('id', albumId);
    if (coverErr) console.warn(`${TAG} uploadPhoto cover:`, coverErr.message);
  }

  return ok(data);
}

/** Delete a photo row and best-effort its storage objects first. */
export async function deletePhoto(
  photo: Pick<GalleryPhoto, 'id'> & { storage_path?: string | null },
): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deletePhoto');
  if (denied) return denied;
  if (!photo?.id) return invalid('Falta la foto que quieres eliminar.');
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
  const { error, status, count } = await supabase
    .from('gallery_photos')
    .delete({ count: 'exact' })
    .eq('id', photo.id);
  if (error) return fail(TAG, 'deletePhoto', error, status);
  if (!count) return noRows(TAG, 'deletePhoto');
  return ok(undefined);
}

export async function setAlbumCover(
  albumId: string,
  photoId: string,
  coverUrl: string,
): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'setAlbumCover');
  if (denied) return denied;
  const { error, status, count } = await supabase
    .from('gallery_albums')
    .update({ cover_photo_id: photoId, cover_url: coverUrl }, { count: 'exact' })
    .eq('id', albumId);
  if (error) return fail(TAG, 'setAlbumCover', error, status);
  if (!count) return noRows(TAG, 'setAlbumCover');
  return ok(undefined);
}

export async function updatePhoto(
  photoId: string,
  patch: GalleryPhotoUpdate,
): Promise<WriteResult<GalleryPhoto>> {
  const denied = await requireSession(TAG, 'updatePhoto');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('gallery_photos')
    .update(patch)
    .eq('id', photoId)
    .select()
    .single();
  if (error) return fail(TAG, 'updatePhoto', error, status);
  return ok(data);
}

/**
 * Persist a drag order: one update per id (simple, RLS-safe). Every id is
 * attempted and the first failure wins — an id that matched no photo of this
 * album (deleted meanwhile, or hidden by RLS) counts as one.
 */
export async function reorderPhotos(albumId: string, orderedIds: string[]): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'reorderPhotos');
  if (denied) return denied;
  if (!albumId) return invalid('Falta el álbum.');
  let firstFailure: RepoFailure | null = null;
  for (let i = 0; i < orderedIds.length; i++) {
    const { error, status, count } = await supabase
      .from('gallery_photos')
      .update({ sort_order: i }, { count: 'exact' })
      .eq('id', orderedIds[i])
      .eq('album_id', albumId);
    const failure = error
      ? fail(TAG, 'reorderPhotos', error, status)
      : !count
        ? noRows(TAG, 'reorderPhotos')
        : null;
    firstFailure ??= failure;
  }
  return firstFailure ?? ok(undefined);
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
