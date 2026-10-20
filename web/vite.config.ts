import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { compilerOptions, preprocess } from './svelte-options';

/**
 * The SVG sprite's symbol ids (S13). Icon.svelte renders `<use href="#id">`, and the
 * prerender crawler reads every `href` — so without this it fails the build with
 * "no element with id=… exists", because the sprite is injected client-side, never
 * server-rendered. Read from the asset itself so the list cannot drift.
 */
const SPRITE_IDS = new Set(
  [
    ...readFileSync(new URL('./src/lib/assets/icons.svg', import.meta.url), 'utf8').matchAll(
      /<symbol\s+id="([^"]+)"/g,
    ),
  ].map((m) => m[1]),
);

const isRootRelative = (path: string): path is `/${string}` => path.startsWith('/');

/**
 * BASE_PATH narrowed to the shape Kit's config type declares ('' or root-relative). Kit
 * validates the details itself; failing here too names the usual cause on Windows (G-019).
 */
const BASE_PATH = process.env.BASE_PATH ?? '';
if (BASE_PATH !== '' && !isRootRelative(BASE_PATH)) {
  throw new Error(
    `BASE_PATH must be '' or start with '/', got ${JSON.stringify(BASE_PATH)} ` +
      '(G-019: Git Bash rewrites /app — run with MSYS_NO_PATHCONV=1).',
  );
}

/**
 * The SvelteKit config. Kit 3 reads it from `sveltekit({...})` here — there is no
 * svelte.config.js any more (S02b); the Svelte options are shared with Vitest through
 * svelte-options.ts.
 *
 * The new app is served from a SUBPATH (`/app`) until a surface is cut over, then from the
 * domain root (MIGRATION.md D-008 / G-008). `base` therefore comes from BASE_PATH and defaults
 * to '' — the custom domain means the final base is '', never the repo name.
 *
 * No SPA `fallback`: every route is prerendered (an `ssr = false` route still gets its shell,
 * D-036), and GitHub Pages only ever serves the ROOT 404.html, so an `app/404.html` was dead
 * weight (G-021). `strict` keeps a route that cannot be prerendered a build error.
 */
export default defineConfig({
  plugins: [
    sveltekit({
      preprocess,
      compilerOptions,
      adapter: adapter({
        pages: 'build',
        assets: 'build',
        precompress: false,
        strict: true,
      }),
      paths: {
        base: BASE_PATH,
        // Absolute URLs (`/app/_app/…`, and `resolve()` → `/app/…` while prerendering), not
        // relative ones (`./_app/…`): what a page links to never depends on the depth of the
        // URL it is served at (G-020).
        relative: false,
      },
      prerender: {
        entries: ['*'],
        // A sprite `<use href="#id">` is a glyph reference, not a page anchor; every other
        // missing fragment target still fails the build (the default).
        handleMissingId: ({ id, message }) => {
          if (!SPRITE_IDS.has(id)) throw new Error(message);
        },
      },
    }),
  ],
});
