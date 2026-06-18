#!/usr/bin/env node
// scripts/build-heads.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the <head> of every public page.
//
// The head boilerplate (charset, viewport, favicons, PWA tags, preconnect,
// fonts, Font Awesome, analytics) used to be hand-copied into ~17 files, which
// is how doctrina ended up with empty favicons + empty og:image, several pages
// lost the PWA/theme-color tags, and the title separator drifted between "|"
// and "·". This builder regenerates the head from:
//
//   1. a shared template (the boilerplate — edited in ONE place here), plus
//   2. a per-page data map (title + per-page SEO knobs), plus
//   3. values PRESERVED from each page so nothing hand-crafted is lost:
//        • <meta name="description">      (kept verbatim)
//        • <link rel="canonical">         (kept verbatim)
//        • every <script type="application/ld+json"> block (kept verbatim)
//        • <meta name="google-site-verification">
//        • og:image (kept if already set, else the site default)
//
// Idempotent: the generated region is delimited by BUILD-HEAD sentinels, so the
// preserve-by-extraction step reads the ORIGINAL values from the first run and
// re-uses them on every subsequent run. Run before scripts/inline-includes.mjs
// (they touch <head> and <body> respectively, so order is independent).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BRAND     = 'Iglesia Restauración Divina';
const SUPABASE  = 'https://snqwxgyhfiinouewxgiy.supabase.co';
const WEBIMG    = `${SUPABASE}/storage/v1/object/public/web-images`;
const DEFAULT_OG = `${WEBIMG}/canonical_website_visit.png`;
const LIGHT_ICO  = `${WEBIMG}/light-church-logo.ico`;
const DARK_ICO   = `${WEBIMG}/dark-church-logo.ico`;

// Per-page data. Title is normalized here (separator "·", consistent brand
// suffix). ogTitle/ogDescription default to the page title/description.
// Everything else (description, canonical, JSON-LD, verification) is preserved
// from the page itself, so this map stays small and low-risk.
const PAGES = {
  'index.html': {
    title: 'Iglesia Cristiana Hispana en Lexington, KY · Restauración Divina',
    ogTitle: `IRDLex · ${BRAND} · Lexington, KY`,
    ogType: 'website',
  },
  'quienes-somos/index.html':       { title: `Quiénes Somos · ${BRAND}` },
  'lideres/index.html':             { title: `Nuestros Líderes · ${BRAND}` },
  'vision-valores/index.html':      { title: `Visión y Valores · ${BRAND}` },
  'doctrina/index.html':            { title: `Nuestra Doctrina · ${BRAND}` },
  'contacto/index.html':            { title: `Contáctanos · IRDLex · ${BRAND}` },
  'visitanos/index.html':           { title: `Visítanos · ${BRAND}` },
  'proximos-pasos/index.html':      { title: `Próximos Pasos · ${BRAND}` },
  'discipulado/index.html':         { title: `Discipulado · ${BRAND}` },
  'discipulado/grupo/index.html':   { title: `Unirme a Discipulado · ${BRAND}` },
  'eventos/index.html':             { title: `Eventos · ${BRAND}` },
  'calendario/index.html':          { title: `Calendario · ${BRAND}` },
  'sermones/index.html':            { title: `Sermones · ${BRAND}` },
  'galeria/index.html':             { title: `Galería · ${BRAND}` },
  'galeria/album/index.html':       { title: `Álbum · Galería · ${BRAND}` },
  'donacion/index.html':            { title: `Donar · ${BRAND}` },
  'linktree/index.html':            { title: `Enlaces · ${BRAND}` },
  'poliza-de-privacidad/index.html':{ title: `Política de Privacidad · ${BRAND}` },
};

