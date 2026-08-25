// S18 — the {@html} rule, exercised through the REAL eslint.config.js.
//
// Two things have to be true for MIGRATION.md D-005 to actually be enforced:
// the rule must report the unsafe shapes and stay quiet on the safe ones, AND
// it must be switched on in the config `npm run lint` loads. Every case here
// therefore goes through `new ESLint()` with no config override — a rule that
// worked only under a RuleTester's inline config would prove nothing about CI.
//
// `ignore: false` is what lets the fixtures be linted: eslint.config.js ignores
// tests/fixtures/no-raw-html/ precisely because it contains real violations.
import { ESLint, type Linter } from 'eslint';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const RULE = 'local/no-raw-html';

/** The project config, with ignore patterns off so the fixtures are reachable. */
const eslint = new ESLint({ ignore: false });

const only = (messages: Linter.LintMessage[]) => messages.filter((m) => m.ruleId === RULE);

async function lintFixture(name: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintFiles([`tests/fixtures/no-raw-html/${name}`]);
  return only(result.messages);
}

/**
 * Lint a snippet as if it were a file at `filePath` — the path decides which
 * config blocks (and which parser) apply, so a `.svelte` path really is parsed
 * by svelte-eslint-parser.
 */
async function lintSnippet(code: string, filePath: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return only(result.messages);
}

const svelteFile = (body: string, script = '') =>
  `<script lang="ts">\n${script}\n</script>\n\n${body}\n`;

const PROBE_SVELTE = 'src/lib/components/__no-raw-html-probe.svelte';
const PROBE_TS = 'src/lib/__no-raw-html-probe.ts';

describe('the rule is actually on in the config CI runs', () => {
  it('enables local/no-raw-html as an error for components', async () => {
    const config = await eslint.calculateConfigForFile('src/lib/components/RichText.svelte');
    expect(config.rules?.[RULE]).toEqual([2]);
  });

  it('enables it for plain modules too, so the innerHTML sink is covered', async () => {
    const config = await eslint.calculateConfigForFile('src/lib/components/icon.ts');
    expect(config.rules?.[RULE]).toEqual([2]);
  });

  // The blanket rule is deliberately replaced: it would force an
  // `eslint-disable` at the legitimate sites, after which nothing checks them.
  it('turns svelte/no-at-html-tags off, so the local rule is the only gate', async () => {
    const config = await eslint.calculateConfigForFile('src/lib/components/RichText.svelte');
    expect(config.rules?.['svelte/no-at-html-tags']).toEqual([0]);
  });
});

describe('fixture: a .svelte file with raw {@html} fails', () => {
  let messages: Linter.LintMessage[];

  beforeAll(async () => {
    messages = await lintFixture('forbidden.svelte');
  });

  it('reports both raw tags and the innerHTML sink, and nothing else', () => {
    expect(messages.map((m) => m.messageId)).toEqual(['rawSink', 'rawHtml', 'rawHtml']);
  });

  it('names D-005 and points at RichText in the message', () => {
    expect(messages[1].message).toContain('D-005');
    expect(messages[1].message).toContain('sanitizeHtml() / renderRichText()');
    expect(messages[1].message).toContain('RichText');
  });

  it('anchors each report on the offending line', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/no-raw-html/forbidden.svelte'),
      'utf8',
    ).split('\n');
    for (const message of messages) {
      expect(source[message.line - 1]).toMatch(/@html|innerHTML/);
    }
  });
});

describe('fixture: the sanitized forms pass', () => {
  it('reports nothing for sanitizeHtml() / a $derived / a ternary / the sprite', async () => {
    expect(await lintFixture('allowed.svelte')).toEqual([]);
  });
});

describe('accepted expressions', () => {
  const cases: ReadonlyArray<[string, string, string]> = [
    [
      'a direct sanitizeHtml() call',
      "import { sanitizeHtml } from '$lib/sanitize-html';\nlet v = '';",
      '{@html sanitizeHtml(v)}',
    ],
    [
      'a direct renderRichText() call',
      "import { renderRichText } from '$lib/sanitize-html';\nlet v = '';",
      '{@html renderRichText(v)}',
    ],
    [
      'a namespaced call (import * as s)',
      "import * as s from '$lib/sanitize-html';\nlet v = '';",
      '{@html s.sanitizeHtml(v)}',
    ],
    [
      'a $derived holding sanitizer output',
      "import { renderRichText } from '$lib/sanitize-html';\nlet v = '';\nconst safe = $derived(renderRichText(v));",
      '{@html safe}',
    ],
    [
      'a $derived.by holding sanitizer output',
      "import { sanitizeHtml } from '$lib/sanitize-html';\nlet v = '';\nconst safe = $derived.by(() => sanitizeHtml(v));",
      '{@html safe}',
    ],
    [
      'a ternary whose branches are sanitizer output and an empty string',
      "import { renderRichText } from '$lib/sanitize-html';\nlet v = '';",
      "{@html v ? renderRichText(v) : ''}",
    ],
    [
      'the auto-escaping html`` tag from $lib/escape',
      "import { html } from '$lib/escape';\nlet title = '';",
      '{@html String(html`<h3>${title}</h3>`)}',
    ],
    ['static author-written markup', '', "{@html '<hr>'}"],
  ];

  it.each(cases)('accepts %s', async (_name, script, body) => {
    expect(await lintSnippet(svelteFile(body, script), PROBE_SVELTE)).toEqual([]);
  });
});

