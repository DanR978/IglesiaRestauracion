// PR-C2 — #lib/initials: the one monogram algorithm every Avatar uses. The
// golden suite proves parity with the legacy lideres copy; this file states the
// rules in prose and pins the deliberate difference from the two admin copies
// (account.js / users.js) it retires.
import { describe, expect, it } from 'vitest';
import { initials } from '#lib/initials.js';

describe('initials — the rules', () => {
  it('takes the first letters of the first and last words', () => {
    expect(initials('Juan Carlos Pérez López')).toBe('JL');
    expect(initials('María')).toBe('M');
  });

  it('skips leading titles only, so a title-like surname stays', () => {
    expect(initials('Pastor Raúl García Guerra')).toBe('RG');
    expect(initials('Dra. Elena Soto')).toBe('ES');
    expect(initials('Ana Pastor')).toBe('AP');
    expect(initials('Pastor')).toBe('P');
  });

  it('ignores words without a letter, and never splits a character', () => {
    expect(initials('🙏 Flor Alfaro 🙏')).toBe('FA');
    expect(initials('Álvaro Gómez')).toBe('ÁG');
    expect(initials('Álvaro Gómez')).toHaveLength(2);
  });

  it("returns '' when there is nothing to show, so the caller can fall back", () => {
    for (const empty of ['', '   ', '123', '🙏🙏', null, undefined]) {
      expect(initials(empty), String(empty)).toBe('');
    }
  });
});

describe('initials — approved difference from the legacy admin copies', () => {
  // account.js / users.js: (name || '?').split(' ').map(w => w[0]).join('')
  // .toUpperCase().slice(0, 2) || '?' — first TWO words, and a literal '?'.
  it('uses the last word, not the second ("Juan Carlos Pérez" was "JC")', () => {
    expect(initials('Juan Carlos Pérez')).toBe('JP');
  });

  it('never renders a "?" placeholder — an empty result is the fallback signal', () => {
    expect(initials('')).toBe('');
    expect(initials('?')).toBe('');
  });
});
