/* ============================================================================
 * web/scripts/check-budget.mjs — initial-JS budget per prerendered page (box 17)
 * ----------------------------------------------------------------------------
 * For every HTML page in build/ it collects the JavaScript the page loads up
 * front — <link rel="modulepreload">, <script src>, and the import("…") calls
 * in Kit's inline boot script — and sums the gzip size (level 9) of each file
 * once. The total is compared with web/budget.json: a page over
 * baseline × (1 + tolerance) fails, and so does a page with no baseline or a
 * baseline with no page, so the file always describes the build. No
 * dependency: node:fs + node:zlib.
 *
 * Measure the deployable build — run it after `BASE_PATH=/app npm run build`
 * (on Windows Git Bash: MSYS_NO_PATHCONV=1, G-019). Any base works: absolute
 * URLs are matched to build/ by dropping their leading segments.
 *
 * Raising a baseline is a reviewed decision: `--update` rewrites every entry
 * from build/, and the budget.json diff is what the PR reviewer approves.
 *
 * Usage:
 *   npm run budget               # check build/ against budget.json
 *   npm run budget -- --update   # record build/ as the new baseline
 * ========================================================================== */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
const BUILD_DIR = join(WEB_DIR, 'build');
const BUDGET_FILE = join(WEB_DIR, 'budget.json');
const DEFAULT_TOLERANCE = 0.05;

const LINK_TAG = /<link\b[^>]*>/gi;
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const DYNAMIC_IMPORT = /\bimport\(\s*(["'])([^"']+?\.m?js)\1\s*\)/g;

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

/** Every *.html under build/, as paths relative to it with forward slashes. */
function htmlPages(dir = BUILD_DIR) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlPages(path);
    return entry.name.endsWith('.html') ? [relative(BUILD_DIR, path).split(sep).join('/')] : [];
  });
}

/** `kit/button/index.html` → `/kit/button/`; `index.html` → `/`. */
function routeOf(page) {
  return page.endsWith('index.html') ? `/${page.slice(0, -'index.html'.length)}` : `/${page}`;
}

/** The script URLs a page requests before any interaction. */
function initialScripts(html) {
  const urls = new Set();
  for (const [tag] of html.matchAll(LINK_TAG)) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const href = attribute(tag, 'href');
    if (href && rel.includes('modulepreload')) urls.add(href);
  }
  for (const [, attrs, body] of html.matchAll(SCRIPT_TAG)) {
    const src = attribute(`<script ${attrs}>`, 'src');
    if (src) urls.add(src);
    else for (const match of body.matchAll(DYNAMIC_IMPORT)) urls.add(match[2]);
  }
  return [...urls];
}

/**
 * The build/ file behind a URL, or null for an off-site script. A root-relative
 * URL carries the base (`/app/_app/…`), so leading segments are dropped until
 * one names a file; a relative URL resolves against the page's directory.
 */
function fileFor(url, page) {
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(url)) return null;
  const clean = url.split(/[?#]/)[0];
  if (!clean.startsWith('/')) {
    const file = posix.normalize(posix.join(posix.dirname(page), clean));
    if (existsSync(join(BUILD_DIR, file))) return file;
    throw new Error(`${page}: ${url} does not resolve to a file in build/`);
  }
  const segments = clean.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i += 1) {
    const file = segments.slice(i).join('/');
    if (existsSync(join(BUILD_DIR, file))) return file;
  }
  throw new Error(`${page}: ${url} does not resolve to a file in build/`);
}

const gzipCache = new Map();
function gzipBytes(file) {
  if (!gzipCache.has(file)) {
    gzipCache.set(file, gzipSync(readFileSync(join(BUILD_DIR, file)), { level: 9 }).length);
  }
  return gzipCache.get(file);
}

/** route → { bytes, files, external } for every prerendered page. */
function measure() {
  const result = new Map();
  for (const page of htmlPages().sort()) {
    const html = readFileSync(join(BUILD_DIR, page), 'utf8');
    const files = new Set();
    const external = [];
    for (const url of initialScripts(html)) {
      const file = fileFor(url, page);
      if (file === null) external.push(url);
      else files.add(file);
    }
    const bytes = [...files].reduce((sum, file) => sum + gzipBytes(file), 0);
    result.set(routeOf(page), { bytes, files: files.size, external });
  }
  return result;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

function main() {
  if (!existsSync(BUILD_DIR)) {
    process.stderr.write('check-budget: no build/ — run `BASE_PATH=/app npm run build` first.\n');
    return 1;
  }
  const measured = measure();
  if (measured.size === 0) {
    process.stderr.write('check-budget: build/ holds no HTML pages.\n');
    return 1;
  }

  if (process.argv.includes('--update')) {
    const previous = existsSync(BUDGET_FILE) ? JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) : {};
    const budget = {
      $comment:
        'Initial JS per prerendered page: gzip (level 9) bytes of every script the HTML ' +
        'loads up front. Checked by scripts/check-budget.mjs (VERIFICATION box 17); a page ' +
        'may grow by `tolerance` over its baseline. Raise a baseline only in a reviewed PR.',
      tolerance: previous.tolerance ?? DEFAULT_TOLERANCE,
      pages: Object.fromEntries([...measured].map(([route, { bytes }]) => [route, bytes])),
    };
    writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`);
    process.stdout.write(`check-budget: recorded ${measured.size} pages in budget.json\n`);
    return 0;
  }

  if (!existsSync(BUDGET_FILE)) {
    process.stderr.write('check-budget: no budget.json — record one with `--update`.\n');
    return 1;
  }
  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
  const tolerance = budget.tolerance ?? DEFAULT_TOLERANCE;
  const pages = budget.pages ?? {};
  const failures = [];

  process.stdout.write(
    `Initial JS per page (gzip), limit = baseline + ${Math.round(tolerance * 100)}%\n`,
  );
  for (const [route, { bytes, files, external }] of measured) {
    const baseline = pages[route];
    if (typeof baseline !== 'number') {
      failures.push(`${route}: no baseline in budget.json (measured ${kb(bytes)})`);
      process.stdout.write(`  ${route.padEnd(28)} ${kb(bytes).padStart(9)}   no baseline\n`);
      continue;
    }
    const limit = Math.floor(baseline * (1 + tolerance));
    const delta = (((bytes - baseline) / baseline) * 100).toFixed(1);
    const signed = Number(delta) > 0 ? `+${delta}` : Number(delta) < 0 ? delta : '±0.0';
    const status = bytes > limit ? 'OVER' : 'ok';
    process.stdout.write(
      `  ${route.padEnd(28)} ${kb(bytes).padStart(9)} / ${kb(limit).padStart(9)}  ` +
        `${`${signed}%`.padStart(7)}  ${String(files).padStart(2)} files  ${status}\n`,
    );
    if (bytes > limit) {
      failures.push(
        `${route}: ${kb(bytes)} is over its ${kb(limit)} limit (baseline ${kb(baseline)})`,
      );
    }
    for (const url of external) {
      process.stdout.write(`    off-site script, not measured: ${url}\n`);
    }
  }
  for (const route of Object.keys(pages)) {
    if (!measured.has(route)) {
      failures.push(`${route}: in budget.json but not in build/ — remove it`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`\ncheck-budget: ${failures.length} problem(s)\n`);
    for (const failure of failures) process.stderr.write(`  ✗ ${failure}\n`);
    return 1;
  }
  process.stdout.write(`check-budget: ${measured.size} pages within budget\n`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  // An unresolvable script URL or an unreadable budget.json: say which, no trace.
  process.stderr.write(`check-budget: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
