#!/usr/bin/env node
// Inlines src/header.html, src/footer.html, src/contact-form.html into the
// matching <header id="header">, <footer id="footer">, <section id="contact-form">
// hosts in every page's index.html. Runs in CI before the Pages upload so
// non-JS crawlers (ClaudeBot, GPTBot, PerplexityBot, Bytespider) see the
// navigation, address, and contact form in the initial HTML.
//
// Idempotent: a sentinel comment pair delimits the inlined region, so re-runs
// refresh content in place without breaking on the nested <footer> inside
// footer.html or the nested <form> inside contact-form.html.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.github', 'src', 'seo', 'supabase',
  'resources', 'css', 'js', 'scripts', 'admin'
]);

const INCLUDES = [
  {
    name: 'header',
    fragment: 'src/header.html',
    hostRegex: /(<header\s+[^>]*\bid="header"[^>]*>)\s*(<\/header>)/,
  },
  {
    name: 'footer',
    fragment: 'src/footer.html',
    hostRegex: /(<footer\s+id="footer"\s*>)\s*(<\/footer>)/,
  },
  {
    name: 'contact-form',
    fragment: 'src/contact-form.html',
    hostRegex: /(<section\s+id="contact-form"\s*>)\s*(<\/section>)/,
  },
];

function findPageHtml(dir, depth, out) {
  if (depth > 2) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findPageHtml(full, depth + 1, out);
    } else if (entry === 'index.html' || (depth === 0 && entry === 'index.html')) {
      out.push(full);
    }
  }
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inlineOne(html, fragment, name) {
  const startSentinel = `<!-- BUILD-INLINE:${name} -->`;
  const endSentinel = `<!-- /BUILD-INLINE:${name} -->`;

  if (html.includes(startSentinel) && html.includes(endSentinel)) {
    const re = new RegExp(
      `${escapeForRegex(startSentinel)}[\\s\\S]*?${escapeForRegex(endSentinel)}`
    );
    return {
      html: html.replace(re, `${startSentinel}\n${fragment}\n${endSentinel}`),
      action: 'refreshed',
    };
  }

  const include = INCLUDES.find(i => i.name === name);
  const m = html.match(include.hostRegex);
  if (!m) return { html, action: 'no-host' };

  const replaced = html.replace(
    include.hostRegex,
    (_, open, close) => `${open}\n${startSentinel}\n${fragment}\n${endSentinel}\n${close}`
  );
  return { html: replaced, action: 'inlined' };
}

function processFile(filePath, fragments) {
  let html = readFileSync(filePath, 'utf8');
  const original = html;
  const actions = {};

  for (const inc of INCLUDES) {
    const fragment = fragments[inc.name];
    if (!fragment) continue;
    const result = inlineOne(html, fragment, inc.name);
    html = result.html;
    actions[inc.name] = result.action;
  }

  if (html !== original) {
    writeFileSync(filePath, html, 'utf8');
  }
  return actions;
}

function main() {
  const fragments = {};
  for (const inc of INCLUDES) {
    try {
      fragments[inc.name] = readFileSync(resolve(ROOT, inc.fragment), 'utf8').trimEnd();
    } catch {
      console.warn(`[inline] fragment missing: ${inc.fragment} (skipping)`);
    }
  }

  const pages = [];
  findPageHtml(ROOT, 0, pages);
  const rootIndex = resolve(ROOT, 'index.html');
  if (!pages.includes(rootIndex)) {
    try { statSync(rootIndex); pages.push(rootIndex); } catch {}
  }

  let totalChanged = 0;
  for (const file of pages) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const actions = processFile(file, fragments);
    const summary = Object.entries(actions)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    const changed = Object.values(actions).some(a => a === 'inlined' || a === 'refreshed');
    if (changed) totalChanged++;
    console.log(`[inline] ${rel}: ${summary}`);
  }

  console.log(`[inline] done — ${totalChanged}/${pages.length} files modified`);
}

main();
