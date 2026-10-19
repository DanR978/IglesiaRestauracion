// S45 — Mi cuenta's pure half (components/admin/account/account.ts): the
// sections and their `?seccion=` state, the facts (dates, role, ministries),
// the avatar file check, the sign-in methods read from identities, the
// two-factor devices and the last-device rule, the TOTP secret and QR image,
// the new-password check and the password errors GoTrue reports by code.
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_SECTIONS,
  DEFAULT_SECTION,
  PASSWORD_FIELD_ERRORS,
  SECTION_NAV_ITEMS,
  SECTION_PARAM,
  avatarFileProblem,
  canRemoveDevice,
  deviceName,
  formatDate,
  formatDateTime,
  groupSecret,
  hasEmailIdentity,
  ministryIdsOf,
  newPasswordProblem,
  passwordFieldError,
  qrImageSrc,
  roleName,
  sectionFrom,
  sectionHref,
  signInMethods,
  verifiedFactors,
} from '#lib/components/admin/account/account.js';
import { sectionNavMode } from '#lib/components/section-nav.js';
import type { Factor } from '#lib/auth/mfa.js';

const identity = (provider: string, over: Record<string, string> = {}) => ({
  id: `id-${provider}`,
  identity_id: `iid-${provider}`,
  user_id: 'u-1',
  provider,
  ...over,
});

const factor = (over: Partial<Factor> = {}): Factor => ({
  id: 'f-1',
  friendly_name: 'IRD 2026-10-19 14:05:12 ab12',
  factor_type: 'totp',
  status: 'verified',
  created_at: '2026-10-19T14:05:12Z',
  updated_at: '2026-10-19T14:05:12Z',
  ...over,
});

describe('sections and the ?seccion= state', () => {
  it('are Perfil, Seguridad and Preferencias, in that order, Perfil by default', () => {
    expect(ACCOUNT_SECTIONS.map((s) => s.label)).toEqual(['Perfil', 'Seguridad', 'Preferencias']);
    expect(DEFAULT_SECTION).toBe('perfil');
    expect(SECTION_PARAM).toBe('seccion');
  });

  it('reads a known section and falls back to Perfil for anything else', () => {
    expect(sectionFrom('seguridad')).toBe('seguridad');
    expect(sectionFrom('preferencias')).toBe('preferencias');
    for (const value of [null, undefined, '', 'Seguridad', 'actividad', 'cuenta', '../perfil']) {
      expect(sectionFrom(value)).toBe('perfil');
    }
  });

  it('links each section by its query alone, so SectionNav runs in link mode', () => {
    expect(sectionHref('seguridad')).toBe('?seccion=seguridad');
    expect(SECTION_NAV_ITEMS.map((item) => item.href)).toEqual([
      '?seccion=perfil',
      '?seccion=seguridad',
      '?seccion=preferencias',
    ]);
    expect(sectionNavMode(SECTION_NAV_ITEMS)).toBe('links');
  });
});

