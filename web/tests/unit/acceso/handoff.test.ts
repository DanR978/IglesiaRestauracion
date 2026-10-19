// S39 — the email one acceso page hands the next: carried to recuperar/ and
// back in memory (WCAG 3.3.7), never the URL. (The sign-in notice is
// #lib/auth/notice.ts — tests/unit/auth/notice.test.ts.)
import { describe, expect, it } from 'vitest';
import { carriedEmail, carryEmail } from '#lib/components/admin/auth/handoff.js';

describe('the carried email', () => {
  it('is kept trimmed, in memory', () => {
    carryEmail('  ana@example.org ');
    expect(carriedEmail()).toBe('ana@example.org');
  });

  it('can be emptied', () => {
    carryEmail('ana@example.org');
    carryEmail('');
    expect(carriedEmail()).toBe('');
  });
});
