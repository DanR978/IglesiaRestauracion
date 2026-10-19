// S38 — safeNext(): `?next=` arrives from a URL anyone can craft, so every
// open-redirect shape must land on Inicio. Run under both bases the app is
// served from: '/app' (now) and '' (after the cutover, G-008).
import { afterEach, describe, expect, it, vi } from 'vitest';

type NextModule = typeof import('#lib/auth/next.js');

/** Re-import next.ts (and routes.ts) with $app/paths at `base`; `pages` are the routes match() knows. */
async function at(base: string, pages: string[], matchThrows = false): Promise<NextModule> {
  vi.resetModules();
  vi.doMock('$app/paths', async () => {
    const { pathsAt } = await import('../../helpers/app-paths');
    return {
      ...pathsAt(base),
      match: async (url: URL | string) => {
        if (matchThrows) throw new Error('router not started');
        const path = typeof url === 'string' ? url : url.pathname;
        return pages.includes(path) ? { id: path, params: {} } : null;
      },
    };
  });
  return import('#lib/auth/next.js');
}

afterEach(() => {
  vi.doUnmock('$app/paths');
  vi.resetModules();
});

const ORIGIN = location.origin;

describe.each([
  { base: '/app', home: '/app/admin/' },
  { base: '', home: '/admin/' },
])('safeNext at base "$base"', ({ base, home }) => {
  const pages = [`${base}/admin/`, `${base}/admin/cuenta/`, `${base}/admin/acceso/`];

  it('keeps a same-app admin page, with its query and hash', async () => {
    const { safeNext } = await at(base, pages);
    expect(await safeNext(`${base}/admin/cuenta/`)).toBe(`${base}/admin/cuenta/`);
    expect(await safeNext(`${base}/admin/cuenta/?tab=seguridad#clave`)).toBe(
      `${base}/admin/cuenta/?tab=seguridad#clave`,
    );
    expect(await safeNext(home)).toBe(home);
  });

  it.each([
    ['nothing', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an empty string', ''],
    ['protocol-relative', '//evil.example'],
    ['protocol-relative with the admin path', '//evil.example/app/admin/'],
    ['slash-backslash', '/\\evil.example'],
    ['slash-backslash-slash', '/\\/evil.example'],
    ['a backslash later on', '/app/admin\\..\\..\\evil'],
    ['https:', 'https://evil.example/app/admin/'],
    ['an absolute same-origin URL (paths only)', `${ORIGIN}${base}/admin/cuenta/`],
    ['javascript:', 'javascript:alert(1)'],
    ['JaVaScRiPt: in mixed case', 'JaVaScRiPt:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['a tab a browser strips (/\\t/ → //)', '/\t/evil.example'],
    ['a newline a browser strips', '/\n/evil.example'],
    ['a leading space', ` ${base}/admin/cuenta/`],
    ['a NUL byte', `${base}/admin/cuenta/\u0000`],
    ['encoded slashes', '%2F%2Fevil.example'],
    ['encoded slashes after one slash', '/%2F%2Fevil.example'],
    ['an encoded backslash', '/%5Cevil.example'],
    ['an encoded tab', '/%09/evil.example'],
    ['dot segments out of the admin', `${base}/admin/../../evil`],
    ['encoded dot segments', `${base}/admin/%2e%2e/%2e%2e/evil`],
    ['upper-case encoded dot segments', `${base}/admin/%2E%2E/kit/`],
    ['the legacy panel', '/admin/legacy/'],
    ['another part of the app', `${base}/kit/button/`],
    ['a look-alike prefix', `${base}/administrator/`],
    ['the wrong case', `${base}/ADMIN/cuenta/`],
    ['the sign-in page (a loop)', `${base}/admin/acceso/`],
    ['another acceso page', `${base}/admin/acceso/verificar/`],
    ['an admin path that is not a route', `${base}/admin/nope/`],
    ['an admin path without its trailing slash', `${base}/admin`],
    ['an absurd length', `${base}/admin/${'a'.repeat(3000)}/`],
  ])('refuses %s → Inicio', async (_label, raw) => {
    const { safeNext } = await at(base, pages);
    expect(await safeNext(raw)).toBe(home);
  });

  it('refuses everything when match() cannot answer', async () => {
    const { safeNext } = await at(base, pages, true);
    expect(await safeNext(`${base}/admin/cuenta/`)).toBe(home);
  });
});

describe('safeNext across bases', () => {
  it("at '/app', a root-served admin path is another site's page", async () => {
    const { safeNext } = await at('/app', ['/app/admin/', '/admin/cuenta/']);
    expect(await safeNext('/admin/cuenta/')).toBe('/app/admin/');
  });

  it("at '', the '/app' admin no longer exists", async () => {
    const { safeNext } = await at('', ['/admin/', '/app/admin/cuenta/']);
    expect(await safeNext('/app/admin/cuenta/')).toBe('/admin/');
  });
});
