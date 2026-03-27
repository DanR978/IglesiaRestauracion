#!/usr/bin/env node
/**
 * scripts/optimize-images.js
 * ─────────────────────────────────────────────
 * Resizes + compresses camera photos for the web.
 * Works on Windows, Mac, and Linux — no ImageMagick needed.
 *
 * FIRST TIME SETUP:
 *   npm install sharp --save-dev
 *
 * USAGE:
 *   node scripts/optimize-images.js DSC01003.png
 *   node scripts/optimize-images.js photo1.jpg photo2.png
 *   node scripts/optimize-images.js ./church-photos/
 *   node scripts/optimize-images.js ./photos/ --max-width 1200
 *
 * OUTPUT (in "optimized/" folder next to the originals):
 *   photo.jpg        — compressed JPEG, max 1920px wide (~200-400KB)
 *   photo.webp       — WebP version (30-50% smaller)
 *   photo-thumb.jpg  — 400px thumbnail for event cards
 */

const fs = require('fs');
const path = require('path');

// ── Parse args ──
const args = process.argv.slice(2);
if (!args.length) {
  console.log(`
  Usage: node scripts/optimize-images.js <files or folder> [options]

  Options:
    --max-width 1920   Maximum width in pixels (default: 1920)
    --quality 82       JPEG quality 1-100 (default: 82)
    --thumb-width 400  Thumbnail width (default: 400)

  Examples:
    node scripts/optimize-images.js DSC01003.png
    node scripts/optimize-images.js ./church-photos/
    node scripts/optimize-images.js *.jpg --max-width 1200
`);
  process.exit(0);
}

let maxWidth = 1920;
let quality = 82;
let thumbWidth = 400;
const inputs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max-width')   { maxWidth = parseInt(args[++i]); continue; }
  if (args[i] === '--quality')     { quality = parseInt(args[++i]); continue; }
  if (args[i] === '--thumb-width') { thumbWidth = parseInt(args[++i]); continue; }
  inputs.push(args[i]);
}

// ── Check for sharp ──
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(`
  ❌ "sharp" is not installed. Run this first:

     npm install sharp --save-dev

  Then try again.
`);
  process.exit(1);
}

// ── Collect image files ──
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.heic', '.avif']);

function collectFiles(inputPaths) {
  const files = [];
  for (const p of inputPaths) {
    const stat = fs.statSync(p, { throwIfNoEntry: false });
    if (!stat) { console.warn(`  ⚠ Not found: ${p}`); continue; }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(p)) {
        if (IMAGE_EXTS.has(path.extname(name).toLowerCase())) {
          files.push(path.join(p, name));
        }
      }
    } else if (IMAGE_EXTS.has(path.extname(p).toLowerCase())) {
      files.push(p);
    }
  }
  return files;
}

const files = collectFiles(inputs);
if (!files.length) {
  console.log('  No image files found.');
  process.exit(0);
}

// ── Process ──
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

async function processFile(filePath) {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath, path.extname(filePath));
  const outDir = path.join(dir, 'optimized');
  fs.mkdirSync(outDir, { recursive: true });

  const beforeSize = fs.statSync(filePath).size;

  // Main JPEG
  await sharp(filePath)
    .resize(maxWidth, null, { withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(path.join(outDir, `${name}.jpg`));

  // WebP
  await sharp(filePath)
    .resize(maxWidth, null, { withoutEnlargement: true })
    .webp({ quality: quality - 4 })
    .toFile(path.join(outDir, `${name}.webp`));

  // Thumbnail
  await sharp(filePath)
    .resize(thumbWidth, null, { withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path.join(outDir, `${name}-thumb.jpg`));

  const afterSize = fs.statSync(path.join(outDir, `${name}.jpg`)).size;
  const pct = Math.round(100 - (afterSize * 100 / beforeSize));

  return { name, beforeSize, afterSize, pct, outDir };
}

async function main() {
  console.log(`\n  🖼️  Optimizing ${files.length} image(s)...`);
  console.log(`  Max: ${maxWidth}px | Quality: ${quality} | Thumbs: ${thumbWidth}px\n`);

  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of files) {
    try {
      const r = await processFile(file);
      totalBefore += r.beforeSize;
      totalAfter += r.afterSize;
      console.log(`  ✅ ${path.basename(file)} → ${r.name}.jpg (${r.pct}% smaller) + .webp + thumb`);
    } catch (err) {
      console.error(`  ❌ ${path.basename(file)}: ${err.message}`);
    }
  }

  console.log(`\n  ────────────────────────────────────────`);
  console.log(`  ${formatSize(totalBefore)} → ${formatSize(totalAfter)} (saved ${formatSize(totalBefore - totalAfter)})`);
  console.log(`  Files in: optimized/\n`);
  console.log(`  💡 Upload .jpg to Supabase Storage for events.`);
  console.log(`     Use .webp in <picture> tags for faster loading.`);
  console.log(`     Use -thumb.jpg for event card previews.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });