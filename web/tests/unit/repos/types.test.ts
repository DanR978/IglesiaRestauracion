// S22 — type-level contract: every repo function is typed against the
// generated Database Row/Insert types (never `any`). S22b (ADR-0004) — reads
// resolve to ReadResult, writes to WriteResult, and the failure branch carries
// a RepoError, never a raw string. These assertions are checked by
// `npm run check` (svelte-check covers tests/**).
import { describe, expectTypeOf, it } from 'vitest';
import type { Database } from '#lib/db/database.types.js';
import type { ReadResult, RepoError, RepoErrorKind, WriteResult } from '#lib/repos/types.js';
import * as events from '#lib/repos/events.js';
import * as gallery from '#lib/repos/gallery.js';
import * as discipleship from '#lib/repos/discipleship.js';
import * as registrations from '#lib/repos/registrations.js';
import * as receipts from '#lib/repos/receipts.js';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
/** What a repo function resolves to on success. */
type OkData<F extends (...args: never[]) => Promise<unknown>> = Extract<
  Awaited<ReturnType<F>>,
  { ok: true }
>['data'];

describe('repo types', () => {
  it('row aliases are the generated Row types', () => {
    expectTypeOf<events.EventRow>().toEqualTypeOf<Row<'events'>>();
    expectTypeOf<events.CalendarEventRow>().toEqualTypeOf<Row<'calendar_events'>>();
    expectTypeOf<gallery.GalleryAlbum>().toEqualTypeOf<Row<'gallery_albums'>>();
    expectTypeOf<gallery.GalleryPhoto>().toEqualTypeOf<Row<'gallery_photos'>>();
    expectTypeOf<discipleship.DiscipleshipGroup>().toEqualTypeOf<Row<'discipleship_groups'>>();
    expectTypeOf<discipleship.DiscipleshipInterest>().toEqualTypeOf<
      Row<'discipleship_interests'>
    >();
    expectTypeOf<discipleship.DiscipleshipMember>().toEqualTypeOf<Row<'discipleship_members'>>();
    expectTypeOf<discipleship.DiscipleshipMessage>().toEqualTypeOf<Row<'discipleship_messages'>>();
    expectTypeOf<registrations.SpecialEventRow>().toEqualTypeOf<Row<'special_events'>>();
    expectTypeOf<registrations.EventRegistrationInsert>().toEqualTypeOf<
      Insert<'event_registrations'>
    >();
  });

  it('the result types are exactly the ADR-0004 unions', () => {
    expectTypeOf<RepoErrorKind>().toEqualTypeOf<
      'network' | 'auth' | 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'unknown'
    >();
    expectTypeOf<RepoError>().toEqualTypeOf<{
      kind: RepoErrorKind;
      message: string;
      detail?: string;
    }>();
    expectTypeOf<ReadResult<number>>().toEqualTypeOf<
      { ok: true; data: number } | { ok: false; error: RepoError }
    >();
    expectTypeOf<WriteResult>().toEqualTypeOf<
      { ok: true; data: undefined } | { ok: false; error: RepoError }
    >();
  });

  it('reads resolve to a ReadResult of typed rows (list) or row | null (single)', () => {
    expectTypeOf(events.fetchUpcomingEvents).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'events'>[]>
    >();
    expectTypeOf(events.fetchEventById).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'events'> | null>
    >();
    expectTypeOf<OkData<typeof events.fetchCalendarActivities>>().items.toHaveProperty('cancelled');
    expectTypeOf<OkData<typeof events.fetchEventsForCalendar>>().items.toHaveProperty('starts_at');
    expectTypeOf(gallery.fetchAlbums).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'gallery_albums'>[]>
    >();
    expectTypeOf(gallery.fetchAlbumBy).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'gallery_albums'> | null>
    >();
    expectTypeOf(gallery.fetchPhotos).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'gallery_photos'>[]>
    >();
    expectTypeOf(gallery.fetchAvailableYears).returns.resolves.toEqualTypeOf<
      ReadResult<number[]>
    >();
    expectTypeOf(discipleship.fetchPublicGroups).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'discipleship_groups'>[]>
    >();
    expectTypeOf(discipleship.fetchPublicGroupBy).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'discipleship_groups'> | null>
    >();
    expectTypeOf<OkData<typeof registrations.fetchLiveEvents>>().items.toHaveProperty(
      'gallery_albums',
    );
    expectTypeOf<OkData<typeof registrations.fetchLiveEvents>>().items.toHaveProperty(
      'registration_open',
    );
    expectTypeOf(registrations.fetchSpecialEventBy).returns.resolves.toEqualTypeOf<
      ReadResult<registrations.SpecialEventDetail | null>
    >();
    expectTypeOf<registrations.SpecialEventDetail>().toMatchTypeOf<Row<'special_events'>>();
    expectTypeOf(receipts.listReceipts).returns.resolves.toEqualTypeOf<
      ReadResult<receipts.FinReceipt[]>
    >();
    expectTypeOf(receipts.downloadReceipt).returns.resolves.toEqualTypeOf<ReadResult<Blob>>();
  });

  it('writes resolve to WriteResult', () => {
    expectTypeOf(gallery.deleteAlbum).returns.resolves.toEqualTypeOf<WriteResult>();
    expectTypeOf(gallery.upsertAlbum).returns.resolves.toEqualTypeOf<
      WriteResult<Row<'gallery_albums'>>
    >();
    expectTypeOf(discipleship.submitInterest).returns.resolves.toEqualTypeOf<
      WriteResult<Insert<'discipleship_interests'>>
    >();
    expectTypeOf(discipleship.deleteGroup).returns.resolves.toEqualTypeOf<WriteResult>();
    expectTypeOf(registrations.submitRegistrations).returns.resolves.toEqualTypeOf<WriteResult>();
    expectTypeOf(registrations.submitRegistrations)
      .parameter(0)
      .toEqualTypeOf<Insert<'event_registrations'>[]>();
    expectTypeOf(receipts.deleteReceipt).returns.resolves.toEqualTypeOf<WriteResult>();
  });

  it('a result narrows on ok, and its error is a RepoError — never a raw string', () => {
    const r = { ok: false, error: { kind: 'network', message: 'x' } } as WriteResult<{
      id: string;
    }>;
    if (r.ok) {
      expectTypeOf(r.data).toEqualTypeOf<{ id: string }>();
    } else {
      expectTypeOf(r.error).toEqualTypeOf<RepoError>();
      expectTypeOf(r.error).not.toEqualTypeOf<string>();
      expectTypeOf(r.error.kind).toEqualTypeOf<RepoErrorKind>();
      expectTypeOf(r.error.message).toEqualTypeOf<string>();
      expectTypeOf(r.error.detail).toEqualTypeOf<string | undefined>();
    }
  });
});