describe('rejected expressions', () => {
  // The untrusted value is a prop in most of these: `let v = ''` really IS
  // always safe, and the rule is right to say so — what it must catch is a
  // value that came from outside the component.
  const props = 'let { v }: { v: string } = $props();';

  const cases: ReadonlyArray<[string, string, string]> = [
    ['a bare identifier holding a prop', props, '{@html v}'],
    [
      'an identifier assigned from data after init',
      "let v = '';\nasync function load() { v = await (await fetch('/x')).text(); }",
      '{@html v}<button type="button" onclick={load}>x</button>',
    ],
    ['a template literal with an interpolation', props, '{@html `<b>${v}</b>`}'],
    [
      'a sanitizer that is not ours',
      `const DOMPurify = { sanitize: (s: string) => s };\n${props}`,
      '{@html DOMPurify.sanitize(v)}',
    ],
    [
      'a ternary with one unsanitized branch',
      `import { sanitizeHtml } from '$lib/sanitize-html';\nlet { v, fallback }: { v: string; fallback: string } = $props();`,
      '{@html v ? sanitizeHtml(v) : fallback}',
    ],
    [
      'a variable that is reassigned to something unsafe',
      `import { sanitizeHtml } from '$lib/sanitize-html';\n${props}\nlet out = sanitizeHtml(v);\nfunction taint() { out = v; }`,
      '{@html out}<button type="button" onclick={taint}>x</button>',
    ],
    [
      'a non-asset import (the ?raw carve-out is only for the sprite)',
      "import body from '$lib/notes.md?raw';",
      '{@html body}',
    ],
  ];

  it.each(cases)('rejects %s', async (_name, script, body) => {
    const messages = await lintSnippet(svelteFile(body, script), PROBE_SVELTE);
    expect(messages.map((m) => m.messageId)).toContain('rawHtml');
  });
});

describe('the innerHTML-style sinks (or {@html} is one line away from bypassable)', () => {
  const reject: ReadonlyArray<[string, string]> = [
    [
      'innerHTML assignment',
      'declare const el: HTMLElement;\ndeclare const dirty: string;\nel.innerHTML = dirty;',
    ],
    [
      'outerHTML assignment',
      'declare const el: HTMLElement;\ndeclare const dirty: string;\nel.outerHTML = dirty;',
    ],
    [
      'insertAdjacentHTML',
      "declare const el: HTMLElement;\ndeclare const dirty: string;\nel.insertAdjacentHTML('beforeend', dirty);",
    ],
    ['document.write', 'declare const dirty: string;\ndocument.write(dirty);'],
  ];

  it.each(reject)('rejects %s', async (_name, code) => {
    const messages = await lintSnippet(code, PROBE_TS);
    expect(messages.map((m) => m.messageId)).toEqual(['rawSink']);
  });

  it('accepts sanitizer output', async () => {
    const code = [
      "import { sanitizeHtml } from '$lib/sanitize-html';",
      'declare const el: HTMLElement;',
      'declare const dirty: string;',
      'el.innerHTML = sanitizeHtml(dirty);',
    ].join('\n');
    expect(await lintSnippet(code, PROBE_TS)).toEqual([]);
  });

  it('accepts the bundled sprite (the D-005 carve-out)', async () => {
    const code = [
      "import sprite from '$lib/assets/icons.svg?raw';",
      'declare const el: HTMLElement;',
      'el.innerHTML = sprite;',
    ].join('\n');
    expect(await lintSnippet(code, PROBE_TS)).toEqual([]);
  });

  it('leaves a local write() alone — only document.write is a sink', async () => {
    const code = [
      'declare const dirty: string;',
      'function write(value: string) { return value.length; }',
      'write(dirty);',
    ].join('\n');
    expect(await lintSnippet(code, PROBE_TS)).toEqual([]);
  });
});

describe('the shipped tree obeys its own rule', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(svelte|ts)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  /** Comments quote both patterns constantly — only real code counts here. */
  const code = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const matching = (pattern: RegExp) => {
    const src = resolve(process.cwd(), 'src');
    return walk(src)
      .filter((file) => pattern.test(code(file)))
      .map((file) => relative(src, file).replace(/\\/g, '/'))
      .sort();
  };

  // If a second one ever appears, either it is the next legitimate carve-out
  // (write it down in MIGRATION.md) or it is the bug this session exists to stop.
  it('has exactly one {@html} in src/, in RichText.svelte', () => {
    expect(matching(/\{@html\s/)).toEqual(['lib/components/RichText.svelte']);
  });

  it('has exactly two innerHTML writes in src/: the sprite and the editor', () => {
    expect(matching(/\.(innerHTML|outerHTML)\s*=[^=]/)).toEqual([
      'lib/components/RichTextEditor.svelte',
      'lib/components/icon.ts',
    ]);
  });
});
