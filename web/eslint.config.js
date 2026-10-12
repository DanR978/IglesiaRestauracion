import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import noRawHtml from './eslint-rules/no-raw-html.js';

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
);
