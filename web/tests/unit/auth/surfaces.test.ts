// S38 — the D-006 oracle: visibleSurfacesFor() + capabilitiesFor() against the
// legacy gating (js/pages/admin/auth.js applyTabAccess, shell.css
// data-admin-only / data-finance-only) and the developer tier of
// 20261019000001 (account_has_system_tab). D-006: the negative cases are
// tests, not comments — each "≠" below is one.
import { describe, expect, it } from 'vitest';
import {
  ROLE_LABELS,
  SURFACES,
  capabilitiesFor,
  visibleSurfacesFor,
  type AccessProfile,
  type SurfaceKey,
} from '#lib/auth/surfaces.js';

const keys = (profile: AccessProfile | null | undefined): SurfaceKey[] =>
  visibleSurfacesFor(profile).map((s) => s.key);

const SYSTEM: SurfaceKey[] = ['ministries', 'users', 'activity', 'settings'];
const OPERATIONAL: SurfaceKey[] = [
  'upcoming',
  'calendario',
  'special-events',
  'discipulado',
  'galeria',
  'treasury',
];
const EVERY_KEY = SURFACES.map((s) => s.key);

// The four built-in presets (admin-invite SEED_PRESETS) and the edge cases.
const DESARROLLADOR = {
  role: 'admin',
  allowed_tabs: ['ministries', 'users', 'activity', 'settings'],
};
const ADMINISTRADOR = { role: 'admin', allowed_tabs: [] };
const TESORERIA = { role: 'treasurer', allowed_tabs: [] };
const MEDIOS = {
  role: 'ministry_leader',
  allowed_tabs: ['upcoming', 'calendario', 'special-events', 'galeria'],
};
const LEADER_BARE = { role: 'ministry_leader', allowed_tabs: [] };

