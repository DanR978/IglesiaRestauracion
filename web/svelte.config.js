import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

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

/**
 * The new app is served from a SUBPATH (`/app`) until a surface is cut over, then from the
 * domain root (MIGRATION.md D-008 / G-008). `base` therefore comes from BASE_PATH and defaults
 * to '' — the custom domain means the final base is '', never the repo name.
 *
 * `fallback` makes the static host answer a deep link it has no prerendered file for
 * (e.g. /app/admin/gallery), which is what the admin route group relies on from S37 on.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html',
      precompress: false,
      strict: true,
    }),
    paths: {
      base: process.env.BASE_PATH ?? '',
      // Absolute asset URLs (`/app/_app/…`), not relative (`./_app/…`). The fallback page is
      // served at ARBITRARY depth (/app/admin/gallery), where a relative href would resolve to
      // /app/admin/_app/… and 404. Absolute keeps every page and the fallback consistent, and
      // makes `base` resolve to '/app' at runtime instead of '.'.
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
  },
};

export default config;
