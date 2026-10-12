// S22 — repos/gallery: query shape per legacy js/lib/gallery.js + contracts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  deleteAlbum,
  deletePhoto,
  fetchAlbumBy,
  fetchAlbumByIdAdmin,
  fetchAlbums,
  fetchAvailableYears,
  fetchPhotos,
  reorderPhotos,
  setAlbumCover,
  subscribeAlbums,
  subscribePhotos,
  updatePhoto,
  uploadPhoto,
  upsertAlbum,
} from '$lib/repos/gallery';

const ERR = { message: 'boom' };
const blob = (size: number): Blob => new Blob([new Uint8Array(size)]);

describe('repos/gallery', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchAlbums (gallery.js:52)', () => {
    it('published only by default, newest event_date then created_at', async () => {
      await fetchAlbums();
      expect(mock.query().table).toBe('gallery_albums');
      expect(mock.chain()).toEqual(['select', 'order', 'order', 'eq']);
      expect(mock.args('select')).toEqual(['*']);
      expect(mock.query().calls[1].args).toEqual([
        'event_date',
        { ascending: false, nullsFirst: false },
      ]);
      expect(mock.query().calls[2].args).toEqual(['created_at', { ascending: false }]);
      expect(mock.args('eq')).toEqual(['is_published', true]);
    });

    it('applies year + eventType filters and drops the published filter for admin', async () => {
      await fetchAlbums({ year: 2025, eventType: 'youth', includeUnpublished: true });
      const eqs = mock.query().calls.filter((c) => c.method === 'eq');
      expect(eqs.map((c) => c.args)).toEqual([
        ['year', 2025],
        ['event_type', 'youth'],
      ]);
    });

    it('returns [] and warns on error', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await fetchAlbums()).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[gallery] fetchAlbums:', 'boom');
    });
  });

  describe('fetchAlbumBy (gallery.js:65)', () => {
    it('published + id/slug, maybeSingle', async () => {
      mock.results.gallery_albums = [{ data: { id: 'a' } }];
      expect(await fetchAlbumBy({ slug: 'x', id: 'a' })).toEqual({ id: 'a' });
      expect(mock.chain()).toEqual(['select', 'eq', 'eq', 'eq', 'maybeSingle']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['is_published', true],
        ['id', 'a'],
        ['slug', 'x'],
        [],
      ]);
    });

    it('returns null without a query when neither key is given', async () => {
      expect(await fetchAlbumBy({})).toBeNull();
      expect(await fetchAlbumBy()).toBeNull();
      expect(mock.queries).toHaveLength(0);
    });

    it('returns null on error', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await fetchAlbumBy({ id: 'a' })).toBeNull();
      expect(warn).toHaveBeenCalledWith('[gallery] fetchAlbumBy:', 'boom');
    });
  });

  describe('fetchAlbumByIdAdmin (gallery.js:75)', () => {
    it('does not filter on is_published', async () => {
      await fetchAlbumByIdAdmin('a');
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('eq')).toEqual(['id', 'a']);
    });
    it('null for empty id, no query', async () => {
      expect(await fetchAlbumByIdAdmin('')).toBeNull();
      expect(mock.queries).toHaveLength(0);
    });
  });

  describe('fetchPhotos (gallery.js:82)', () => {
    it('album_id filter, sort_order then created_at ascending', async () => {
      await fetchPhotos('alb');
      expect(mock.query().table).toBe('gallery_photos');
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);
      expect(mock.args('eq')).toEqual(['album_id', 'alb']);
      expect(mock.query().calls[2].args).toEqual(['sort_order', { ascending: true }]);
      expect(mock.query().calls[3].args).toEqual(['created_at', { ascending: true }]);
    });
    it('[] for empty id and on error', async () => {
      expect(await fetchPhotos('')).toEqual([]);
      mock.results.gallery_photos = [{ data: null, error: ERR }];
      expect(await fetchPhotos('alb')).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[gallery] fetchPhotos:', 'boom');
    });
  });

  describe('fetchAvailableYears (gallery.js:93)', () => {
    it('selects year, published only, distinct + descending', async () => {
      mock.results.gallery_albums = [
        { data: [{ year: 2024 }, { year: 2026 }, { year: 2024 }, { year: 2025 }] },
      ];
      expect(await fetchAvailableYears()).toEqual([2026, 2025, 2024]);
      expect(mock.chain()).toEqual(['select', 'eq']);
      expect(mock.args('select')).toEqual(['year']);
    });
    it('[] on error', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await fetchAvailableYears()).toEqual([]);
    });
  });

  describe('upsertAlbum (gallery.js:104)', () => {
    it('inserts with a derived slug when none given', async () => {
      mock.results.gallery_albums = [{ data: { id: 'n' } }];
      const res = await upsertAlbum({ title: 'Noche de Oración', year: 2026 });
      expect(res).toEqual({ ok: true, data: { id: 'n' } });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')[0]).toMatchObject({ slug: 'noche-de-oracion-2026' });
    });
    it('updates by id and keeps a given slug', async () => {
      mock.results.gallery_albums = [{ data: { id: 'a' } }];
      await upsertAlbum({ id: 'a', title: 'T', year: 2026, slug: 'keep' });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
      expect(mock.args('update')[0]).toMatchObject({ slug: 'keep' });
      expect(mock.args('eq')).toEqual(['id', 'a']);
    });
    it('returns { ok:false, error } on failure', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await upsertAlbum({ title: 'T', year: 2026 })).toEqual({ ok: false, error: 'boom' });
    });
  });

  describe('deleteAlbum (gallery.js:115)', () => {
    it('removes every storage variant, then deletes the row', async () => {
      mock.results.gallery_photos = [{ data: [{ storage_path: 'alb/p1.jpg' }] }];
      const res = await deleteAlbum('alb');
      expect(res).toEqual({ ok: true, data: undefined });
      expect(mock.storage.calls[0]).toEqual({
        method: 'remove',
        args: [['alb/p1.jpg', 'alb/p1.webp', 'alb/p1-thumb.jpg']],
      });
      const del = mock.query(1);
      expect(del.table).toBe('gallery_albums');
      expect(del.calls.map((c) => c.method)).toEqual(['delete', 'eq']);
    });
    it('reports the row error', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await deleteAlbum('alb')).toEqual({ ok: false, error: 'boom' });
    });
  });

  describe('uploadPhoto (gallery.js:147)', () => {
    const image = { main: blob(300), webp: blob(200), thumb: blob(50), width: 1920, height: 1080 };

    it('uploads 3 renditions, inserts the row, and sets the cover for a first photo', async () => {
      mock.results.gallery_photos = [
        { data: { id: 'p', webp_url: 'w', public_url: 'j' } },
        { data: null, count: 1 },
      ];
      const res = await uploadPhoto('alb', image);
      expect(res.ok).toBe(true);
      const uploads = mock.storage.calls.filter((c) => c.method === 'upload');
      expect(uploads).toHaveLength(3);
      expect(uploads.map((u) => u.args[2])).toEqual([
        { cacheControl: '31536000', upsert: false, contentType: 'image/jpeg' },
        { cacheControl: '31536000', upsert: false, contentType: 'image/webp' },
        { cacheControl: '31536000', upsert: false, contentType: 'image/jpeg' },
      ]);
      const [mainPath] = uploads[0].args as [string];
      expect(mainPath).toMatch(/^alb\/[^/]+\.jpg$/);
      const ins = mock.query(0);
      expect(ins.table).toBe('gallery_photos');
      expect(ins.calls.map((c) => c.method)).toEqual(['insert', 'select', 'single']);
      expect(ins.calls[0].args[0]).toMatchObject({
        album_id: 'alb',
        storage_path: mainPath,
        public_url: `https://cdn.test/${mainPath}`,
        mime_type: 'image/jpeg',
        file_size: 300,
        width: 1920,
        height: 1080,
      });
      expect(mock.query(1).calls[0]).toEqual({
        method: 'select',
        args: ['*', { count: 'exact', head: true }],
      });
      const cover = mock.query(2);
      expect(cover.table).toBe('gallery_albums');
      expect(cover.calls[0]).toEqual({
        method: 'update',
        args: [{ cover_photo_id: 'p', cover_url: 'w' }],
      });
    });

    it('does not touch the cover when the album already had photos', async () => {
      mock.results.gallery_photos = [{ data: { id: 'p' } }, { data: null, count: 4 }];
      await uploadPhoto('alb', image);
      expect(mock.queries.map((q) => q.table)).toEqual(['gallery_photos', 'gallery_photos']);
    });

    it('fails fast on a storage error and inserts nothing', async () => {
      mock.storage.uploadError = { message: 'bucket full' };
      expect(await uploadPhoto('alb', image)).toEqual({ ok: false, error: 'bucket full' });
      expect(mock.queries).toHaveLength(0);
    });

    it('cleans up storage when the row insert fails', async () => {
      mock.results.gallery_photos = [{ data: null, error: ERR }];
      expect(await uploadPhoto('alb', image)).toEqual({ ok: false, error: 'boom' });
      expect(mock.storage.calls.at(-1)?.method).toBe('remove');
    });

    it('rejects missing args without a network call', async () => {
      expect((await uploadPhoto('', image)).ok).toBe(false);
      expect(mock.storage.calls).toHaveLength(0);
    });
  });

  describe('deletePhoto / setAlbumCover / updatePhoto / reorderPhotos', () => {
    it('deletePhoto removes jpg/webp/thumb then the row', async () => {
      expect(await deletePhoto({ id: 'p', storage_path: 'alb/p.jpg' })).toEqual({
        ok: true,
        data: undefined,
      });
      expect(mock.storage.calls[0].args).toEqual([['alb/p.jpg', 'alb/p.webp', 'alb/p-thumb.jpg']]);
      expect(mock.query().table).toBe('gallery_photos');
      expect(mock.chain()).toEqual(['delete', 'eq']);
    });
    it('deletePhoto rejects a photo without id', async () => {
      expect((await deletePhoto({ id: '' })).ok).toBe(false);
    });
    it('setAlbumCover updates the two cover columns', async () => {
      await setAlbumCover('alb', 'p', 'u');
      expect(mock.args('update')).toEqual([{ cover_photo_id: 'p', cover_url: 'u' }]);
      expect(mock.args('eq')).toEqual(['id', 'alb']);
    });
    it('updatePhoto returns the updated row', async () => {
      mock.results.gallery_photos = [{ data: { id: 'p', caption: 'c' } }];
      expect(await updatePhoto('p', { caption: 'c' })).toEqual({
        ok: true,
        data: { id: 'p', caption: 'c' },
      });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
    });
    it('reorderPhotos issues one scoped update per id; first error wins', async () => {
      mock.results.gallery_photos = [
        {},
        { error: { message: 'e2' } },
        { error: { message: 'e3' } },
      ];
      expect(await reorderPhotos('alb', ['a', 'b', 'c'])).toEqual({ ok: false, error: 'e2' });
      expect(mock.queries).toHaveLength(3);
      expect(mock.query(1).calls.map((c) => c.args)).toEqual([
        [{ sort_order: 1 }],
        ['id', 'b'],
        ['album_id', 'alb'],
      ]);
    });
    it('reorderPhotos succeeds when every update does', async () => {
      expect(await reorderPhotos('alb', ['a'])).toEqual({ ok: true, data: undefined });
    });
  });

  describe('realtime under prerender (browser=false)', () => {
    it('subscribeAlbums / subscribePhotos open no channel', () => {
      subscribeAlbums(() => {})();
      subscribePhotos('alb', () => {})();
      expect(mock.channels).toHaveLength(0);
    });
  });
});