// Short breadcrumb labels per route segment (used to emit a BreadcrumbList on
// every inner page). Parent segments resolve to their own folder index.
const CRUMB = {
  '':                     'Inicio',
  'quienes-somos':        'Quiénes Somos',
  'lideres':              'Nuestros Líderes',
  'vision-valores':       'Visión y Valores',
  'doctrina':             'Doctrina',
  'contacto':             'Contacto',
  'visitanos':            'Visítanos',
  'proximos-pasos':       'Próximos Pasos',
  'discipulado':          'Discipulado',
  'discipulado/grupo':    'Unirme',
  'eventos':              'Eventos',
  'calendario':           'Calendario',
  'sermones':             'Sermones',
  'galeria':              'Galería',
  'galeria/album':        'Álbum',
  'donacion':             'Donar',
  'linktree':             'Enlaces',
  'poliza-de-privacidad': 'Política de Privacidad',
};

// Build a BreadcrumbList JSON-LD for an inner page from its folder path.
function buildBreadcrumb(page) {
  const route = page.replace(/index\.html$/, '').replace(/\/$/, ''); // e.g. "galeria/album"
  if (!route) return ''; // home: no breadcrumb
  const segs = route.split('/');
  const items = [{ name: CRUMB[''], url: 'https://www.irdlex.org/' }];
  let acc = '';
  for (const seg of segs) {
    acc = acc ? `${acc}/${seg}` : seg;
    items.push({ name: CRUMB[acc] || seg, url: `https://www.irdlex.org/${acc}/` });
  }
  const itemList = items.map((it, i) =>
    `{ "@type": "ListItem", "position": ${i + 1}, "name": ${JSON.stringify(it.name)}, "item": ${JSON.stringify(it.url)} }`
  ).join(',\n        ');
  return `<script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        ${itemList}
      ]
    }
    </script>`;
}

const START = '<!-- BUILD-HEAD -->';
const END   = '<!-- /BUILD-HEAD -->';

const attr = (s) => String(s ?? '').replace(/"/g, '&quot;');

// Pull a value from the page's ORIGINAL head (outside the generated region on
// the first run; inside it on later runs — both fine since values are stable).
function extract(head, re) { const m = head.match(re); return m ? m[1].trim() : ''; }

function extractAll(head, re) {
  const out = []; let m;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(head)) !== null) out.push(m[0]);
  return out;
}

