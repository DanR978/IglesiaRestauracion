// S41 — #lib/activity-format beyond the golden: the phrase map covers every
// table the database audits (read from the migrations and admin-invite, so a
// new audit trigger without a phrase fails here, not on a volunteer's
// screen), lookups never reach Object.prototype, and timeAgo / formatActivity
// default to the real clock.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_ACTOR_FALLBACK,
  ACTIVITY_ENTITIES,
  ACTIVITY_ENTITY_FALLBACK,
  ACTIVITY_VERB_FALLBACK,
  formatActivity,
  timeAgo,
  type ActivityRow,
} from '#lib/activity-format.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Tables with a row trigger that writes audit_log: audit_capture() (the
 * baseline and later migrations) and audit_access_change() (PR-B). Both the
 * quoted dump style and the hand-written style, WHEN clauses included.
 */
function auditedByTriggers(): Set<string> {
  const dir = path.join(REPO, 'supabase', 'migrations');
  const trigger =
    /create\s+(?:or\s+replace\s+)?trigger\s+[\w"]+\s+after\s[^;]*?\bon\s+(?:"?public"?\.)?"?(\w+)"?[^;]*?execute\s+function\s+(?:"?public"?\.)?"?(?:audit_capture|audit_access_change)"?\s*\(/gi;
  const tables = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    for (const match of readFileSync(path.join(dir, file), 'utf8').matchAll(trigger)) {
      tables.add(match[1]);
    }
  }
  return tables;
}

/** The entities admin-invite writes its own audit rows for (lib.ts AUDIT_SHAPE). */
function auditedByAdminInvite(): Set<string> {
  const lib = readFileSync(
    path.join(REPO, 'supabase', 'functions', 'admin-invite', 'lib.ts'),
    'utf8',
  );
  const shape = lib.slice(
    lib.indexOf('const AUDIT_SHAPE'),
    lib.indexOf('};', lib.indexOf('const AUDIT_SHAPE')),
  );
  return new Set([...shape.matchAll(/entity:\s*"(\w+)"/g)].map((m) => m[1]));
}

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  actor_name: 'Ana Pérez',
  action: 'INSERT',
  entity: 'calendar_events',
  label: 'Culto dominical',
  created_at: '2026-10-19T13:55:00.000Z',
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('activity-format — every audited table reads as something', () => {
  it('finds the audited tables (the parse is not silently empty)', () => {
    const tables = auditedByTriggers();
    for (const known of [
      'calendar_events',
      'fin_expenses',
      'leader_members',
      'profiles',
      'role_presets',
    ]) {
      expect(tables, known).toContain(known);
    }
    expect(auditedByAdminInvite()).toEqual(new Set(['invitations', 'profiles', 'role_presets']));
  });

  it('has a phrase for each of them', () => {
    const missing = [...auditedByTriggers(), ...auditedByAdminInvite()].filter(
      (table) => !Object.hasOwn(ACTIVITY_ENTITIES, table),
    );
    expect(missing).toEqual([]);
  });

  it('never falls through to Object.prototype', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const line = formatActivity(row({ action: key, entity: key }));
      expect(line.verb).toBe(ACTIVITY_VERB_FALLBACK);
      expect(line.what).toBe(ACTIVITY_ENTITY_FALLBACK);
    }
  });
});

describe('formatActivity', () => {
  it('splits a row into who / verb / what / label / when', () => {
    expect(formatActivity(row(), Date.parse('2026-10-19T14:00:00Z'))).toEqual({
      who: 'Ana Pérez',
      verb: 'creó',
      what: 'un evento',
      label: 'Culto dominical',
      when: 'hace 5 min',
    });
  });

  it('falls back for a missing actor and treats an empty label as none', () => {
    const line = formatActivity(row({ actor_name: null, label: '' }));
    expect(line.who).toBe(ACTIVITY_ACTOR_FALLBACK);
    expect(line.label).toBeNull();
  });

  it('measures from the real clock by default', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T15:00:00Z'));
    expect(formatActivity(row()).when).toBe('hace 1 h');
    expect(timeAgo('2026-10-19T14:58:00Z')).toBe('hace 2 min');
  });
});

describe('timeAgo', () => {
  const NOW = Date.parse('2026-10-19T14:00:00Z');
  const at = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

  it('steps from a moment to minutes, hours, days and then the date', () => {
    expect(timeAgo(at(59), NOW)).toBe('hace un momento');
    expect(timeAgo(at(60), NOW)).toBe('hace 1 min');
    expect(timeAgo(at(3599), NOW)).toBe('hace 59 min');
    expect(timeAgo(at(3600), NOW)).toBe('hace 1 h');
    expect(timeAgo(at(86_399), NOW)).toBe('hace 23 h');
    expect(timeAgo(at(86_400), NOW)).toBe('hace 1 d');
    expect(timeAgo(at(7 * 86_400 - 1), NOW)).toBe('hace 6 d');
    expect(timeAgo(at(7 * 86_400), NOW)).toMatch(/^\d{1,2} \S+ 2026$/);
  });

  it('reads a time ahead of now as a moment, and an unreadable one as nothing', () => {
    expect(timeAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe('hace un momento');
    expect(timeAgo('no es una fecha', NOW)).toBe('');
    expect(timeAgo('', NOW)).toBe('');
  });
});
