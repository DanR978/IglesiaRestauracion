// S39 — what an auth URL carries, and the scrub that takes it out of the
// address bar: query and fragment read as one (the query wins, as in
// auth-js), only the named parameters survive, and the router's history
// state is handed back untouched.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authParams, scrubLocation, scrubbedHref } from '#lib/components/admin/auth/auth-url.js';

const at = (href: string) => new URL(href, 'https://www.irdlex.org');

describe('authParams', () => {
  it('reads the query', () => {
    const params = authParams(at('/admin/acceso/oauth/?code=abc&state=s'));
    expect(params.get('code')).toBe('abc');
  });

  it('reads the fragment, where GoTrue duplicates its errors', () => {
    const params = authParams(
      at('/admin/acceso/oauth/#error=access_denied&error_code=signup_disabled&sb='),
    );
    expect(params.get('error')).toBe('access_denied');
    expect(params.get('error_code')).toBe('signup_disabled');
  });

  it('lets the query win a clash with the fragment', () => {
    const params = authParams(at('/x/?error_code=otp_expired#error_code=other&type=invite'));
    expect(params.get('error_code')).toBe('otp_expired');
    expect(params.get('type')).toBe('invite');
  });

  it('reads the legacy email contract from either place', () => {
    const query = authParams(
      at('/admin/acceso/invitacion/?action=accept-invite&token_hash=pkce_ab12&type=invite'),
    );
    const hash = authParams(at('/admin/acceso/invitacion/#token_hash=ab12&type=invite'));
    expect([query.get('token_hash'), query.get('type')]).toEqual(['pkce_ab12', 'invite']);
    expect([hash.get('token_hash'), hash.get('type')]).toEqual(['ab12', 'invite']);
  });

  it('is empty for a bare URL', () => {
    expect([...authParams(at('/admin/acceso/oauth/'))]).toEqual([]);
  });
});

describe('scrubbedHref', () => {
  it('keeps the pathname alone by default', () => {
    expect(scrubbedHref(at('/admin/acceso/oauth/?code=abc&state=s#error=x'))).toBe(
      '/admin/acceso/oauth/',
    );
  });

  it('keeps only the named parameters, and never the fragment', () => {
    expect(
      scrubbedHref(at('/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F&code=abc#t=1'), ['next']),
    ).toBe('/admin/acceso/verificar/?next=%2Fadmin%2Fcuenta%2F');
  });

  it('drops a kept name that is not there', () => {
    expect(scrubbedHref(at('/admin/acceso/?code=abc'), ['next'])).toBe('/admin/acceso/');
  });
});

describe('scrubLocation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
  });

  it('takes the one-time values out of the address bar and keeps the history state', () => {
    const routerState = { 'sveltekit:history': { historyIndex: 7 } };
    history.replaceState(
      routerState,
      '',
      '/admin/acceso/restablecer/?action=reset-password&token_hash=pkce_ab12&type=recovery#x=1',
    );
    scrubLocation();
    expect(location.pathname + location.search + location.hash).toBe('/admin/acceso/restablecer/');
    expect(history.state).toEqual(routerState);
  });

  it('keeps `next` when asked', () => {
    history.replaceState(null, '', '/admin/acceso/verificar/?next=%2Fadmin%2F&code=abc');
    scrubLocation(['next']);
    expect(location.search).toBe('?next=%2Fadmin%2F');
  });

  it('leaves a clean address alone', () => {
    history.replaceState(null, '', '/admin/acceso/oauth/');
    const replace = vi.spyOn(history, 'replaceState');
    scrubLocation();
    expect(replace).not.toHaveBeenCalled();
  });
});
