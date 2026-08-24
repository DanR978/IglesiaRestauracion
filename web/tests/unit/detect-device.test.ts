// S07 — detect-device is UA-environment-dependent, so no golden fixture;
// assert the invariants that hold in any environment (jsdom reports desktop).
import { describe, expect, it } from 'vitest';
import { getPlatform, isAndroid, isDesktop, isIOS } from '$lib/detect-device';

describe('detect-device', () => {
  it('classifies jsdom as desktop', () => {
    expect(isIOS()).toBe(false);
    expect(isAndroid()).toBe(false);
    expect(isDesktop()).toBe(true);
    expect(getPlatform()).toBe('desktop');
  });

  it('keeps the platform partition consistent', () => {
    expect(isDesktop()).toBe(!isIOS() && !isAndroid());
    expect(['ios', 'android', 'desktop']).toContain(getPlatform());
  });
});
