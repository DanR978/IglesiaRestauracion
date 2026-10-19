// S37 → S39 — the sign-in notice: why the sign-in page opened, carried in
// `?aviso=` across a full page load. Only the two known values mean anything.
import { describe, expect, it } from 'vitest';
import {
  SIGN_IN_NOTICES,
  SIGN_IN_NOTICE_PARAM,
  signInNoticeFrom,
  withSignInNotice,
} from '#lib/auth/notice.js';

const params = (query: string) =>
  new URL(`https://www.irdlex.org/admin/acceso/${query}`).searchParams;

describe('withSignInNotice', () => {
  it('adds the notice to a bare sign-in path', () => {
    expect(withSignInNotice('/app/admin/acceso/', 'signed-out')).toBe(
      '/app/admin/acceso/?aviso=sesion-cerrada',
    );
  });

  it('keeps the guard’s `next` as it was encoded', () => {
    expect(withSignInNotice('/admin/acceso/?next=%2Fadmin%2Fcuenta%2F', 'expired')).toBe(
      '/admin/acceso/?next=%2Fadmin%2Fcuenta%2F&aviso=sesion-expirada',
    );
  });
});

describe('signInNoticeFrom', () => {
  it('reads both notices back', () => {
    expect(signInNoticeFrom(params('?aviso=sesion-cerrada'))).toBe('signed-out');
    expect(signInNoticeFrom(params('?next=%2Fadmin%2F&aviso=sesion-expirada'))).toBe('expired');
  });

  it('round-trips what withSignInNotice wrote', () => {
    for (const notice of ['signed-out', 'expired'] as const) {
      const url = new URL(withSignInNotice('/admin/acceso/', notice), 'https://www.irdlex.org');
      expect(signInNoticeFrom(url.searchParams)).toBe(notice);
    }
  });

  it('anything else is no notice — the words never come from the URL', () => {
    for (const query of [
      '',
      '?aviso=',
      '?aviso=Sesi%C3%B3n%20cerrada',
      '?aviso=signed-out',
      '?aviso=<script>',
      '?notice=sesion-cerrada',
    ]) {
      expect(signInNoticeFrom(params(query)), query).toBeNull();
    }
  });
});

describe('the copy', () => {
  it('is the Spanish S39 shows', () => {
    expect(SIGN_IN_NOTICE_PARAM).toBe('aviso');
    expect(SIGN_IN_NOTICES).toEqual({
      'signed-out': 'Sesión cerrada.',
      expired: 'Tu sesión expiró.',
    });
  });
});
