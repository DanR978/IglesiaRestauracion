import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      compilerOptions: { runes: true },
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
    }),
  ],
});
