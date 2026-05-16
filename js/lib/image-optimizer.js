// js/lib/image-optimizer.js
// ─────────────────────────────────────────────────────────────────────────────
// Browser-side image optimizer — mirrors the behavior of
// scripts/optimize-images.js (which uses sharp on Node).
//
// For each uploaded file it produces three blobs:
//   • main    — JPEG, max 1920px wide, quality 82
//   • webp    — WebP, max 1920px wide, quality 78
//   • thumb   — JPEG, max 400px wide,  quality 78
//
// Handles HEIC, PNG, JPEG, WebP, AVIF. Respects EXIF rotation. Skips up-scaling
// when the original is already smaller than the target.
//
// Usage:
//   import { optimizeImage } from '/js/lib/image-optimizer.js';
//   const { main, webp, thumb, width, height, ratio } = await optimizeImage(file);
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  maxWidth:    1920,
  quality:     0.90,    // crisp JPEG output (was 0.82 — looked muddy on retina)
  webpQuality: 0.88,    // crisp WebP output (was 0.78)
  thumbWidth:  640,     // bigger thumb so retina displays stay sharp at card sizes (was 400)
  thumbQuality: 0.86,   // crisp thumb (was 0.78)
};

/** Decode a File into an ImageBitmap, honoring EXIF orientation. */
async function decode(file) {
  // createImageBitmap is the fastest path; falls back to <img> if browser refuses
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) { /* fall through to <img> path */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/** Render the decoded bitmap at the target max-width to an OffscreenCanvas / canvas. */
function renderToCanvas(bitmap, maxWidth) {
  const srcW = bitmap.width  || bitmap.naturalWidth;
  const srcH = bitmap.height || bitmap.naturalHeight;
  const scale = srcW > maxWidth ? maxWidth / srcW : 1;     // never upscale
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

/** Export a canvas to a Blob with the given mimetype + quality. */
function canvasToBlob(canvas, mimeType, quality) {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('Canvas vacío')),
      mimeType, quality,
    );
  });
}

/** Pretty-print bytes for the console log. */
function fmt(bytes) {
  if (bytes < 1024)    return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

/**
 * Optimize one File. Returns three Blobs + metadata.
 * Throws on decode failure (corrupt files, unsupported HEIC on non-Safari, etc).
 */
export async function optimizeImage(file, opts = {}) {
  const {
    maxWidth, quality, webpQuality, thumbWidth, thumbQuality,
  } = { ...DEFAULTS, ...opts };

  if (!file || !(file instanceof Blob)) {
    throw new Error('Archivo inválido');
  }

  const bitmap = await decode(file);

  // Main + WebP share the same big canvas
  const big   = renderToCanvas(bitmap, maxWidth);
  const thumb = renderToCanvas(bitmap, thumbWidth);

  const [main, webp, thumbBlob] = await Promise.all([
    canvasToBlob(big.canvas,   'image/jpeg', quality),
    canvasToBlob(big.canvas,   'image/webp', webpQuality),
    canvasToBlob(thumb.canvas, 'image/jpeg', thumbQuality),
  ]);

  // Free decoder memory
  if (bitmap.close) bitmap.close();

  const ratio = main.size / file.size;
  console.info(
    `[image-optimizer] ${file.name || 'photo'}: ${fmt(file.size)} → main ${fmt(main.size)} (${(ratio * 100).toFixed(0)}%), webp ${fmt(webp.size)}, thumb ${fmt(thumbBlob.size)}`,
  );

  return {
    main,
    webp,
    thumb: thumbBlob,
    width:  big.width,
    height: big.height,
    originalSize: file.size,
    ratio,
  };
}

/** Optimize many files concurrently, but cap parallelism so we don't OOM the tab. */
export async function optimizeMany(files, opts = {}, concurrency = 3) {
  const queue = [...files];
  const results = [];
  const errors  = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const f = queue.shift();
      try {
        const r = await optimizeImage(f, opts);
        results.push({ file: f, result: r });
      } catch (e) {
        errors.push({ file: f, error: e });
        console.warn('[image-optimizer]', f?.name, e?.message || e);
      }
    }
  });
  await Promise.all(workers);
  return { results, errors };
}

export const OPTIMIZER_DEFAULTS = DEFAULTS;
