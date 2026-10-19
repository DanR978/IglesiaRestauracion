import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { fileURLToPath } from 'node:url';
import { compilerOptions, preprocess } from './svelte-options';

const stub = (file: string) => fileURLToPath(new URL(`./tests/stubs/${file}`, import.meta.url));

export default defineConfig({
  // S11: runes modules (`*.svelte.ts`, e.g. #lib/theme.svelte.ts) need the
  // Svelte compiler at test time. S02b: Kit 3 has no svelte.config.js for the
  // plugin to read, so it gets the build's own options (svelte-options.ts), and
  // `configFile: false` stops it from looking for one.
  // S13: `.svelte` components are compiled by the same plugin; svelteTesting()
  // registers @testing-library/svelte's per-test cleanup (setupFiles) and keeps
  // the `browser` condition ahead of `node` so mount() gets the client runtime.
  plugins: [svelte({ configFile: false, preprocess, compilerOptions }), svelteTesting()],
  resolve: {
    // Svelte's package exports a server build by default under Node; the
    // `browser` condition picks the client runtime so runes state and
    // svelte/reactivity (MediaQuery) behave as in the page, under jsdom.
    conditions: ['browser'],
    // `#lib/*` needs no alias: it is a package.json subpath import, which Vite
    // resolves natively. The SvelteKit virtual modules are stubbed so unit tests
    // can import config/client without a svelte-kit sync'd environment; the
    // stubs report browser=false — the prerender posture client.ts must be safe
    // under — and $app/paths resolves at base '' (S38). $app/state and
    // $app/navigation (S37) are a runes `page` and router spies that write it.
    // Anchored regexes, because a plain '$app/env' key is a prefix match and
    // would also capture '$app/env/public'.
    alias: [
      { find: /^\$app\/env$/, replacement: stub('app-env.ts') },
      { find: /^\$app\/env\/public$/, replacement: stub('app-env-public.ts') },
      { find: /^\$app\/paths$/, replacement: stub('app-paths.ts') },
      { find: /^\$app\/state$/, replacement: stub('app-state.svelte.ts') },
      { find: /^\$app\/navigation$/, replacement: stub('app-navigation.ts') },
    ],
  },
  test: {
    // G-001: sanitize-html (S07) uses DOMParser — the suite MUST run under
    // jsdom, never plain node.
    environment: 'jsdom',
    // S13: jest-dom matchers (toHaveAttribute, toHaveClass, …) for component tests.
    setupFiles: ['tests/setup.ts'],
    include: [
      'src/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/golden/**/*.test.ts',
      'tests/component/**/*.test.ts',
    ],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
