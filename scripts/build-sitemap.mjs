#!/usr/bin/env node
// scripts/build-sitemap.mjs
// Generates sitemap.xml from the canonical list of indexable pages, with an
// accurate <lastmod> taken from each page's last git commit date (falling back
// to today if git history isn't available). Only index-able pages are listed:
// noindex pages (discipulado/grupo, pastor) and the admin console are excluded.

import { writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.irdlex.org';

// loc path (folder, with trailing slash) → source file + sitemap hints.
const PAGES = [
  { path: '/',                       file: 'index.html',                       priority: '1.0', freq: 'weekly'  },
  { path: '/visitanos/',             file: 'visitanos/index.html',             priority: '0.9', freq: 'monthly' },
  { path: '/discipulado/',           file: 'discipulado/index.html',           priority: '0.9', freq: 'weekly'  },
  { path: '/quienes-somos/',         file: 'quienes-somos/index.html',         priority: '0.8', freq: 'monthly' },
  { path: '/lideres/',               file: 'lideres/index.html',               priority: '0.7', freq: 'monthly' },
  { path: '/proximos-pasos/',        file: 'proximos-pasos/index.html',        priority: '0.8', freq: 'monthly' },
  { path: '/galeria/',               file: 'galeria/index.html',               priority: '0.8', freq: 'weekly'  },
  { path: '/sermones/',              file: 'sermones/index.html',              priority: '0.8', freq: 'weekly'  },
  { path: '/contacto/',              file: 'contacto/index.html',              priority: '0.7', freq: 'monthly' },
  { path: '/vision-valores/',        file: 'vision-valores/index.html',        priority: '0.7', freq: 'monthly' },
  { path: '/doctrina/',              file: 'doctrina/index.html',              priority: '0.7', freq: 'monthly' },
  { path: '/donacion/',              file: 'donacion/index.html',              priority: '0.7', freq: 'monthly' },
  { path: '/eventos/',               file: 'eventos/index.html',               priority: '0.7', freq: 'weekly'  },
  { path: '/calendario/',            file: 'calendario/index.html',            priority: '0.6', freq: 'weekly'  },
  { path: '/galeria/album/',         file: 'galeria/album/index.html',         priority: '0.6', freq: 'weekly'  },
  { path: '/linktree/',              file: 'linktree/index.html',              priority: '0.5', freq: 'monthly' },
  { path: '/poliza-de-privacidad/',  file: 'poliza-de-privacidad/index.html',  priority: '0.3', freq: 'yearly'  },
];

function lastmod(file) {
  try {
    const d = execSync(`git log -1 --format=%cs -- "${file}"`, { cwd: ROOT, encoding: 'utf8' }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch { /* not a git checkout */ }
  try { return statSync(resolve(ROOT, file)).mtime.toISOString().slice(0, 10); } catch { return ''; }
}

const urls = PAGES.map(p => {
  const lm = lastmod(p.file);
  return `  <url>
    <loc>${BASE}${p.path}</loc>${lm ? `\n    <lastmod>${lm}</lastmod>` : ''}
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`;
}).join('\n\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urls}

</urlset>
`;

writeFileSync(resolve(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log(`[sitemap] wrote ${PAGES.length} urls`);
