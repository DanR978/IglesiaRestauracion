// S37 — src/hooks.server.ts at prerender (D-036/D-037): every page of the
// (admin) route group — an `ssr = false` shell that never renders
// <svelte:head> — gets `noindex, nofollow` and a generic title in its HTML;
// public pages pass through untouched. Driven through the real `handle`
// with a resolve() that applies the transform the way Kit does.
import type { RequestEvent } from '@sveltejs/kit';
import type { ResolveOptions } from '@sveltejs/kit/hooks';
import { describe, expect, it } from 'vitest';
import { documentTitle } from '#lib/components/admin/shell/shell.js';
import { handle } from '../../src/hooks.server';

const SHELL = [
  '<!doctype html>',
  '<html lang="es">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <link rel="modulepreload" href="/app/_app/immutable/entry/start.js">',
  '  </head>',
  '  <body data-sveltekit-preload-data="hover">',
  '    <div style="display: contents"></div>',
  '  </body>',
  '</html>',
].join('\n');

const ROBOTS = '<meta name="robots" content="noindex, nofollow" />';

/** The HTML `handle` produces for a page of `routeId` whose template renders `html`. */
async function prerender(routeId: string | null, html = SHELL): Promise<string> {
  const event = { route: { id: routeId } } as RequestEvent;
  const response = await handle({
    event,
    resolve: async (_event: RequestEvent, options?: ResolveOptions) => {
      const out = (await options?.transformPageChunk?.({ html, done: true })) ?? html;
      return new Response(out);
    },
  });
  return response.text();
}

const count = (html: string, part: string) => html.split(part).length - 1;

describe('hooks.server — the admin shells', () => {
  it.each(['/(admin)/admin/(app)', '/(admin)/admin/acceso', '/(admin)/admin/(app)/cuenta'])(
    '%s gets noindex, nofollow and a title, inside <head>',
    async (routeId) => {
      const html = await prerender(routeId);
      const head = html.slice(0, html.indexOf('</head>'));
      expect(count(head, ROBOTS)).toBe(1);
      expect(head).toContain(`<title>${documentTitle('')}</title>`);
    },
  );

  it('never adds a second robots meta or a second title', async () => {
    const own = SHELL.replace(
      '</head>',
      '<meta name="robots" content="noindex" /><title>Acceso</title></head>',
    );
    const html = await prerender('/(admin)/admin/acceso', own);
    expect(html).toBe(own);
  });

  it('adds only what is missing', async () => {
    const titled = SHELL.replace('</head>', '<title>Acceso</title></head>');
    const html = await prerender('/(admin)/admin/acceso', titled);
    expect(count(html, ROBOTS)).toBe(1);
    expect(count(html, '<title')).toBe(1);
  });

  it('leaves a chunk without </head> alone', async () => {
    const chunk = '<main>…</main></body></html>';
    expect(await prerender('/(admin)/admin/(app)', chunk)).toBe(chunk);
  });
});

describe('hooks.server — public pages', () => {
  it.each(['/', '/kit/button', null])('%s is untouched', async (routeId) => {
    expect(await prerender(routeId)).toBe(SHELL);
  });
});
