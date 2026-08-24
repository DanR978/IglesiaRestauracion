// S22 golden parity for $lib/gallery + $lib/slug (pure half of js/lib/gallery.js).
// Fixture captured from the legacy module; TZ-independent (local-date split).
import { describe, expect, it } from 'vitest';
import { itGolden, type GoldenVector } from '$lib/test/golden';
import {
  BUCKET,
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  albumPublicUrl,
  formatEventDate,
  type AlbumRef,
} from '$lib/gallery';
import { slugify } from '$lib/slug';
import fixtureJson from '../fixtures/gallery.json';

type Fixture = {
  EVENT_TYPES: unknown;
  EVENT_TYPE_LABEL: unknown;
  BUCKET: string;
  slugify: GoldenVector<unknown, string>[];
  albumPublicUrl: GoldenVector<[AlbumRef, string?], string>[];
  formatEventDate: GoldenVector<string | null, string>[];
};

const fx = fixtureJson as unknown as Fixture;

describe('gallery golden (legacy js/lib/gallery.js)', () => {
  it('vocabularies are byte-identical', () => {
    expect(EVENT_TYPES).toEqual(fx.EVENT_TYPES);
    expect(EVENT_TYPE_LABEL).toEqual(fx.EVENT_TYPE_LABEL);
    expect(BUCKET).toBe(fx.BUCKET);
  });

  // The capture encodes `undefined` as the sentinel string (JSON has no undefined).
  itGolden('slugify', fx.slugify, (s) => slugify(s === '__undefined__' ? undefined : s));
  itGolden('albumPublicUrl', fx.albumPublicUrl, ([a, origin]) => albumPublicUrl(a, origin));
  itGolden('formatEventDate', fx.formatEventDate, (d) => formatEventDate(d));
});
