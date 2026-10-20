// D-036 / D-037 — what the prerendered HTML carries before any script runs,
// read from the build this run made (Playwright builds before it loads a
// spec; helpers/routes.ts): every admin route is a real file under
// build/admin/ — the shells of Inicio and Mi cuenta and every sign-in page —
// and each carries the CSP meta and `noindex, nofollow`; every public page
// carries the CSP meta too. The policy is checked against the page itself:
// each inline script it holds (Kit's boot script, app.html's theme script) is
// allowed by its hash, and the backend it allows is this build's own Supabase,
// over http(s) and ws(s). Nothing here runs a browser: the configs give it to
// one project only.
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prerenderedHtml, prerenderedRoutes } from './helpers/routes';

const ADMIN_ROUTES = [
  '/admin/',
  '/admin/acceso/',
  '/admin/acceso/invitacion/',
  '/admin/acceso/oauth/',
  '/admin/acceso/recuperar/',
  '/admin/acceso/restablecer/',
  '/admin/acceso/sin-acceso/',
  '/admin/acceso/verificar/',
  '/admin/cuenta/',
];
const ROBOTS = '<meta name="robots" content="noindex, nofollow" />';
const CSP_META = /<meta http-equiv="content-security-policy" content="([^"]*)">/g;

const ROUTES = prerenderedRoutes();
const PUBLIC_ROUTES = ROUTES.filter((route) => !route.startsWith('/admin/'));

const decode = (text: string) =>
  text.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');

/** The page's policy, directive → sources; it must be there exactly once, inside <head>. */
function policyOf(html: string): Map<string, string[]> {
  const head = html.slice(0, html.indexOf('</head>'));
  const metas = [...html.matchAll(CSP_META)];
  expect(metas, 'one CSP meta per page').toHaveLength(1);
  expect(head, 'the CSP meta sits inside <head>').toContain(metas[0][0]);
  return new Map(
    decode(metas[0][1])
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .map(([name, ...sources]) => [name, sources]),
  );
}

const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

test('every admin route is a prerendered file under build/admin/', () => {
  expect(ROUTES.filter((route) => route.startsWith('/admin/'))).toEqual(ADMIN_ROUTES);
});

for (const route of ADMIN_ROUTES) {
  test(`${route} carries the CSP meta and noindex, nofollow before the app boots`, () => {
    const html = prerenderedHtml(route);
    policyOf(html);
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head.split(ROBOTS)).toHaveLength(2);
    // The CSP meta comes before everything Kit asks the browser to load.
    const meta = html.search(CSP_META);
    expect(meta).toBeLessThan(html.indexOf('rel="modulepreload"'));
    expect(meta).toBeLessThan(html.indexOf('rel="stylesheet">'));
  });
}

test('the build has public pages', () => {
  expect(PUBLIC_ROUTES.length).toBeGreaterThan(0);
});

for (const route of PUBLIC_ROUTES) {
  test(`${route} carries the CSP meta`, () => {
    policyOf(prerenderedHtml(route));
  });
}

for (const route of [...PUBLIC_ROUTES, ...ADMIN_ROUTES]) {
  test(`${route}: the policy allows the page's own inline scripts and this build's backend`, ({
    baseURL,
  }) => {
    const html = prerenderedHtml(route);
    const policy = policyOf(html);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length, 'app.html theme script + Kit boot script').toBe(2);
    for (const script of scripts) expect(policy.get('script-src')).toContain(sha256(script));
    expect(policy.get('script-src')).not.toContain("'unsafe-inline'");

    // The e2e build's Supabase is the preview origin itself (helpers/supabase.ts).
    const origin = new URL(baseURL ?? '').origin;
    const socket = origin.replace(/^http/, 'ws');
    expect(policy.get('connect-src')).toEqual(["'self'", origin, socket]);
    expect(policy.get('img-src')).toEqual(["'self'", 'data:', 'blob:', origin]);
    expect(policy.has('frame-ancestors'), 'a <meta> cannot carry it').toBe(false);
  });
}