describe('the surface registry', () => {
  it('lists every legacy surface once, in nav order, with Spanish labels', () => {
    expect(EVERY_KEY).toEqual([
      'inicio',
      'cuenta',
      'analytics',
      'calendario',
      'upcoming',
      'special-events',
      'treasury',
      'discipulado',
      'galeria',
      'leaders',
      'ministries',
      'users',
      'activity',
      'settings',
    ]);
    expect(SURFACES.map((s) => s.label)).toEqual([
      'Inicio',
      'Mi cuenta',
      'Analíticas',
      'Calendario',
      'Próximos',
      'Registraciones',
      'Tesorería',
      'Discipulado',
      'Galería',
      'Líderes',
      'Ministerios',
      'Usuarios',
      'Actividad',
      'Configuración',
    ]);
  });

  it('groups as the legacy nav does (Ministerios sits under Comunidad)', () => {
    const group = Object.fromEntries(SURFACES.map((s) => [s.key, s.group]));
    expect(group).toMatchObject({
      inicio: 'Principal',
      analytics: 'Principal',
      calendario: 'Eventos',
      upcoming: 'Eventos',
      'special-events': 'Eventos',
      treasury: 'Finanzas',
      discipulado: 'Comunidad',
      galeria: 'Comunidad',
      leaders: 'Comunidad',
      ministries: 'Comunidad',
      users: 'Administración',
      activity: 'Administración',
      settings: 'Administración',
    });
  });

  it('only Inicio and Mi cuenta are ported in this PR, each with its route', () => {
    const ported = SURFACES.filter((s) => s.ported);
    expect(ported.map((s) => [s.key, s.route])).toEqual([
      ['inicio', '/admin/'],
      ['cuenta', '/admin/cuenta/'],
    ]);
    expect(SURFACES.filter((s) => !s.ported).every((s) => s.route === undefined)).toBe(true);
  });

  it('every icon is a Font Awesome name', () => {
    for (const s of SURFACES) expect(s.icon).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe('visibleSurfacesFor — admin', () => {
  it('Desarrollador (all four system keys) sees every surface', () => {
    expect(keys(DESARROLLADOR)).toEqual(EVERY_KEY);
  });

  it('Administrador ≠ system surfaces: everything else, none of the four', () => {
    const seen = keys(ADMINISTRADOR);
    for (const key of SYSTEM) expect(seen).not.toContain(key);
    expect(seen).toEqual(EVERY_KEY.filter((k) => !SYSTEM.includes(k)));
  });

  it.each(SYSTEM)('each system surface needs its own key: only %s', (key) => {
    const seen = keys({ role: 'admin', allowed_tabs: [key] });
    expect(SYSTEM.filter((k) => seen.includes(k))).toEqual([key]);
  });

  it('operational keys add nothing for an admin (it already sees them)', () => {
    expect(keys({ role: 'admin', allowed_tabs: OPERATIONAL })).toEqual(keys(ADMINISTRADOR));
  });
});

describe('visibleSurfacesFor — treasurer', () => {
  it('Tesorería: Inicio, Mi cuenta, Calendario + Próximos (read-only), Tesorería', () => {
    expect(keys(TESORERIA)).toEqual(['inicio', 'cuenta', 'calendario', 'upcoming', 'treasury']);
  });

  it('treasurer ≠ registrations (personal data of registrants)', () => {
    expect(keys(TESORERIA)).not.toContain('special-events');
  });

  it('treasurer ≠ discipulado (personal data of interested people)', () => {
    expect(keys(TESORERIA)).not.toContain('discipulado');
  });

  it('treasurer ≠ any other personal data or admin surface', () => {
    for (const key of ['galeria', 'leaders', 'analytics', ...SYSTEM] as SurfaceKey[]) {
      expect(keys(TESORERIA)).not.toContain(key);
    }
  });

  it('allowed_tabs never widens a treasurer', () => {
    expect(
      keys({ role: 'treasurer', allowed_tabs: [...OPERATIONAL, ...SYSTEM, 'analytics'] }),
    ).toEqual(keys(TESORERIA));
  });
});

describe('visibleSurfacesFor — ministry leader', () => {
  it('sees Inicio and Mi cuenta, plus exactly what was granted', () => {
    expect(keys(LEADER_BARE)).toEqual(['inicio', 'cuenta']);
    expect(keys(MEDIOS)).toEqual([
      'inicio',
      'cuenta',
      'calendario',
      'upcoming',
      'special-events',
      'galeria',
    ]);
  });

  it.each(OPERATIONAL)('the grant %s shows that surface alone', (key) => {
    expect(keys({ role: 'ministry_leader', allowed_tabs: [key] })).toEqual([
      'inicio',
      'cuenta',
      key,
    ]);
  });

  it('leader ≠ church books: a treasury grant is the ministry tab, not the church capability', () => {
    const leader = { role: 'ministry_leader', allowed_tabs: ['treasury'] };
    expect(keys(leader)).toContain('treasury');
    expect(capabilitiesFor(leader).has('church-books')).toBe(false);
  });

  it('leader ≠ analytics, Líderes or a system surface, even if the key is stored', () => {
    const seen = keys({
      role: 'ministry_leader',
      allowed_tabs: ['analytics', 'leaders', ...SYSTEM],
    });
    expect(seen).toEqual(['inicio', 'cuenta']);
  });

  it('a missing or malformed allowed_tabs grants nothing (no legacy fallback set)', () => {
    expect(keys({ role: 'ministry_leader', allowed_tabs: null })).toEqual(['inicio', 'cuenta']);
    expect(keys({ role: 'ministry_leader' })).toEqual(['inicio', 'cuenta']);
    expect(
      keys({ role: 'ministry_leader', allowed_tabs: 'treasury' as unknown as string[] }),
    ).toEqual(['inicio', 'cuenta']);
  });
});

describe('fail closed', () => {
  it.each([
    ['no profile', null],
    ['undefined', undefined],
    ['unknown role "pastor"', { role: 'pastor', allowed_tabs: [...SYSTEM, ...OPERATIONAL] }],
    ['a role in the wrong case', { role: 'Admin', allowed_tabs: SYSTEM }],
    ['a null role', { role: null, allowed_tabs: SYSTEM }],
  ])('%s → nothing', (_label, profile) => {
    expect(visibleSurfacesFor(profile as AccessProfile | null)).toEqual([]);
    expect(capabilitiesFor(profile as AccessProfile | null).size).toBe(0);
  });

  it('unknown keys are ignored', () => {
    expect(keys({ role: 'admin', allowed_tabs: ['root', 'past', 'Users', 'users '] })).toEqual(
      keys(ADMINISTRADOR),
    );
  });
});

describe('capabilitiesFor', () => {
  it('church books: admin and treasurer only (is_finance)', () => {
    expect(capabilitiesFor(ADMINISTRADOR).has('church-books')).toBe(true);
    expect(capabilitiesFor(TESORERIA).has('church-books')).toBe(true);
    expect(capabilitiesFor(MEDIOS).has('church-books')).toBe(false);
  });

  it('non-admin ≠ the notifications bell; non-admin ≠ analytics', () => {
    expect(capabilitiesFor(DESARROLLADOR).has('notifications')).toBe(true);
    expect(capabilitiesFor(ADMINISTRADOR).has('notifications')).toBe(true);
    for (const profile of [TESORERIA, MEDIOS, LEADER_BARE]) {
      expect(capabilitiesFor(profile).has('notifications')).toBe(false);
      expect(keys(profile)).not.toContain('analytics');
    }
  });
});

describe('ROLE_LABELS', () => {
  it('names the three roles in Spanish (legacy account.js ROLE_LABEL)', () => {
    expect(ROLE_LABELS).toEqual({
      admin: 'Administrador',
      treasurer: 'Tesorería',
      ministry_leader: 'Líder de ministerio',
    });
  });
});
