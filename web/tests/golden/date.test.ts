// S07 golden parity for $lib/date (port of js/utils/date.js).
// G-002: isoDate vectors are LOCAL calendar parts ([y, mIndex, d, hh, mm])
// constructed and read back in the same local TZ, so they hold under any
// machine timezone (the generator verified NY vs Tokyo byte-identical).
// todayISO is clock-dependent → covered in tests/unit/date.test.ts, not here.
import { describe } from 'vitest';
import { itGolden, type GoldenVector } from '$lib/test/golden';
import { isoDate, pad2, ymd } from '$lib/date';
import fixtureJson from '../fixtures/date.json';

type Fixture = {
  pad2: GoldenVector<number | string, string>[];
  ymd: GoldenVector<[number, number, number], string>[];
  isoDate: GoldenVector<[number, number, number, number, number], string>[];
};

const fx = fixtureJson as unknown as Fixture;

describe('date golden (legacy js/utils/date.js)', () => {
  itGolden('pad2', fx.pad2, (input) => pad2(input));
  itGolden('ymd', fx.ymd, ([y, m, d]) => ymd(y, m, d));
  itGolden('isoDate', fx.isoDate, ([y, m, d, hh, mm]) => isoDate(new Date(y, m, d, hh, mm)));
});
