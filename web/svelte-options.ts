/* ============================================================================
 * web/svelte-options.ts — the Svelte compile options, in one place (S02b)
 * ----------------------------------------------------------------------------
 * Kit 3 has no svelte.config.js (it refuses to start when one exists): the
 * app's options live in `sveltekit({...})` in vite.config.ts. Vitest does not
 * run the Kit plugin — it compiles components and `.svelte.ts` runes modules
 * with the bare vite-plugin-svelte — so both configs import these values from
 * here, and a test can never compile under different options than the build.
 *
 * Deliberately NOT named svelte.config.*: Kit 3 errors on that name and
 * vite-plugin-svelte would auto-load it.
 *
 * Usage:
 *   import { compilerOptions, preprocess } from './svelte-options';
 * ========================================================================== */
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import type { CompileOptions } from 'svelte/compiler';

/** `<script lang="ts">` and `<style>` go through Vite's own transforms. */
export const preprocess = vitePreprocess();

/** Runes everywhere (S02): a legacy-mode component cannot slip in. */
export const compilerOptions = { runes: true } satisfies CompileOptions;