function buildHead(page, data, headHtml) {
  const description = extract(headHtml, /<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i);
  const canonical   = extract(headHtml, /rel="canonical"\s+href="([\s\S]*?)"/i)
                      || `https://www.irdlex.org/${page.replace(/index\.html$/, '')}`;
  const robots      = extract(headHtml, /<meta\s+name="robots"\s+content="([\s\S]*?)"/i) || 'index, follow';
  const verify      = extract(headHtml, /name="google-site-verification"[^>]*?content="([^"]*)"/i)
                      || extract(headHtml, /content="([^"]*)"[^>]*?name="google-site-verification"/i);
  let ogImage       = extract(headHtml, /property="og:image"\s+content="([\s\S]*?)"/i);
  if (!ogImage) ogImage = DEFAULT_OG;

  const ogTitle       = data.ogTitle || data.title;
  const ogDescription = data.ogDescription || description;
  const ogType        = data.ogType || 'website';

  // Preserve all structured-data blocks verbatim — EXCEPT BreadcrumbList, which
  // the builder regenerates from the path so it stays consistent and isn't
  // duplicated on the few pages that hand-authored one.
  const preserved = extractAll(headHtml, /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i)
                  .filter(s => !/BreadcrumbList/.test(s));
  const crumb = buildBreadcrumb(page);
  if (crumb) preserved.push(crumb);
  const jsonld = preserved.map(s => '    ' + s).join('\n');

  const verifyTag = verify
    ? `\n    <meta name="google-site-verification" content="${attr(verify)}">`
    : '';

  return `${START}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="robots" content="${attr(robots)}">
    <title>${data.title}</title>
    <meta name="description" content="${attr(description)}">
    <meta name="author" content="${BRAND}">${verifyTag}
    <link rel="canonical" href="${attr(canonical)}">

    <!-- Warm up the origin that serves the logo, hero, and every content image. -->
    <link rel="preconnect" href="${SUPABASE}" crossorigin>

    <!-- Favicons -->
    <link rel="icon" href="${LIGHT_ICO}" media="(prefers-color-scheme:no-preference)">
    <link rel="icon" href="${LIGHT_ICO}">
    <link rel="icon" href="${LIGHT_ICO}" media="(prefers-color-scheme: light)">
    <link rel="icon" href="${DARK_ICO}" media="(prefers-color-scheme: dark)">
    <link rel="apple-touch-icon" sizes="180x180" href="${WEBIMG}/apple-touch-icon.png">

    <!-- PWA -->
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#2d4e57">
    <meta name="application-name" content="IRDLex">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="format-detection" content="telephone=no">

    <!-- Social sharing -->
    <meta property="og:site_name" content="IRDLex · ${BRAND}">
    <meta property="og:title" content="${attr(ogTitle)}">
    <meta property="og:description" content="${attr(ogDescription)}">
    <meta property="og:url" content="${attr(canonical)}">
    <meta property="og:type" content="${ogType}">
    <meta property="og:locale" content="es_US">
    <meta property="og:image" content="${attr(ogImage)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${attr(ogTitle)}">
    <meta name="twitter:description" content="${attr(ogDescription)}">
    <meta name="twitter:image" content="${attr(ogImage)}">

    <base href="/">

    <!-- Fonts: one render-blocking request for all four families. -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Carattere&family=Geist:wght@100..900&family=Lexend+Deca:wght@100..900&family=Signika:wght@300..700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/css/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" integrity="sha512-Avb2QiuDEEvB4bZJYdft2mNjVShBftLdPG8FJ0V7irTLQ8Uo0qcPxh4Plq7G5tGm0rU+1SPhVotteLpBERwTkw==" crossorigin="anonymous" referrerpolicy="no-referrer">

    <!-- Progressive enhancement: the scroll-reveal classes start at opacity:0
         and only become visible once JS adds .visible/.is-visible. If JS fails
         to load, this keeps all content visible instead of blank sections. -->
    <noscript><style>
      .animate-fade-in,.animate-fade-up,.animate-slide-in-left,.animate-slide-in-right,
      .animate-reveal-image,.animate-reveal-text,.scroll-blur-in,.scroll-fade,.scroll-fade-up,
      .scroll-fade-left,.scroll-fade-right,.scroll-fade-scale,.reveal-stagger,.fade-in,
      .image-swipe-reveal{opacity:1!important;transform:none!important;filter:none!important}
    </style></noscript>

    <script defer src="/js/lib/analytics.js"></script>
${jsonld}
    ${END}`;
}

function processPage(page, data) {
  const file = resolve(ROOT, page);
  let html;
  try { html = readFileSync(file, 'utf8'); }
  catch { console.warn(`[head] missing: ${page}`); return false; }

  const headOpen = html.indexOf('<head>');
  const headClose = html.indexOf('</head>');
  if (headOpen === -1 || headClose === -1) { console.warn(`[head] no <head> in ${page}`); return false; }

  const headInner = html.slice(headOpen + 6, headClose);

  // On re-runs, read preserved values from inside the existing generated region
  // (it still contains description/canonical/jsonld), so extraction is stable.
  const generated = buildHead(page, data, headInner);

  let newInner;
  if (headInner.includes(START) && headInner.includes(END)) {
    const re = new RegExp(`${START}[\\s\\S]*?${END}`);
    newInner = headInner.replace(re, generated);
  } else {
    // First run: replace the entire head contents with the generated region.
    newInner = `\n    ${generated}\n  `;
  }

  if (newInner === headInner) return false;
  const out = html.slice(0, headOpen + 6) + newInner + html.slice(headClose);
  writeFileSync(file, out, 'utf8');
  return true;
}

let changed = 0;
for (const [page, data] of Object.entries(PAGES)) {
  if (processPage(page, data)) { changed++; console.log(`[head] rebuilt ${page}`); }
}
console.log(`[head] done — ${changed}/${Object.keys(PAGES).length} pages`);
