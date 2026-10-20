// D-037 — web/csp.ts, the policy every /app page carries: the directives as
// documented; the Supabase sources derived from the build's own
// PUBLIC_SUPABASE_URL (https → https + wss; plain http on a loopback host →
// http + ws for that exact origin; nothing else); the theme boot script's
// hash, which must be the hash of the script app.html actually inlines; and
// the one inline handler allowed, which must be the text Svelte's server
// renderer writes.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { CDN, SVELTE_EVENT_REPLAY, cspDirectives, sha256Source, supabaseOrigins } from '../../csp';

const PROJECT = 'https://abcdefghijklmnop.supabase.co';

describe('supabaseOrigins', () => {
  it('an https project URL: the origin over https, its realtime socket over wss', () => {
    expect(supabaseOrigins(PROJECT)).toEqual({
      api: 'https://abcdefghijklmnop.supabase.co',
      socket: 'wss://abcdefghijklmnop.supabase.co',
    });
    expect(supabaseOrigins(`${PROJECT}/`).api).toBe('https://abcdefghijklmnop.supabase.co');
  });

  it('the local stack (plain http on loopback): that exact origin over http and ws', () => {
    expect(supabaseOrigins('http://127.0.0.1:54321')).toEqual({
      api: 'http://127.0.0.1:54321',
      socket: 'ws://127.0.0.1:54321',
    });
    expect(supabaseOrigins('http://[::1]:54321').socket).toBe('ws://[::1]:54321');
  });

  it('the mocked e2e build (same-origin /__supabase): the preview origin, path dropped', () => {
    expect(supabaseOrigins('http://localhost:4191/__supabase')).toEqual({
      api: 'http://localhost:4191',
      socket: 'ws://localhost:4191',
    });
  });

  it.each(['http://abcdefghijklmnop.supabase.co', 'http://10.0.0.5:54321', 'ftp://localhost'])(
    'refuses %s, as src/env.ts does',
    (url) => {
      expect(() => supabaseOrigins(url)).toThrow(/must be https/);
    },
  );
});

describe('cspDirectives', () => {
  const theme = (): string => {
    const html = readFileSync(resolve(process.cwd(), 'src/app.html'), 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline).toHaveLength(1);
    return inline[0];
  };

  it('production: every directive as documented, the backend over https and wss', () => {
    expect(cspDirectives(PROJECT)).toEqual({
      'default-src': ['self'],
      'script-src': ['self', CDN, sha256Source(theme())],
      'script-src-attr': ['unsafe-hashes', sha256Source(SVELTE_EVENT_REPLAY)],
      'worker-src': ['self', 'blob:', CDN],
      'style-src': ['self', CDN],
      'style-src-attr': ['unsafe-inline'],
      'font-src': ['self', CDN],
      'img-src': ['self', 'data:', 'blob:', 'https://abcdefghijklmnop.supabase.co'],
      'connect-src': [
        'self',
        'https://abcdefghijklmnop.supabase.co',
        'wss://abcdefghijklmnop.supabase.co',
      ],
      'object-src': ['none'],
      'base-uri': ['none'],
      'form-action': ['self'],
    });
  });

  it('the local stack: http and ws for 127.0.0.1:54321, and no https anywhere for it', () => {
    const csp = cspDirectives('http://127.0.0.1:54321');
    expect(csp['connect-src']).toEqual(['self', 'http://127.0.0.1:54321', 'ws://127.0.0.1:54321']);
    expect(csp['img-src']).toEqual(['self', 'data:', 'blob:', 'http://127.0.0.1:54321']);
  });

  it('without a URL (config loaded by svelte-kit sync), no backend at all', () => {
    const csp = cspDirectives(undefined);
    expect(csp['connect-src']).toEqual(['self']);
    expect(csp['img-src']).toEqual(['self', 'data:', 'blob:']);
  });

  it("allows app.html's theme boot script by the hash a browser computes for it", () => {
    const expected = `sha256-${createHash('sha256').update(theme()).digest('base64')}`;
    expect(cspDirectives(PROJECT)['script-src']).toContain(expected);
  });

  it("allows exactly the event-replay handler Svelte's server renderer writes", () => {
    const { js } = compile('<img src="x.png" alt="" onerror={() => {}} onload={() => {}} />', {
      generate: 'server',
    });
    const handlers = [...js.code.matchAll(/\s(on(?:error|load))="([^"]*)"/g)];
    expect(handlers.map(([, name]) => name).sort()).toEqual(['onerror', 'onload']);
    for (const [, , text] of handlers) expect(text).toBe(SVELTE_EVENT_REPLAY);
    expect(cspDirectives(PROJECT)['script-src-attr']).toEqual([
      'unsafe-hashes',
      `sha256-${createHash('sha256').update(SVELTE_EVENT_REPLAY).digest('base64')}`,
    ]);
  });

  it('never allows inline scripts, eval or a wildcard', () => {
    const all = Object.values(cspDirectives(PROJECT)).flat();
    expect(cspDirectives(PROJECT)['script-src']).not.toContain('unsafe-inline');
    expect(all).not.toContain('unsafe-eval');
    expect(all).not.toContain('*');
    expect(cspDirectives(PROJECT)['style-src']).not.toContain('unsafe-inline');
  });
});