describe('dates', () => {
  it('formats a day in Spanish, with the month written out', () => {
    // Midday UTC: the same calendar day in every time zone from UTC−11 to UTC+11.
    const text = formatDate('2026-10-19T12:00:00Z') ?? '';
    expect(text).toMatch(/19/);
    expect(text).toMatch(/octubre/);
    expect(text).toMatch(/2026/);
  });

  it('formats a moment with a short month and the time', () => {
    const text = formatDateTime('2026-10-19T12:00:00Z') ?? '';
    expect(text).toMatch(/oct/);
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  it('is null for a missing or broken value — the field shows its "Sin dato" mark', () => {
    for (const value of [null, undefined, '', 'mañana']) {
      expect(formatDate(value)).toBeNull();
      expect(formatDateTime(value)).toBeNull();
    }
  });
});

describe('facts', () => {
  it('shows the access preset when the account may read it, else the role', () => {
    expect(roleName({ role: 'admin', role_presets: { name: 'Desarrollador' } })).toBe(
      'Desarrollador',
    );
    expect(roleName({ role: 'admin', role_presets: null })).toBe('Administrador');
    expect(roleName({ role: 'treasurer', role_presets: { name: '  ' } })).toBe('Tesorería');
    expect(roleName({ role: 'ministry_leader', role_presets: null })).toBe('Líder de ministerio');
    expect(roleName({ role: null, role_presets: null })).toBeNull();
  });

  it('collects every ministry the account leads, once each', () => {
    expect(ministryIdsOf({ ministry_ids: ['m-1', 'm-2'], ministry_id: 'm-1' })).toEqual([
      'm-1',
      'm-2',
    ]);
    expect(ministryIdsOf({ ministry_ids: [], ministry_id: 'm-9' })).toEqual(['m-9']);
    expect(ministryIdsOf({ ministry_ids: [], ministry_id: null })).toEqual([]);
  });
});

describe('avatarFileProblem — images only, at most 5 MB', () => {
  it('lets an image within the limit through', () => {
    expect(avatarFileProblem({ type: 'image/jpeg', size: 1_000 })).toBeNull();
    expect(avatarFileProblem({ type: 'image/heic', size: 5 * 1024 * 1024 })).toBeNull();
  });

  it('refuses anything that is not an image, an empty file and anything over 5 MB', () => {
    expect(avatarFileProblem({ type: 'application/pdf', size: 1_000 })).toMatch(/imagen/);
    expect(avatarFileProblem({ type: '', size: 1_000 })).toMatch(/imagen/);
    expect(avatarFileProblem({ type: 'image/png', size: 0 })).toMatch(/vacío/);
    expect(avatarFileProblem({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe(
      'La imagen es muy grande (máx. 5 MB).',
    );
  });
});

describe('sign-in methods', () => {
  it('names each provider in Spanish, password first', () => {
    const methods = signInMethods([
      identity('azure'),
      identity('email', { last_sign_in_at: '2026-10-19T12:00:00Z' }),
      identity('google', { created_at: '2026-09-01T12:00:00Z' }),
    ]);
    expect(methods.map((m) => m.label)).toEqual(['Correo y contraseña', 'Google', 'Microsoft']);
    expect(methods.map((m) => m.iconSet)).toEqual(['fas', 'fab', 'fab']);
    expect(methods[0].lastUsed).toBe('2026-10-19T12:00:00Z');
    expect(methods[1]).toMatchObject({ lastUsed: null, linkedAt: '2026-09-01T12:00:00Z' });
    expect(methods.map((m) => m.key)).toEqual(['iid-email', 'iid-google', 'iid-azure']);
  });

  it('never shows a raw provider name', () => {
    expect(signInMethods([identity('github')])[0].label).toBe('Otro proveedor');
  });

  it('has nothing to list without identities', () => {
    expect(signInMethods(undefined)).toEqual([]);
    expect(signInMethods([])).toEqual([]);
  });

  it('decides "has an email identity" from the identities, then the providers', () => {
    expect(hasEmailIdentity({ identities: [identity('email')], app_metadata: {} })).toBe(true);
    expect(
      hasEmailIdentity({ identities: [identity('google'), identity('azure')], app_metadata: {} }),
    ).toBe(false);
    expect(hasEmailIdentity({ identities: [], app_metadata: { providers: ['google'] } })).toBe(
      false,
    );
    expect(hasEmailIdentity({ identities: [], app_metadata: { providers: ['email'] } })).toBe(true);
    // Nothing to go on: every account here starts as an email invitation.
    expect(hasEmailIdentity({ identities: undefined, app_metadata: {} })).toBe(true);
  });
});

describe('two-factor devices', () => {
  it('lists the verified factors only, oldest first', () => {
    const list = verifiedFactors([
      factor({ id: 'new', created_at: '2026-10-19T00:00:00Z' }),
      factor({ id: 'half', status: 'unverified' }),
      factor({ id: 'old', created_at: '2025-01-01T00:00:00Z' }),
    ]);
    expect(list.map((f) => f.id)).toEqual(['old', 'new']);
  });

  it('names a device by its friendly name, or says it has none', () => {
    expect(deviceName(factor())).toBe('IRD 2026-10-19 14:05:12 ab12');
    expect(deviceName(factor({ friendly_name: '  ' }))).toBe('Dispositivo sin nombre');
    expect(deviceName(factor({ friendly_name: undefined }))).toBe('Dispositivo sin nombre');
  });

  it('lets a device go only while another stays (D-033)', () => {
    expect(canRemoveDevice(0)).toBe(false);
    expect(canRemoveDevice(1)).toBe(false);
    expect(canRemoveDevice(2)).toBe(true);
    expect(canRemoveDevice(3)).toBe(true);
  });

  it('shows the secret in blocks of four', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')).toBe(
      'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
    );
    expect(groupSecret('ABCDE')).toBe('ABCD E');
    expect(groupSecret(' AB CD ')).toBe('ABCD');
  });
});

describe('qrImageSrc — the QR as a safe <img> src', () => {
  const svg = '<?xml version="1.0"?>\n<svg width="10"><rect fill="#000" width="1"/></svg>';

  it('percent-encodes the raw SVG auth-js puts behind its prefix, so a # cannot cut it', () => {
    const src = qrImageSrc(`data:image/svg+xml;utf-8,${svg}`) ?? '';
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(src).not.toMatch(/[<>"#\s]/);
    expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe(svg);
  });

  it('leaves an encoded or base64 payload alone', () => {
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    expect(qrImageSrc(encoded)).toBe(encoded);
    expect(qrImageSrc('data:image/svg+xml;base64,PHN2Zy8+')).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
  });

  it('refuses anything that is not an SVG data URL', () => {
    for (const value of [
      null,
      '',
      'https://example.org/qr.svg',
      'javascript:alert(1)',
      'data:text/html,<svg/onload=alert(1)>',
      'data:image/png;base64,AAAA',
    ]) {
      expect(qrImageSrc(value)).toBeNull();
    }
  });
});

describe('passwords', () => {
  it('asks for a new password that the meter calls acceptable', () => {
    expect(newPasswordProblem('')).toBe('Escribe la nueva contraseña.');
    expect(newPasswordProblem('Luz.Sol')).toBe('La contraseña debe tener al menos 8 caracteres.');
    expect(newPasswordProblem('Contraseña2024!')).toMatch(/fácil de adivinar/);
    expect(newPasswordProblem('12345678')).toMatch(/fácil de adivinar/);
    expect(newPasswordProblem('Una frase larga 2026')).toBeNull();
  });

  it('refuses what bcrypt would cut: more than 72 bytes', () => {
    // € is 3 bytes in UTF-8, ñ and á are 2: 7 bytes per repeat.
    expect(newPasswordProblem('€ñá'.repeat(11))).toBe(
      'La contraseña es demasiado larga. Usa como máximo 72 caracteres.',
    );
    expect(newPasswordProblem('€ñá'.repeat(10))).toBeNull();
  });

  it('puts the four GoTrue codes under their field, in Spanish', () => {
    expect(passwordFieldError('current_password_required')).toEqual({
      field: 'current',
      message: 'Escribe tu contraseña actual.',
    });
    expect(passwordFieldError('current_password_invalid')).toEqual({
      field: 'current',
      message: 'La contraseña actual no es correcta.',
    });
    expect(passwordFieldError('same_password')).toEqual({
      field: 'next',
      message: 'La nueva contraseña debe ser distinta de la actual.',
    });
    expect(passwordFieldError('weak_password')?.field).toBe('next');
    expect(Object.keys(PASSWORD_FIELD_ERRORS)).toHaveLength(4);
  });

  it('leaves every other failure to a toast', () => {
    for (const code of [null, undefined, '', 'over_request_rate_limit', 'insufficient_aal']) {
      expect(passwordFieldError(code)).toBeNull();
    }
  });
});
