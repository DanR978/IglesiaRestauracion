// S39 — what one acceso page hands the next: the sign-in notice (a URL
// contract the shell's logout and "expired" screen use) and the email carried
// to recuperar/ in memory (WCAG 3.3.7), never the URL.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_NOTICE_COPY,
  carriedEmail,
  carryEmail,
  loginHref,
  loginNoticeFor,
} from '#lib/components/admin/auth/handoff.js';

const params = (query: string) => new URLSearchParams(query);

describe('loginNoticeFor', () => {
  it.each([
    ['aviso=sesion-cerrada', 'signed-out'],
    ['aviso=sesion-expirada', 'expired'],
  ] as const)('?%s → %s', (query, notice) => {
    expect(loginNoticeFor(params(query), 'signed-out')).toBe(notice);
  });

  it('a session the store saw end unasked says "expired" without the parameter', () => {
    expect(loginNoticeFor(params(''), 'expired')).toBe('expired');
  });

  it('the parameter wins over the status', () => {
    expect(loginNoticeFor(params('aviso=sesion-cerrada'), 'expired')).toBe('signed-out');
  });

  it.each(['', 'aviso=', 'aviso=<b>hola</b>', 'aviso=SESION-CERRADA'])(
    'shows nothing for %j on a plain visit',
    (query) => {
      expect(loginNoticeFor(params(query), 'signed-out')).toBeNull();
    },
  );

  it('the copy', () => {
    expect(LOGIN_NOTICE_COPY['signed-out']).toBe('Sesión cerrada.');
    expect(LOGIN_NOTICE_COPY.expired).toMatch(/^Tu sesión expiró\./);
  });
});

describe('loginHref', () => {
  it('the bare sign-in page', () => {
    expect(loginHref(null)).toBe('/admin/acceso/');
  });

  it('with a notice', () => {
    expect(loginHref('signed-out')).toBe('/admin/acceso/?aviso=sesion-cerrada');
  });

  it('with `next` and a notice; Inicio is left off', () => {
    expect(loginHref('expired', '/admin/cuenta/')).toBe(
      '/admin/acceso/?next=%2Fadmin%2Fcuenta%2F&aviso=sesion-expirada',
    );
    expect(loginHref('expired', '/admin/')).toBe('/admin/acceso/?aviso=sesion-expirada');
  });

  it('round-trips through the page that reads it', () => {
    const url = new URL(loginHref('expired', '/admin/cuenta/'), 'https://www.irdlex.org');
    expect(url.searchParams.get('next')).toBe('/admin/cuenta/');
    expect(loginNoticeFor(url.searchParams, 'signed-out')).toBe('expired');
  });

  describe('under BASE_PATH=/app', () => {
    afterEach(() => {
      vi.doUnmock('$app/paths');
      vi.resetModules();
    });

    it('is the /app sign-in page', async () => {
      vi.resetModules();
      vi.doMock('$app/paths', async () =>
        (await import('../../helpers/app-paths')).pathsAt('/app'),
      );
      const { loginHref: at } = await import('#lib/components/admin/auth/handoff.js');
      expect(at('signed-out', '/app/admin/cuenta/')).toBe(
        '/app/admin/acceso/?next=%2Fapp%2Fadmin%2Fcuenta%2F&aviso=sesion-cerrada',
      );
      expect(at(null, '/app/admin/')).toBe('/app/admin/acceso/');
    });
  });
});

describe('the carried email', () => {
  it('is kept trimmed, in memory', () => {
    carryEmail('  ana@example.org ');
    expect(carriedEmail()).toBe('ana@example.org');
    carryEmail('');
    expect(carriedEmail()).toBe('');
  });
});
