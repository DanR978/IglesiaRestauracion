/* ============================================================================
 * web/src/lib/test/css.ts — test helpers for the global stylesheet (S11)
 * ----------------------------------------------------------------------------
 * The token/baseline tests assert on the CSS TEXT (Vitest has no layout
 * engine). These helpers read src/lib/styles/app.css, inline its @imports in
 * order (the same thing Vite does at build), and give a light-weight way to
 * pull declarations out of a block without a CSS parser dependency.
 *
 * Usage:
 *   import { bundleAppCss, stylesDir, listCssFiles, blockOf, declarations } from '$lib/test/css';
 * ========================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const stylesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../styles');
export const appCssPath = join(stylesDir, 'app.css');

const IMPORT_RE = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;

/** Read one stylesheet and recursively inline its relative @imports, in order. */
export function bundleCss(file: string, seen = new Set<string>()): string {
  const abs = resolve(file);
  if (seen.has(abs)) return '';
  seen.add(abs);
  const text = readFileSync(abs, 'utf8');
  return text.replace(IMPORT_RE, (_m, spec: string) =>
    bundleCss(resolve(dirname(abs), spec), seen),
  );
}

/** The bundled global stylesheet, exactly as the root layout loads it. */
export function bundleAppCss(): string {
  return bundleCss(appCssPath);
}

/** Relative @import specifiers of app.css, in cascade order. */
export function appCssImports(): string[] {
  const text = readFileSync(appCssPath, 'utf8');
  return [...text.matchAll(IMPORT_RE)].map((m) => m[1]);
}

/** Every .css file under src/lib/styles (relative paths, forward slashes). */
export function listCssFiles(dir = stylesDir, base = stylesDir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listCssFiles(full, base));
    else if (name.endsWith('.css')) out.push(full.slice(base.length + 1).replace(/\\/g, '/'));
  }
  return out.sort();
}

export function readStyle(rel: string): string {
  return readFileSync(join(stylesDir, rel), 'utf8');
}

/** Strip block comments so a token mentioned in prose does not count. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Body of the first `{ … }` block whose selector text (the run of characters
 * before `{`) is exactly `selector`, at any nesting depth. Returns '' if absent.
 */
export function blockOf(css: string, selector: string): string {
  const src = stripComments(css);
  let from = 0;
  for (;;) {
    const open = src.indexOf('{', from);
    if (open < 0) return '';
    const head = src.slice(src.lastIndexOf('}', open) + 1, open);
    const sel = head.slice(head.lastIndexOf('{') + 1).trim();
    if (sel === selector) {
      let depth = 1;
      let i = open + 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
      }
      return src.slice(open + 1, i - 1);
    }
    from = open + 1;
  }
}

/** `--name: value` pairs of a block body, in source order. */
export function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of stripComments(body).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Custom-property names declared in a block body (with duplicates kept). */
export function declaredNames(body: string): string[] {
  return [...stripComments(body).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
}
