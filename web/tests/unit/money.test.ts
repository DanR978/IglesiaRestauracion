// Unit spec for S08 money.ts (D-003: integer cents; DB stays numeric dollars).
// The golden parity suite lives in tests/golden/money.test.ts; this file holds
// the hand-computed arithmetic contract (sumC exactness, rounding, round-trip)
// and the documented divergences from the legacy float path.
import { describe, expect, it } from 'vitest';
import { formatUSD, sumC, toCents, toNumeric } from '$lib/money';
import divergence from '../fixtures/money-usd-divergence.json';

describe('toCents — parsing', () => {
  it('parses dollars into integer cents', () => {
    expect(toCents('0')).toBe(0);
    expect(toCents('1')).toBe(100);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('.5')).toBe(50);
    expect(toCents('5.')).toBe(500);
    expect(toCents('007')).toBe(700);
    expect(toCents('123.45')).toBe(12345);
    expect(toCents('1,234.56')).toBe(123456);
    expect(toCents('$5')).toBe(500);
    expect(toCents('-$1,000.25')).toBe(-100025);
    expect(toCents('+2.50')).toBe(250);
    expect(toCents('  12.34  ')).toBe(1234);
  });

  it('parses numbers via their shortest decimal representation', () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(-1234.56)).toBe(-123456);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 → 30, not 31
    expect(toCents(1e-7)).toBe(0); // sub-cent dust
    expect(toCents(123456789012.34)).toBe(12345678901234);
  });

  it('normalizes negative zero to 0', () => {
    expect(Object.is(toCents(-0), 0)).toBe(true);
    expect(Object.is(toCents('-0.00'), 0)).toBe(true);
  });

  it('rounds half up at the cent, half away from zero, in exact decimal', () => {
    expect(toCents('1.005')).toBe(101);
    expect(toCents('1.0049')).toBe(100);
    expect(toCents('1.00499999')).toBe(100);
    expect(toCents('1.0050001')).toBe(101);
    expect(toCents('0.005')).toBe(1);
    expect(toCents('2.675')).toBe(268);
    expect(toCents('-1.005')).toBe(-101);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(2.675)).toBe(268);
    expect(toCents(10.075)).toBe(1008);
  });

  it('throws on non-numeric input (documented: no silent zeroes in a ledger)', () => {
    for (const bad of ['abc', '', '   ', '.', '$', '1.2.3', '10,00', '1e5', '--5']) {
      expect(() => toCents(bad), JSON.stringify(bad)).toThrow(TypeError);
    }
    expect(() => toCents(NaN)).toThrow(TypeError);
    expect(() => toCents(Infinity)).toThrow(TypeError);
  });

  it('throws RangeError beyond exact integer cents', () => {
    expect(() => toCents(1e21)).toThrow(RangeError);
    expect(() => toCents('99999999999999999999')).toThrow(RangeError);
  });
});

describe('sumC — exact integer sums (hand-computed)', () => {
  it('matches hand-computed totals exactly', () => {
    expect(sumC()).toBe(0);
    expect(sumC(1, 2, 3)).toBe(6);
    expect(sumC(100, -250)).toBe(-150);
    expect(sumC(999999999, 1)).toBe(1000000000);
    // ledger-style: 10.99 + 25.00 + 333.33 − 12.50 + 0.07 = 356.89
    expect(sumC(1099, 2500, 33333, -1250, 7)).toBe(35689);
  });

  it('rejects non-integer cent amounts', () => {
    expect(() => sumC(1, 0.5)).toThrow(TypeError);
    expect(() => sumC(NaN)).toThrow(TypeError);
    expect(() => sumC(1, Number.MAX_SAFE_INTEGER + 2)).toThrow(TypeError);
  });
});

describe('float trap — why the app computes in cents (D-003)', () => {
  it('naive float dollars drift; the cents path is exact', () => {
    // The legacy treasury summed dollars as floats:
    expect(0.1 + 0.2).not.toBe(0.3);
    expect((0.1 + 0.2) * 100).not.toBe(30); // 30.000000000000004
    // The cents path gives exactly 30 with no rounding step anywhere:
    const cents = sumC(toCents('0.10'), toCents('0.20'));
    expect(cents).toBe(30);
    expect(formatUSD(cents)).toBe('$0.30');
  });

  it('drift compounds over a ledger; cents stay exact', () => {
    let floats = 0;
    let cents = 0;
    for (let i = 0; i < 1000; i++) {
      floats += 0.1; // legacy-style dollars accumulation
      cents = sumC(cents, toCents('0.10'));
    }
    expect(floats).not.toBe(100); // 99.9999999999986
    expect(cents).toBe(10000);
    expect(formatUSD(cents)).toBe('$100.00');
    expect(toNumeric(cents)).toBe(100);
  });
});

describe('toNumeric — cents → dollars for DB writes', () => {
  it('converts to the exact 2-decimal dollars value', () => {
    expect(toNumeric(123456)).toBe(1234.56);
    expect(toNumeric(0)).toBe(0);
    expect(toNumeric(1)).toBe(0.01);
    expect(toNumeric(-101)).toBe(-1.01);
  });

  it('round-trips: toCents(toNumeric(c)) === c', () => {
    for (const c of [0, 1, 29, 58, 101, 2675, 123456, 12345678901234, -333, -100025]) {
      expect(toCents(toNumeric(c))).toBe(c);
    }
  });

  it('rejects non-integer cents', () => {
    expect(() => toNumeric(1.5)).toThrow(TypeError);
    expect(() => toNumeric(NaN)).toThrow(TypeError);
  });
});

describe('formatUSD — display formatting', () => {
  it('formats integer cents as USD', () => {
    expect(formatUSD(0)).toBe('$0.00');
    expect(formatUSD(30)).toBe('$0.30');
    expect(formatUSD(123456)).toBe('$1,234.56');
    expect(formatUSD(-50)).toBe('-$0.50');
  });
});

// The ONLY inputs where the cents path is allowed to differ from legacy:
// strings carrying more precision than a double. Legacy Number() collapses
// them to the nearest double (whose shortest representation then rounds UP);
// exact decimal parsing keeps them below the midpoint. Approved under D-003 —
// fixture `expected` is the legacy output, captured by running the legacy
// module; the new outputs here are hand-computed exact-decimal half-up.
describe('approved D-003 divergence: over-precise strings', () => {
  const newExpected: Record<string, string> = {
    '1.004999999999999999999': '$1.00',
    '2.674999999999999999999': '$2.67',
  };

  for (const v of divergence) {
    it(`${v.input}: legacy ${v.expected} → cents-path ${newExpected[v.input]}`, () => {
      const out = formatUSD(toCents(v.input));
      expect(out).toBe(newExpected[v.input]);
      expect(out).not.toBe(v.expected); // the divergence is real and intended
    });
  }
});
