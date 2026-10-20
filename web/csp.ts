/* ============================================================================
 * web/csp.ts — the Content-Security-Policy of /app (D-037)
 * ----------------------------------------------------------------------------
 * One policy for every page of /app, public kit pages included, in Kit's
 * hash mode: every page is prerendered, so Kit writes it as a
 * <meta http-equiv> and adds the sha256 of each inline script it generates
 * (the boot script of every page). What Kit does not hash, this adds:
 *
 *   script-src   'self', the pinned cdnjs (pdfmake / pdf.js, S09), and the
 *                hash of app.html's theme boot script, computed from
 *                THEME_BOOT_SCRIPT here so it can never drift from the copy
 *                tests/unit/theme.test.ts holds byte-identical in app.html
 *   script-src-attr  'unsafe-hashes' + the hash of `this.__e=event`, the one
 *                inline handler Svelte writes: a server-rendered element with
 *                an onload / onerror handler gets onload="this.__e=event" so
 *                the client can replay an event that fired before hydration
 *                (an <img> that failed early). That exact text and no other
 *                handler: an attacker's onclick= still never runs.
 *   worker-src   'self' blob: cdnjs — pdf.js runs its worker from either
 *   style-src    'self' cdnjs (Font Awesome, S13); no inline <style> ships
 *   style-src-attr 'unsafe-inline' — style ATTRIBUTES only: D-005-sanitized
 *                rich text keeps its inline styles, Svelte's style: output,
 *                the icon sprite, Kit's display: contents wrapper. Scripts
 *                stay strict; an attribute cannot run code.
 *   font-src     'self' cdnjs (Font Awesome's webfonts)
 *   img-src      'self' data: blob: + the Supabase origin (avatars, storage);
 *                data: for the authenticator QR code, blob: for previews
 *   connect-src  'self' (Kit polls version.json, G-037) + the Supabase API
 *                and its realtime socket
 *   object-src 'none' · base-uri 'none' · form-action 'self'
 *
 * The Supabase sources come from the build's own PUBLIC_SUPABASE_URL, so
 * production, the mocked e2e build and the local-stack build each allow
 * exactly their own backend: an https URL gives that origin over https and
 * wss; a plain-http URL — src/env.ts allows one only on a loopback host —
 * gives that exact origin over http and ws.
 *
 * Not here: frame-ancestors, which a <meta> cannot carry (Kit drops it) and
 * GitHub Pages sends no headers for; the admin's script frame guard refuses
 * to render inside a frame instead (shell.ts isFramed, D-037). A <meta>
 * policy covers what follows it, so app.html's favicon, Font Awesome link
 * and theme script (all before %sveltekit.head%) load before it applies; the
 * hash keeps the theme script allowed if the policy ever arrives as a header.
 *
 * Usage (vite.config.ts):
 *   csp: { mode: 'hash', directives: cspDirectives(env.PUBLIC_SUPABASE_URL) }
 * ========================================================================== */
import type { sveltekit } from '@sveltejs/kit/vite';
import { createHash } from 'node:crypto';
import { THEME_BOOT_SCRIPT } from './src/lib/theme-boot';

type CspDirectives = NonNullable<
  NonNullable<NonNullable<Parameters<typeof sveltekit>[0]>['csp']>['directives']
>;
/** One source of a directive, as Kit types it. */
type CspSource = NonNullable<CspDirectives['connect-src']>[number];

/** The pinned CDN app.html and the PDF loaders use (S09, S13). */
export const CDN = 'https://cdnjs.cloudflare.com';

/** Svelte's server-rendered event-replay handler (see script-src-attr above). */
export const SVELTE_EVENT_REPLAY = 'this.__e=event';

/** Hosts a plain-http Supabase URL may name (as src/env.ts). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A CSP hash source for an inline script or style: `sha256-<base64>`. */
export function sha256Source(content: string): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}`;
}

/**
 * The Supabase origin and its realtime socket's, from PUBLIC_SUPABASE_URL:
 * https → https + wss; plain http, on a loopback host only → http + ws.
 */
export function supabaseOrigins(raw: string): { api: CspSource; socket: CspSource } {
  const url = new URL(raw);
  const origin = (scheme: string) => `${scheme}://${url.host}` as CspSource;
  if (url.protocol === 'https:') return { api: origin('https'), socket: origin('wss') };
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) {
    return { api: origin('http'), socket: origin('ws') };
  }
  throw new Error('PUBLIC_SUPABASE_URL must be https (plain http only on localhost/127.0.0.1)');
}

/**
 * The directives for Kit's `csp` option. Without a Supabase URL (a command
 * that only loads the config, like `svelte-kit sync`) the backend is left
 * out; a build never gets that far — src/env.ts refuses an empty URL.
 */
export function cspDirectives(supabaseUrl: string | undefined): CspDirectives {
  const supabase = supabaseUrl ? supabaseOrigins(supabaseUrl) : null;
  return {
    'default-src': ['self'],
    'script-src': ['self', CDN, sha256Source(THEME_BOOT_SCRIPT)],
    'script-src-attr': ['unsafe-hashes', sha256Source(SVELTE_EVENT_REPLAY)],
    'worker-src': ['self', 'blob:', CDN],
    'style-src': ['self', CDN],
    'style-src-attr': ['unsafe-inline'],
    'font-src': ['self', CDN],
    'img-src': ['self', 'data:', 'blob:', ...(supabase ? [supabase.api] : [])],
    'connect-src': ['self', ...(supabase ? [supabase.api, supabase.socket] : [])],
    'object-src': ['none'],
    'base-uri': ['none'],
    'form-action': ['self'],
  };
}
