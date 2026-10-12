// S07 — the one date helper a golden fixture cannot pin: todayISO reads the
// real clock in the viewer's TZ (G-002: never bake "today" into a fixture).
import { describe, expect, it } from 'vitest';
import { isoDate, todayISO } from '$lib/date';

describe('todayISO', () => {
  it('is YYYY-MM-DD and agrees with isoDate(new Date()) in the local TZ', () => {
    const today = todayISO();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today).toBe(isoDate(new Date()));
  });
});
