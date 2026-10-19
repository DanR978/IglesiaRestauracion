import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import noRawHtml from './eslint-rules/no-raw-html.js';

/*
 * S05b — layer import boundaries (docs/architecture/target-architecture.md §3).
 * One pattern per layer, matching the `#lib/…` subpath import and any relative
 * path into the same folder (`../db/client.js`, `../../lib/repos/events.js`).
 * Each block below lists everything its layer may NOT import: in flat config a
 * later block replaces an earlier block's `no-restricted-imports` options for
 * the files it matches, so no block relies on another's list.
 */
const into = (folder) => `^(?:[#$]lib/|(?:\\.{1,2}/)+(?:lib/)?)${folder}`;
const LAYER = {
  db: {
    regex: `${into('db')}(?:/|$)`,
    message: 'Primitives, platform helpers and pure libs stay off db/* (target-architecture §3).',
  },
  dbClient: {
    regex: `${into('db/client')}(?:\\.[jt]s)?$`,
    message: 'Only repos and the S38 session store import db/client (target-architecture §3).',
  },
  repos: {
    regex: `${into('repos')}(?:/|$)`,
    message: 'Primitives, platform helpers and pure libs never fetch (target-architecture §3).',
  },
  platform: {
    regex: `${into('platform')}(?:/|$)`,
    message: 'Primitives and pure libs stay context-agnostic (target-architecture §3).',
  },
  components: {
    regex: `${into('components')}(?:/|$)`,
    message: 'Repos, stores, platform and pure libs never import UI (target-architecture §3).',
  },
  stores: {
    regex: `${into('stores')}(?:/|$)`,
    message: 'Repos, platform and pure libs never import app state (target-architecture §3).',
  },
};
const restrict = (...layers) => ['error', { patterns: layers }];

export default ts.config(
  {
    ignores: [
      'build/',
      '.svelte-kit/',
      'coverage/',
      'node_modules/',
      'test-results/',
      // Deliberately contains the violations local/no-raw-html must catch, so
      // `eslint .` must not see it. tests/unit/no-raw-html.test.ts lints these
      // files itself and asserts the exact reports.
      'tests/fixtures/no-raw-html/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // `.svelte.ts` runes modules (S11: theme.svelte.ts) go through the Svelte
    // parser too and need the TS sub-parser for their script content.
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    // S18 — MIGRATION.md D-005 as a CI gate. `svelte/no-at-html-tags` (on in
    // flat/recommended) bans the tag outright, which would force a blanket
    // eslint-disable at the two legitimate sites and stop checking them from
    // then on. local/no-raw-html allows exactly the sanitized forms and nothing
    // else, and additionally covers the innerHTML-style sinks that would
    // otherwise route around it. See web/eslint-rules/no-raw-html.js.
    plugins: { local: { rules: { 'no-raw-html': noRawHtml } } },
    rules: {
      'svelte/no-at-html-tags': 'off',
      'local/no-raw-html': 'error',
    },
  },
  {
    // Routes, feature components (components/<feature>/**) and everything not
    // matched below: the typed client only through a repo.
    files: ['src/**/*.{ts,js,svelte}'],
    ignores: ['src/lib/repos/**', 'src/lib/db/**', 'src/lib/stores/session.svelte.ts'],
    rules: { 'no-restricted-imports': restrict(LAYER.dbClient) },
  },
  {
    // Primitives: presentational; their own host stores are fine.
    files: ['src/lib/components/*.{ts,js,svelte}'],
    rules: { 'no-restricted-imports': restrict(LAYER.db, LAYER.repos, LAYER.platform) },
  },
  {
    files: ['src/lib/repos/**/*.{ts,js}'],
    rules: { 'no-restricted-imports': restrict(LAYER.components, LAYER.stores) },
  },
  {
    files: ['src/lib/stores/**/*.{ts,js}'],
    ignores: ['src/lib/stores/session.svelte.ts'],
    rules: { 'no-restricted-imports': restrict(LAYER.components, LAYER.dbClient) },
  },
  {
    // S38's session store is the one auth module allowed the client.
    files: ['src/lib/stores/session.svelte.ts'],
    rules: { 'no-restricted-imports': restrict(LAYER.components) },
  },
  {
    // Created only when CC1 shows a need: pure libs and nothing else.
    files: ['src/lib/platform/**/*.{ts,js,svelte}'],
    rules: {
      'no-restricted-imports': restrict(LAYER.components, LAYER.stores, LAYER.repos, LAYER.db),
    },
  },
  {
    // Pure libs (src/lib/*.ts): each other only.
    files: ['src/lib/*.{ts,js}'],
    rules: {
      'no-restricted-imports': restrict(
        LAYER.components,
        LAYER.stores,
        LAYER.repos,
        LAYER.db,
        LAYER.platform,
      ),
    },
  },
);
