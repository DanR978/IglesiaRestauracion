// S22 golden parity for $lib/discipleship (pure half of js/lib/discipleship.js).
// Fixture captured by running the LEGACY module under TZ=America/New_York and
// Asia/Tokyo — byte-identical in both, so it holds under any machine TZ.
// displayStatus vectors use years 2000/2999 so "today" never crosses them.
import { describe, expect, it } from 'vitest';
import { itGolden, type GoldenVector } from '$lib/test/golden';
import {
  AGE_LABEL,
  DISPLAY_STATUS_LABEL,
  GENDERS,
  LEVELS,
  PUBLIC_BASE,
  STATUS_LABEL,
  WEEKDAYS,
  displayStatus,
  formatDateRange,
  formatPhone,
  formatSchedule,
  formatTime,
  groupPublicUrl,
  levelMeta,
  spotsRemaining,
  type DateRangeInput,
  type GroupRef,
  type GroupStatusInput,
  type ScheduleInput,
} from '$lib/discipleship';
import fixtureJson from '../fixtures/discipleship.json';

type Fixture = {
  LEVELS: unknown;
  WEEKDAYS: unknown;
  STATUS_LABEL: unknown;
  GENDERS: unknown;
  AGE_LABEL: unknown;
  DISPLAY_STATUS_LABEL: unknown;
  PUBLIC_BASE: string;
  displayStatus: GoldenVector<GroupStatusInput | null, string>[];
  spotsRemaining: GoldenVector<GroupStatusInput | null, number | null>[];
  formatTime: GoldenVector<string, string>[];
  formatSchedule: GoldenVector<ScheduleInput | null, string>[];
  formatDateRange: GoldenVector<DateRangeInput | null, string>[];
  levelMeta: GoldenVector<number | string | null, unknown>[];
  formatPhone: GoldenVector<string | null, string>[];
  groupPublicUrl: GoldenVector<[GroupRef, string?], string>[];
};

const fx = fixtureJson as unknown as Fixture;

describe('discipleship golden (legacy js/lib/discipleship.js)', () => {
  it('vocabularies are byte-identical', () => {
    expect(LEVELS).toEqual(fx.LEVELS);
    expect(WEEKDAYS).toEqual(fx.WEEKDAYS);
    expect(STATUS_LABEL).toEqual(fx.STATUS_LABEL);
    expect(GENDERS).toEqual(fx.GENDERS);
    expect(AGE_LABEL).toEqual(fx.AGE_LABEL);
    expect(DISPLAY_STATUS_LABEL).toEqual(fx.DISPLAY_STATUS_LABEL);
    expect(PUBLIC_BASE).toBe(fx.PUBLIC_BASE);
  });

  itGolden('displayStatus', fx.displayStatus, (g) => displayStatus(g));
  itGolden('spotsRemaining', fx.spotsRemaining, (g) => spotsRemaining(g));
  itGolden('formatTime', fx.formatTime, (t) => formatTime(t));
  itGolden('formatSchedule', fx.formatSchedule, (g) => formatSchedule(g));
  itGolden('formatDateRange', fx.formatDateRange, (g) => formatDateRange(g));
  itGolden('levelMeta', fx.levelMeta, (n) => levelMeta(n));
  itGolden('formatPhone', fx.formatPhone, (p) => formatPhone(p));
  itGolden('groupPublicUrl', fx.groupPublicUrl, ([g, origin]) => groupPublicUrl(g, origin));

  it('displayStatus honours an explicit today (prerender pin)', () => {
    const g = { status: 'open', starts_on: '2026-08-24', capacity: 5, member_count: 1 };
    expect(displayStatus(g, '2026-08-24')).toBe('open');
    expect(displayStatus(g, '2026-08-25')).toBe('in_progress');
  });
});
