// S38 — the guard's decisions (pure half of guardAdmin): first the legacy
// email contract (`?action=accept-invite|reset-password&token_hash&type`,
// supabase/email-templates), then the access state. Routes at base '' (the
// $app/paths stub).
import { describe, expect, it } from 'vitest';
import { accessTarget, emailLinkTarget, type GuardStatus } from '#lib/auth/guard.js';

const url = (path: string) => new URL(path, 'https://www.irdlex.org');

describe('emailLinkTarget — the legacy email contract', () => {
  it('an invitation link goes to invitacion/, query intact', () => {
    const link = url('/admin/?action=accept-invite&token_hash=pkce_abc123&type=invite');
    expect(emailLinkTarget(link)).toBe(
      '/admin/acceso/invitacion/?action=accept-invite&token_hash=pkce_abc123&type=invite',
    );
  });

  it('the confirmation template (type=email) is an invitation too', () => {
    const link = url('/admin/?action=accept-invite&token_hash=abc&type=email');
    expect(emailLinkTarget(link)).toMatch(/^\/admin\/acceso\/invitacion\/\?/);
  });

  it('a recovery link goes to restablecer/, query intact', () => {
    const link = url('/admin/?action=reset-password&token_hash=abc&type=recovery');
    expect(emailLinkTarget(link)).toBe(
      '/admin/acceso/restablecer/?action=reset-password&token_hash=abc&type=recovery',
    );
  });

  it('keeps the hash (an expired link reports its error there)', () => {
    const link = url('/admin/?action=reset-password');
    expect(emailLinkTarget(link, '#error=access_denied&error_code=otp_expired')).toBe(
      '/admin/acceso/restablecer/?action=reset-password#error=access_denied&error_code=otp_expired',
    );
  });

  it('`action` alone still routes (the page shows the expired-link message)', () => {
    expect(emailLinkTarget(url('/admin/?action=accept-invite&error=access_denied'))).toBe(
      '/admin/acceso/invitacion/?action=accept-invite&error=access_denied',
    );
  });

  it('a bare token_hash + type goes by its type', () => {
    expect(emailLinkTarget(url('/admin/?token_hash=abc&type=recovery'))).toBe(
      '/admin/acceso/restablecer/?token_hash=abc&type=recovery',
    );
    expect(emailLinkTarget(url('/admin/?token_hash=abc&type=invite'))).toBe(
      '/admin/acceso/invitacion/?token_hash=abc&type=invite',
    );
  });

  it('a token with an unknown action still goes by its type (legacy boot spent it either way)', () => {
    expect(emailLinkTarget(url('/admin/?action=other&token_hash=abc&type=invite'))).toBe(
      '/admin/acceso/invitacion/?action=other&token_hash=abc&type=invite',
    );
  });

  it('works from any admin page, not only Inicio', () => {
    expect(emailLinkTarget(url('/admin/cuenta/?action=reset-password'))).toBe(
      '/admin/acceso/restablecer/?action=reset-password',
    );
  });

  it.each([
    ['no query', '/admin/'],
    ['an unrelated query', '/admin/cuenta/?tab=seguridad'],
    ['an unknown action without a token', '/admin/?action=delete-everything'],
    ['token_hash without type', '/admin/?token_hash=abc'],
    ['type without token_hash', '/admin/?type=recovery'],
    ['empty values', '/admin/?token_hash=&type='],
  ])('%s is not an email link', (_label, path) => {
    expect(emailLinkTarget(url(path))).toBeNull();
  });
});

describe('accessTarget — the access state', () => {
  const page = url('/admin/cuenta/?tab=seguridad');
  const next = `?next=${encodeURIComponent('/admin/cuenta/?tab=seguridad')}`;

  it.each<[GuardStatus, string | null]>([
    ['signed-out', `/admin/acceso/${next}`],
    ['expired', `/admin/acceso/${next}`],
    ['needs-mfa', `/admin/acceso/verificar/${next}`],
    ['needs-enroll', `/admin/acceso/verificar/${next}`],
    ['forbidden', '/admin/acceso/sin-acceso/'],
    ['ready', null],
    ['error', null],
    ['loading', null],
  ])('%s → %s', (status, target) => {
    expect(accessTarget(page, status)).toBe(target);
  });

  it('Inicio needs no `next`', () => {
    expect(accessTarget(url('/admin/'), 'signed-out')).toBe('/admin/acceso/');
  });

  it('an error never sends anyone to sign in (a transport failure is not a sign-out)', () => {
    expect(accessTarget(page, 'error')).toBeNull();
  });
});
