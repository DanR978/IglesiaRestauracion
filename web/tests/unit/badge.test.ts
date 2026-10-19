// PR-C2 — the Badge contract's pure helpers: the colour gate that is the ONLY
// way a record's colour reaches a Badge, and the staff-role vocabulary.
import { describe, expect, it } from 'vitest';
import {
  BADGE_ROLES,
  ROLE_BADGES,
  badgeTint,
  isBadgeRole,
  roleModifier,
} from '#lib/components/badge.js';

describe('badgeTint — the only gate between a record colour and a style', () => {
  it('normalises #rgb / #rrggbb in any case, ignoring surrounding space', () => {
    expect(badgeTint('#3B82F6')).toBe('#3b82f6');
    expect(badgeTint('  #475569 ')).toBe('#475569');
    expect(badgeTint('#0a8')).toBe('#00aa88');
    expect(badgeTint('#FFF')).toBe('#ffffff');
    // Only the normalised value is returned, so trimmed whitespace never reaches the style.
    expect(badgeTint('#fff\n')).toBe('#ffffff');
  });

  it('refuses everything else', () => {
    for (const bad of [
      '',
      '#',
      '#12',
      '#1234',
      '#12345',
      '#1234567',
      '#12345678',
      '#ggg',
      '475569',
      'red',
      'rgb(0, 0, 0)',
      'var(--color-dark)',
      'url(https://evil.example/x.png)',
      '#fff; background:url(x)',
      '#fff;',
      '# fff',
      'expression(alert(1))',
      null,
      undefined,
      0x475569,
      {},
    ]) {
      expect(badgeTint(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('the role vocabulary', () => {
  it('knows exactly the three roles profiles.role allows', () => {
    expect([...BADGE_ROLES].sort()).toEqual(['admin', 'ministry_leader', 'treasurer']);
    expect(isBadgeRole('admin')).toBe(true);
    for (const bad of ['pastor', 'Admin', '', null, undefined, 1]) {
      expect(isBadgeRole(bad), String(bad)).toBe(false);
    }
  });

  it('gives each role its own Spanish label and glyph', () => {
    const labels = BADGE_ROLES.map((r) => ROLE_BADGES[r].label);
    const icons = BADGE_ROLES.map((r) => ROLE_BADGES[r].icon);
    expect(new Set(labels).size).toBe(3);
    expect(new Set(icons).size).toBe(3);
    expect(ROLE_BADGES.ministry_leader.label).toBe('Líder de ministerio');
  });

  it('kebab-cases the class modifier', () => {
    expect(roleModifier('ministry_leader')).toBe('ministry-leader');
    expect(roleModifier('admin')).toBe('admin');
  });
});
