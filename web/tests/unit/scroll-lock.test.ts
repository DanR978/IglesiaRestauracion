// S21 — the reference-counted body scroll lock. This is the fix for the legacy
// behaviour where every opener set body.style.overflow independently and cleared
// it to '' on close, so a confirm nested in a modal unlocked the page under it
// (DESIGN-SYSTEM §4.2 / PORT-DEBT S16).
import { afterEach, describe, expect, it } from 'vitest';
import { bodyScrollLockDepth, lockBodyScroll } from '$lib/scroll-lock';

const overflow = () => document.body.style.overflow;

afterEach(() => {
  // Nothing should leak between cases.
  expect(bodyScrollLockDepth()).toBe(0);
  document.body.style.overflow = '';
});

describe('lockBodyScroll', () => {
  it('locks on the first call and restores the PREVIOUS value on release', () => {
    document.body.style.overflow = 'auto';
    const release = lockBodyScroll();
    expect(overflow()).toBe('hidden');
    release();
    expect(overflow()).toBe('auto');
  });

  it('restores an originally empty overflow to empty', () => {
    const release = lockBodyScroll();
    expect(overflow()).toBe('hidden');
    release();
    expect(overflow()).toBe('');
  });

  it('stays locked while a nested overlay closes (the confirm-over-modal case)', () => {
    document.body.style.overflow = 'auto';
    const modal = lockBodyScroll();
    const confirm = lockBodyScroll();
    expect(bodyScrollLockDepth()).toBe(2);

    confirm();
    expect(overflow()).toBe('hidden'); // the modal is still open
    expect(bodyScrollLockDepth()).toBe(1);

    modal();
    expect(overflow()).toBe('auto');
  });

  it('ignores a double release rather than unbalancing the counter', () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    a();
    a();
    expect(bodyScrollLockDepth()).toBe(1);
    expect(overflow()).toBe('hidden');
    b();
    expect(bodyScrollLockDepth()).toBe(0);
  });

  it('releases out of order without stranding the lock', () => {
    const first = lockBodyScroll();
    const second = lockBodyScroll();
    first();
    expect(overflow()).toBe('hidden');
    second();
    expect(overflow()).toBe('');
  });
});
