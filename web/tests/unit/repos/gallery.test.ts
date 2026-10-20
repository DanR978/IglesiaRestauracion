// S22 — repos/gallery: query shape per legacy js/lib/gallery.js. S22b — the
// ReadResult / WriteResult contract: a failed read is `{ ok: false }` (legacy
// rendered it as "Aún no hay álbumes"), a delete/update that matched no row
// is `not_found` (D-027), and a staff-only call made signed out is `auth`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  NOT_FOUND,
  NO_SESSION,
  OFFLINE,
  RLS_DENIED,
  SIGNED_OUT,
  failure,
  invalidInput,
} from './results';
import { describeSessionGate } from './session-gate';
import * as gallery from '#lib/repos/gallery.js';
import {
  countAlbums,
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
} from '#lib/repos/gallery.js';

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
      mock.results.gallery_albums = [{ data: [{ id: 'a' }] }];
      expect(await fetchAlbums()).toEqual({ ok: true, data: [{ id: 'a' }] });
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

    it('no albums is an empty SUCCESS', async () => {
      mock.results.gallery_albums = [{ data: [] }];
      expect(await fetchAlbums()).toEqual({ ok: true, data: [] });
    });

    it('a failed read is an error — never the "Aún no hay álbumes" empty list (D-032)', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      const res = await fetchAlbums();
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(warn).toHaveBeenCalledWith('[gallery] fetchAlbums:', 'boom');
    });

    it('a dropped connection is a network error', async () => {
      mock.results.gallery_albums = [OFFLINE];
      expect(await fetchAlbums()).toEqual(failure('network', 'TypeError: Failed to fetch'));
    });
  });

  describe('fetchAlbumBy (gallery.js:65)', () => {
    it('published + id/slug, maybeSingle', async () => {
      mock.results.gallery_albums = [{ data: { id: 'a' } }];
      expect(await fetchAlbumBy({ slug: 'x', id: 'a' })).toEqual({ ok: true, data: { id: 'a' } });
      expect(mock.chain()).toEqual(['select', 'eq', 'eq', 'eq', 'maybeSingle']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['is_published', true],
        ['id', 'a'],
        ['slug', 'x'],
        [],
      ]);
    });

    it('a successful null without a query when neither key is given', async () => {
      expect(await fetchAlbumBy({})).toEqual({ ok: true, data: null });
      expect(await fetchAlbumBy()).toEqual({ ok: true, data: null });
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed lookup is an error, never a null album', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await fetchAlbumBy({ id: 'a' })).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[gallery] fetchAlbumBy:', 'boom');
    });
  });

  describe('fetchAlbumByIdAdmin (gallery.js:75)', () => {
    it('does not filter on is_published', async () => {
      await fetchAlbumByIdAdmin('a');
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('eq')).toEqual(['id', 'a']);
    });
    it('null for an empty id, no query; an error on failure', async () => {
      expect(await fetchAlbumByIdAdmin('')).toEqual({ ok: true, data: null });
      expect(mock.queries).toHaveLength(0);
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await fetchAlbumByIdAdmin('a')).toEqual(failure('unknown', 'boom'));
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
    it('[] for an empty id; an error — not [] — on failure', async () => {
      expect(await fetchPhotos('')).toEqual({ ok: true, data: [] });
      mock.results.gallery_photos = [{ data: null, error: ERR }];
      expect(await fetchPhotos('alb')).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[gallery] fetchPhotos:', 'boom');
    });
  });

  describe('fetchAvailableYears (gallery.js:93)', () => {
    it('selects year, published only, distinct + descending', async () => {
      mock.results.gallery_albums = [
        { data: [{ year: 2024 }, { year: 2026 }, { year: 2024 }, { year: 2025 }] },
      ];
      expect(await fetchAvailableYears()).toEqual({ ok: true, data: [2026, 2025, 2024] });
      expect(mock.chain()).toEqual(['select', 'eq']);
      expect(mock.args('select')).toEqual(['year']);
    });
    it('a failed read is an error, never an empty year wheel', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await fetchAvailableYears()).toEqual(failure('unknown', 'boom'));
    });
  });

  // S40 — Inicio's "Álbumes de galería" (js/pages/admin/dashboard.js:49-50).
  describe('countAlbums', () => {
    it('a head count of every album, drafts included', async () => {
      mock.results.gallery_albums = [{ data: null, count: 12 }];
      expect(await countAlbums()).toEqual({ ok: true, data: 12 });
      expect(mock.chain()).toEqual(['select']);
      expect(mock.args('select')).toEqual(['id', { count: 'exact', head: true }]);
    });

    it('staff-only: signed out it would count only the published ones, so it asks nothing', async () => {
      mock.session = SIGNED_OUT;
      expect(await countAlbums()).toEqual(NO_SESSION);
      expect(mock.queries).toHaveLength(0);
    });

    it('no count, or a dropped connection, is a failure — never 0', async () => {
      mock.results.gallery_albums = [{ data: null }, OFFLINE];
      expect(await countAlbums()).toEqual(failure('unknown', 'the response carried no count'));
      expect(await countAlbums()).toEqual(failure('network', 'TypeError: Failed to fetch'));
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
    it('returns the mapped error on failure, never the raw message', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await upsertAlbum({ title: 'T', year: 2026 })).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[gallery] upsertAlbum:', 'boom');
    });
    it('a duplicate slug is a conflict with its own copy', async () => {
      mock.results.gallery_albums = [
        {
          data: null,
          error: { message: 'duplicate key value violates unique constraint', code: '23505' },
          status: 409,
        },
      ];
      expect(await upsertAlbum({ title: 'T', year: 2026 })).toEqual({
        ok: false,
        error: {
          kind: 'conflict',
          message: 'Ya existe un registro con esos datos.',
          detail: '23505: duplicate key value violates unique constraint',
        },
      });
    });
    it('an update that matched no album (PGRST116) is not_found', async () => {
      mock.results.gallery_albums = [
        {
          data: null,
          error: {
            message: 'JSON object requested, multiple (or no) rows returned',
            code: 'PGRST116',
          },
          status: 406,
        },
      ];
      const res = await upsertAlbum({ id: 'gone', title: 'T', year: 2026 });
      expect(res.ok === false && res.error.kind).toBe('not_found');
    });
  });

  describe('deleteAlbum (gallery.js:115)', () => {
    it('removes every storage variant, then deletes the row (counted)', async () => {
      mock.results.gallery_photos = [{ data: [{ storage_path: 'alb/p1.jpg' }] }];
      mock.results.gallery_albums = [{ count: 1 }];
      const res = await deleteAlbum('alb');
      expect(res).toEqual({ ok: true, data: undefined });
      expect(mock.storage.calls[0]).toEqual({
        method: 'remove',
        args: [['alb/p1.jpg', 'alb/p1.webp', 'alb/p1-thumb.jpg']],
      });
      const del = mock.query(1);
      expect(del.table).toBe('gallery_albums');
      expect(del.calls.map((c) => c.method)).toEqual(['delete', 'eq']);
      expect(mock.args('delete', 1)).toEqual([{ count: 'exact' }]);
    });
    it('reports the row error', async () => {
      mock.results.gallery_albums = [{ data: null, error: ERR }];
      expect(await deleteAlbum('alb')).toEqual(failure('unknown', 'boom'));
    });
    it('a delete that matched no album is not_found, never a success (D-027)', async () => {
      mock.results.gallery_albums = [{ count: 0 }];
      expect(await deleteAlbum('alb')).toEqual(NOT_FOUND);
      expect(warn).toHaveBeenCalledWith('[gallery] deleteAlbum:', 'no row was affected');
    });
    it('aborts when the photo listing fails — its storage objects would be orphaned', async () => {
      mock.results.gallery_photos = [{ data: null, error: ERR }];
      expect(await deleteAlbum('alb')).toEqual(failure('unknown', 'boom'));
      expect(mock.queries.map((q) => q.table)).toEqual(['gallery_photos']);
      expect(mock.storage.calls).toHaveLength(0);
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

    it('a failed cover step is logged, but the saved photo is still a success', async () => {
      mock.results.gallery_photos = [
        { data: { id: 'p', webp_url: 'w' } },
        { data: null, count: 1 },
      ];
      mock.results.gallery_albums = [{ error: { message: 'cover boom' } }];
      expect(await uploadPhoto('alb', image)).toEqual({
        ok: true,
        data: { id: 'p', webp_url: 'w' },
      });
      expect(warn).toHaveBeenCalledWith('[gallery] uploadPhoto cover:', 'cover boom');
    });

    it('fails fast on a storage error and inserts nothing', async () => {
      mock.storage.uploadError = { message: 'bucket full' };
      expect(await uploadPhoto('alb', image)).toEqual(failure('unknown', 'bucket full'));
      expect(mock.queries).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith('[gallery] uploadPhoto storage:', 'bucket full');
    });

    it('maps a storage RLS refusal through the body statusCode', async () => {
      mock.storage.uploadError = {
        name: 'StorageApiError',
        message: 'new row violates row-level security policy',
        status: 400,
        statusCode: '403',
      };
      expect(await uploadPhoto('alb', image)).toEqual(
        failure('forbidden', '403: new row violates row-level security policy'),
      );
    });

    it('cleans up storage when the row insert fails', async () => {
      mock.results.gallery_photos = [{ data: null, error: ERR }];
      expect(await uploadPhoto('alb', image)).toEqual(failure('unknown', 'boom'));
      expect(mock.storage.calls.at(-1)?.method).toBe('remove');
    });

    it('rejects missing args without a network call', async () => {
      expect(await uploadPhoto('', image)).toEqual(invalidInput('Falta el álbum o la foto.'));
      expect(mock.storage.calls).toHaveLength(0);
    });
  });

  describe('deletePhoto / setAlbumCover / updatePhoto / reorderPhotos', () => {
    it('deletePhoto removes jpg/webp/thumb then the row (counted)', async () => {
      mock.results.gallery_photos = [{ count: 1 }];
      expect(await deletePhoto({ id: 'p', storage_path: 'alb/p.jpg' })).toEqual({
        ok: true,
        data: undefined,
      });
      expect(mock.storage.calls[0].args).toEqual([['alb/p.jpg', 'alb/p.webp', 'alb/p-thumb.jpg']]);
      expect(mock.query().table).toBe('gallery_photos');
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('delete')).toEqual([{ count: 'exact' }]);
    });
    it('deletePhoto: a delete that matched no photo is not_found (D-027)', async () => {
      mock.results.gallery_photos = [{ count: 0 }];
      expect(await deletePhoto({ id: 'p' })).toEqual(NOT_FOUND);
    });
    it('deletePhoto rejects a photo without id', async () => {
      expect(await deletePhoto({ id: '' })).toEqual(
        invalidInput('Falta la foto que quieres eliminar.'),
      );
      expect(mock.queries).toHaveLength(0);
    });
    it('setAlbumCover updates the two cover columns and must hit the album', async () => {
      mock.results.gallery_albums = [{ count: 1 }];
      expect(await setAlbumCover('alb', 'p', 'u')).toEqual({ ok: true, data: undefined });
      expect(mock.args('update')).toEqual([
        { cover_photo_id: 'p', cover_url: 'u' },
        { count: 'exact' },
      ]);
      expect(mock.args('eq')).toEqual(['id', 'alb']);
      mock.reset();
      mock.results.gallery_albums = [{ count: 0 }];
      expect(await setAlbumCover('gone', 'p', 'u')).toEqual(NOT_FOUND);
    });
    it('setAlbumCover maps an RLS refusal to forbidden', async () => {
      mock.results.gallery_albums = [RLS_DENIED];
      expect(await setAlbumCover('alb', 'p', 'u')).toEqual(
        failure('forbidden', '42501: new row violates row-level security policy'),
      );
    });
    it('updatePhoto returns the updated row', async () => {
      mock.results.gallery_photos = [{ data: { id: 'p', caption: 'c' } }];
      expect(await updatePhoto('p', { caption: 'c' })).toEqual({
        ok: true,
        data: { id: 'p', caption: 'c' },
      });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
    });
    it('reorderPhotos issues one scoped, counted update per id; first error wins', async () => {
      mock.results.gallery_photos = [
        { count: 1 },
        { error: { message: 'e2' } },
        { error: { message: 'e3' } },
      ];
      expect(await reorderPhotos('alb', ['a', 'b', 'c'])).toEqual(failure('unknown', 'e2'));
      expect(mock.queries).toHaveLength(3);
      expect(mock.query(1).calls.map((c) => c.args)).toEqual([
        [{ sort_order: 1 }, { count: 'exact' }],
        ['id', 'b'],
        ['album_id', 'alb'],
      ]);
      expect(warn).toHaveBeenCalledWith('[gallery] reorderPhotos:', 'e2');
      expect(warn).toHaveBeenCalledWith('[gallery] reorderPhotos:', 'e3');
    });
    it('reorderPhotos: an id that is no longer in the album is a failure', async () => {
      mock.results.gallery_photos = [{ count: 1 }, { count: 0 }];
      expect(await reorderPhotos('alb', ['a', 'b'])).toEqual(NOT_FOUND);
      expect(mock.queries).toHaveLength(2);
    });
    it('reorderPhotos succeeds when every update does', async () => {
      mock.results.gallery_photos = [{ count: 1 }];
      expect(await reorderPhotos('alb', ['a'])).toEqual({ ok: true, data: undefined });
    });
    it('reorderPhotos rejects a missing album without a query', async () => {
      expect(await reorderPhotos('', ['a'])).toEqual(invalidInput('Falta el álbum.'));
      expect(mock.queries).toHaveLength(0);
    });
  });

  describe('realtime under prerender (browser=false)', () => {
    it('subscribeAlbums / subscribePhotos open no channel', () => {
      subscribeAlbums(() => {})();
      subscribePhotos('alb', () => {})();
      expect(mock.channels).toHaveLength(0);
    });
  });

  // RLS: anon reads published albums and their photos (`galbums_public_read`,
  // `gphotos_public_read`); unpublished rows and every write need staff.
  const image = { main: blob(3), webp: blob(2), thumb: blob(1), width: 1, height: 1 };
  describeSessionGate(gallery, '[gallery]', {
    staffOnly: {
      'fetchAlbums includeUnpublished': () => fetchAlbums({ includeUnpublished: true }),
      'fetchAvailableYears includeUnpublished': () =>
        fetchAvailableYears({ includeUnpublished: true }),
      fetchAlbumByIdAdmin: () => fetchAlbumByIdAdmin('a'),
      upsertAlbum: () => upsertAlbum({ title: 'T', year: 2026 }),
      deleteAlbum: () => deleteAlbum('alb'),
      uploadPhoto: () => uploadPhoto('alb', image),
      deletePhoto: () => deletePhoto({ id: 'p', storage_path: 'alb/p.jpg' }),
      setAlbumCover: () => setAlbumCover('alb', 'p', 'u'),
      updatePhoto: () => updatePhoto('p', { caption: 'c' }),
      reorderPhotos: () => reorderPhotos('alb', ['a', 'b']),
      countAlbums: () => countAlbums(),
    },
    publicCalls: {
      fetchAlbums: () => fetchAlbums(),
      fetchAvailableYears: () => fetchAvailableYears(),
      fetchAlbumBy: () => fetchAlbumBy({ slug: 'x' }),
      fetchPhotos: () => fetchPhotos('alb'),
    },
    notRepoCalls: ['subscribeAlbums', 'subscribePhotos'],
  });
});
