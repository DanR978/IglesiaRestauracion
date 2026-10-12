// S22 — type-level contract: every repo function is typed against the
// generated Database Row/Insert types (never `any`), reads resolve to rows or
// safe empties, and writes resolve to WriteResult. These assertions are
// checked by `npm run check` (svelte-check covers tests/**).
import { describe, expectTypeOf, it } from 'vitest';
import type { Database } from '$lib/db/database.types';
import type { WriteResult } from '$lib/repos/types';
import * as events from '$lib/repos/events';
import * as gallery from '$lib/repos/gallery';
import * as discipleship from '$lib/repos/discipleship';
import * as registrations from '$lib/repos/registrations';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

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

  it('reads resolve to typed rows (list) or row | null (single)', () => {
    expectTypeOf(events.fetchUpcomingEvents).returns.resolves.toEqualTypeOf<Row<'events'>[]>();
    expectTypeOf(events.fetchEventById).returns.resolves.toEqualTypeOf<Row<'events'> | null>();
    expectTypeOf(events.fetchCalendarActivities).returns.resolves.items.toHaveProperty('cancelled');
    expectTypeOf(events.fetchEventsForCalendar).returns.resolves.items.toHaveProperty('starts_at');
    expectTypeOf(gallery.fetchAlbums).returns.resolves.toEqualTypeOf<Row<'gallery_albums'>[]>();
    expectTypeOf(
      gallery.fetchAlbumBy,
    ).returns.resolves.toEqualTypeOf<Row<'gallery_albums'> | null>();
    expectTypeOf(gallery.fetchPhotos).returns.resolves.toEqualTypeOf<Row<'gallery_photos'>[]>();
    expectTypeOf(gallery.fetchAvailableYears).returns.resolves.toEqualTypeOf<number[]>();
    expectTypeOf(discipleship.fetchPublicGroups).returns.resolves.toEqualTypeOf<
      Row<'discipleship_groups'>[]
    >();
    expectTypeOf(
      discipleship.fetchPublicGroupBy,
    ).returns.resolves.toEqualTypeOf<Row<'discipleship_groups'> | null>();
    expectTypeOf(registrations.fetchLiveEvents).returns.resolves.items.toHaveProperty(
      'gallery_albums',
    );
    expectTypeOf(registrations.fetchLiveEvents).returns.resolves.items.toHaveProperty(
      'registration_open',
    );
    expectTypeOf(
      registrations.fetchSpecialEventBy,
    ).returns.resolves.toEqualTypeOf<registrations.SpecialEventDetail | null>();
    expectTypeOf<registrations.SpecialEventDetail>().toMatchTypeOf<Row<'special_events'>>();
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
  });

  it('WriteResult narrows on ok', () => {
    const r = { ok: false, error: 'x' } as WriteResult<{ id: string }>;
    if (r.ok) expectTypeOf(r.data).toEqualTypeOf<{ id: string }>();
    else expectTypeOf(r.error).toEqualTypeOf<string>();
  });
});
