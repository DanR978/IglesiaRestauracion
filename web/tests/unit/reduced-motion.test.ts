// S12 — reduced-motion.ts against a matchMedia mock. The module memoises its
// MediaQuery, so every case gets a fresh module via vi.resetModules().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (ev: { matches: boolean }) => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_type: string, fn: Listener) => listeners.add(fn)),
    removeEventListener: vi.fn((_type: string, fn: Listener) => listeners.delete(fn)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    set(next: boolean) {
      mql.matches = next;
      for (const fn of listeners) fn({ matches: next });
    },
  };
  const matchMedia = vi.fn().mockReturnValue(mql);
  vi.stubGlobal('matchMedia', matchMedia);
  return { mql, matchMedia };
}

async function load() {
  return import('$lib/reduced-motion');
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reduced-motion — SSR / no matchMedia posture', () => {
  it('reports false and never throws when matchMedia is missing (jsdom default)', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const { prefersReducedMotion, motionMs } = await load();
    expect(prefersReducedMotion.current).toBe(false);
    expect(motionMs(240)).toBe(240);
  });

  it('does not touch matchMedia at import time (lazy)', async () => {
    const { matchMedia } = mockMatchMedia(true);
    await load();
    expect(matchMedia).not.toHaveBeenCalled();
  });
});

describe('reduced-motion — with matchMedia', () => {
  it('asks for the reduce query and reflects a "reduce" preference', async () => {
    const { matchMedia } = mockMatchMedia(true);
    const { prefersReducedMotion, REDUCED_MOTION_QUERY } = await load();
    expect(prefersReducedMotion.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
  });

  it('reflects "no-preference"', async () => {
    mockMatchMedia(false);
    const { prefersReducedMotion } = await load();
    expect(prefersReducedMotion.current).toBe(false);
  });

  it('tracks a change of the OS setting', async () => {
    const { mql } = mockMatchMedia(false);
    const { prefersReducedMotion } = await load();
    expect(prefersReducedMotion.current).toBe(false);
    mql.set(true);
    expect(prefersReducedMotion.current).toBe(true);
    mql.set(false);
    expect(prefersReducedMotion.current).toBe(false);
  });

  it('memoises the MediaQuery (one matchMedia call across reads)', async () => {
    const { matchMedia } = mockMatchMedia(false);
    const { prefersReducedMotion } = await load();
    void prefersReducedMotion.current;
    void prefersReducedMotion.current;
    void prefersReducedMotion.current;
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });

  it('motionMs() collapses a duration to 0 only under reduce', async () => {
    const { mql } = mockMatchMedia(true);
    const { motionMs } = await load();
    expect(motionMs(220)).toBe(0);
    expect(motionMs(0)).toBe(0);
    mql.set(false);
    expect(motionMs(220)).toBe(220);
  });
});
