// S22 golden parity for $lib/special-events (pure half of js/lib/special-events.js).
// Fixture captured from the legacy module with `now` pinned to
// 2026-08-24T18:00:00Z; the lifecycle formats in America/New_York explicitly,
// so the vectors are byte-identical under NY and Tokyo (G-002).
import { describe, expect, it } from 'vitest';
import { itGolden, type GoldenVector } from '$lib/test/golden';
import {
  LINGER_DAYS,
  PHASE_ICON,
  PHASE_LABEL,
  albumUrl,
  compareByPhaseThenDate,
  eventAlbum,
  eventEndsAt,
  eventPhase,
  eventStartsAt,
  eventUrl,
  isPubliclyVisible,
  isRegistrationOpen,
  type AlbumRef,
  type EventRef,
  type EventWithAlbums,
  type LifecycleInput,
} from '$lib/special-events';
import fixtureJson from '../fixtures/special-events.json';

type Ev = LifecycleInput & { id: string; slug: string };
type Fixture = {
  LINGER_DAYS: number;
  PHASE_LABEL: unknown;
  PHASE_ICON: unknown;
  eventStartsAt: GoldenVector<Ev, string | null>[];
  eventEndsAt: GoldenVector<Ev | null, string | null>[];
  eventPhase: GoldenVector<[Ev, number], string>[];
  isPubliclyVisible: GoldenVector<[Ev, number], boolean>[];
  isRegistrationOpen: GoldenVector<LifecycleInput | null, boolean>[];
  eventAlbum: GoldenVector<EventWithAlbums | null, unknown>[];
  albumUrl: GoldenVector<AlbumRef, string>[];
  eventUrl: GoldenVector<EventRef, string>[];
  fetchLiveEvents: GoldenVector<{ rows: Ev[]; now: number; limit: number }, string[]>[];
};

const fx = fixtureJson as unknown as Fixture;
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

describe('special-events golden (legacy js/lib/special-events.js)', () => {
  it('constants are byte-identical', () => {
    expect(LINGER_DAYS).toBe(fx.LINGER_DAYS);
    expect(PHASE_LABEL).toEqual(fx.PHASE_LABEL);
    expect(PHASE_ICON).toEqual(fx.PHASE_ICON);
  });

  itGolden('eventStartsAt', fx.eventStartsAt, (ev) => iso(eventStartsAt(ev)));
  itGolden('eventEndsAt', fx.eventEndsAt, (ev) => iso(eventEndsAt(ev)));
  itGolden('eventPhase', fx.eventPhase, ([ev, now]) => eventPhase(ev, now));
  itGolden('isPubliclyVisible', fx.isPubliclyVisible, ([ev, now]) => isPubliclyVisible(ev, now));
  itGolden('isRegistrationOpen', fx.isRegistrationOpen, (ev) => isRegistrationOpen(ev));
  itGolden('eventAlbum', fx.eventAlbum, (ev) => eventAlbum(ev));
  itGolden('albumUrl', fx.albumUrl, (a) => albumUrl(a));
  itGolden('eventUrl', fx.eventUrl, (ev) => eventUrl(ev));

  // The pure pipeline the repo applies after the query: visibility filter →
  // phase/date sort → limit. (The same vectors also run through the mocked
  // repo in tests/unit/repos/registrations.test.ts.)
  itGolden('visible → sorted → limited', fx.fetchLiveEvents, ({ rows, now, limit }) =>
    rows
      .filter((ev) => isPubliclyVisible(ev, now))
      .sort(compareByPhaseThenDate(now))
      .slice(0, limit)
      .map((ev) => ev.id),
  );
});
