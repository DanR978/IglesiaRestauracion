/* ============================================================================
 * web/src/lib/image-optimizer.ts — resize photos in the browser, to JPEG (S45)
 * ----------------------------------------------------------------------------
 * Port of js/lib/image-optimizer.js as fixed by DF-004
 * (fix/DF-004-gallery-duplicate-variants). Every output is JPEG: every
 * browser's canvas can encode it, while WebKit (Safari, and so every iOS
 * browser) cannot encode WebP and silently hands back a PNG — the canvas spec
 * allows that fallback — so the encoded type is VERIFIED, never trusted.
 *
 *   optimizeImage   gallery uploads (S46): a main image ≤ 1920px wide (q 0.90)
 *                   and a thumb ≤ 640px wide (q 0.86), bound by width
 *   optimizeMany    several files, a few at a time; failures are collected
 *   optimizeSquare  avatars (S45): the centred square, ≤ 512px (q 0.90). The
 *                   legacy uploader stored the raw file (up to 5 MB) and let
 *                   CSS `background-size: cover` crop it on every render
 *
 * Nothing is ever scaled UP. Decoding honours the EXIF orientation
 * (createImageBitmap, or an <img> where that refuses the file), so a phone
 * photo comes out upright; HEIC decodes only where the browser can (Safari).
 * JPEG has no alpha channel, so the canvas is painted white first — a
 * transparent PNG would otherwise come out on black.
 *
 * Failures throw ImageOptimizerError: a `reason` for the caller, a Spanish
 * message safe to show, the browser's own detail in console.warn only.
 * Differences from the legacy module: typed errors; the decoded image is
 * released even when encoding fails; optimizeMany always runs at least one
 * worker; the per-file size log (console.info) is gone (house rule).
 *
 * Browser-only: it needs a canvas (OffscreenCanvas where there is one).
 *
 * Usage:
 *   import { optimizeSquare, optimizeImage } from '#lib/image-optimizer.js';
 *   const { blob } = await optimizeSquare(file);           // image/jpeg, ≤ 512 × 512
 *   const { main, thumb, width, height } = await optimizeImage(file);
 * ========================================================================== */

export const JPEG_TYPE = 'image/jpeg';

export interface OptimizeOptions {
  /** Widest the main image may be, in px. */
  maxWidth?: number;
  /** JPEG quality of the main image, 0–1. */
  quality?: number;
  /** Widest the thumb may be, in px. */
  thumbWidth?: number;
  /** JPEG quality of the thumb, 0–1. */
  thumbQuality?: number;
}

/** The gallery defaults (DF-004): crisp on retina, without the muddy 0.82 of old. */
export const OPTIMIZER_DEFAULTS: Readonly<Required<OptimizeOptions>> = {
  maxWidth: 1920,
  quality: 0.9,
  thumbWidth: 640,
  thumbQuality: 0.86,
};

export interface SquareOptions {
  /** Side of the output square, in px — the largest it may be. */
  size?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
}

/** The avatar defaults: 512px covers the largest Avatar (96px) at any screen density. */
export const SQUARE_DEFAULTS: Readonly<Required<SquareOptions>> = { size: 512, quality: 0.9 };

export interface OptimizedImage {
  main: Blob;
  thumb: Blob;
  /** The main image's size in px. */
  width: number;
  height: number;
  originalSize: number;
  /** main.size / originalSize. */
  ratio: number;
}

export interface OptimizedSquare {
  /** Always image/jpeg. */
  blob: Blob;
  /** The side of the square, in px. */
  size: number;
  originalSize: number;
}

export type ImageOptimizerReason = 'invalid' | 'decode' | 'encode';

/** Spanish copy per failure: what happened and what to try. */
export const IMAGE_OPTIMIZER_MESSAGES: Readonly<Record<ImageOptimizerReason, string>> = {
  invalid: 'El archivo no es una imagen válida.',
  decode: 'No pudimos leer la imagen. Prueba con una foto JPG o PNG.',
  encode: 'Tu navegador no pudo preparar la imagen. Inténtalo con otro navegador.',
};

export class ImageOptimizerError extends Error {
  readonly reason: ImageOptimizerReason;

  constructor(reason: ImageOptimizerReason) {
    super(IMAGE_OPTIMIZER_MESSAGES[reason]);
    this.name = 'ImageOptimizerError';
    this.reason = reason;
  }
}

/** A region of the source image, in source pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The size an image of width × height is drawn at: at most `maxWidth` wide, never up-scaled. */
export function fitWidth(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  const scale = width > maxWidth ? maxWidth / width : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The centred square of a width × height image, and the side it is drawn at (≤ `size`). */
export function squareCrop(
  width: number,
  height: number,
  size: number,
): { crop: CropRect; side: number } {
  const edge = Math.min(width, height);
  return {
    crop: {
      x: Math.round((width - edge) / 2),
      y: Math.round((height - edge) / 2),
      width: edge,
      height: edge,
    },
    side: Math.max(1, Math.min(edge, Math.round(size))),
  };
}

type Source = ImageBitmap | HTMLImageElement;
type Canvas = OffscreenCanvas | HTMLCanvasElement;

/** Decode a file, upright. createImageBitmap first; an <img> when it refuses the file. */
async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* some formats only an <img> decodes — try that */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.warn('[image-optimizer] decode: the browser could not read the file');
      reject(new ImageOptimizerError('decode'));
    };
    img.src = url;
  });
}

function dimensions(source: Source): { width: number; height: number } {
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!(width >= 1 && height >= 1)) {
    console.warn('[image-optimizer] decode:', `the image has no pixels (${width}×${height})`);
    throw new ImageOptimizerError('decode');
  }
  return { width, height };
}

function release(source: Source): void {
  if ('close' in source && typeof source.close === 'function') source.close();
}

function context2d(canvas: Canvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx =
    canvas instanceof HTMLCanvasElement
      ? canvas.getContext('2d')
      : (canvas as OffscreenCanvas).getContext('2d');
  if (!ctx) {
    console.warn('[image-optimizer] encode: no 2D canvas context');
    throw new ImageOptimizerError('encode');
  }
  return ctx;
}

/** Draw `crop` of the source into a new width × height canvas, on white. */
function draw(source: Source, crop: CropRect, width: number, height: number): Canvas {
  let canvas: Canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = context2d(canvas);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  return canvas;
}

/**
 * Encode as JPEG. A browser that cannot encode the type returns another one
 * (usually PNG) without an error, so the result is checked, not trusted.
 */
async function toJpeg(canvas: Canvas, quality: number): Promise<Blob> {
  let blob: Blob | null;
  try {
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
      blob = await canvas.convertToBlob({ type: JPEG_TYPE, quality });
    } else {
      blob = await new Promise<Blob | null>((resolve) =>
        (canvas as HTMLCanvasElement).toBlob(resolve, JPEG_TYPE, quality),
      );
    }
  } catch (e) {
    console.warn('[image-optimizer] encode:', e instanceof Error ? e.message : String(e));
    throw new ImageOptimizerError('encode');
  }
  if (!blob || blob.type !== JPEG_TYPE) {
    console.warn(
      '[image-optimizer] encode:',
      `the browser returned ${blob?.type || 'nothing'} instead of ${JPEG_TYPE}`,
    );
    throw new ImageOptimizerError('encode');
  }
  return blob;
}

function assertBlob(file: unknown): asserts file is Blob {
  if (!(file instanceof Blob)) throw new ImageOptimizerError('invalid');
}

/**
 * One gallery upload: a main JPEG and a thumb JPEG, each bound by width.
 * Throws ImageOptimizerError (decode: a corrupt file, or HEIC outside Safari;
 * encode: the browser cannot make a JPEG).
 */
export async function optimizeImage(
  file: Blob,
  opts: OptimizeOptions = {},
): Promise<OptimizedImage> {
  assertBlob(file);
  const maxWidth = opts.maxWidth ?? OPTIMIZER_DEFAULTS.maxWidth;
  const quality = opts.quality ?? OPTIMIZER_DEFAULTS.quality;
  const thumbWidth = opts.thumbWidth ?? OPTIMIZER_DEFAULTS.thumbWidth;
  const thumbQuality = opts.thumbQuality ?? OPTIMIZER_DEFAULTS.thumbQuality;

  const source = await decode(file);
  try {
    const { width, height } = dimensions(source);
    const whole: CropRect = { x: 0, y: 0, width, height };
    const big = fitWidth(width, height, maxWidth);
    const small = fitWidth(width, height, thumbWidth);
    const [main, thumb] = await Promise.all([
      toJpeg(draw(source, whole, big.width, big.height), quality),
      toJpeg(draw(source, whole, small.width, small.height), thumbQuality),
    ]);
    return {
      main,
      thumb,
      width: big.width,
      height: big.height,
      originalSize: file.size,
      ratio: main.size / file.size,
    };
  } finally {
    release(source);
  }
}

export interface OptimizeManyResult {
  results: { file: Blob; result: OptimizedImage }[];
  errors: { file: Blob; error: unknown }[];
}

/** Optimise many files, at most `concurrency` at once so a big batch can't exhaust the tab. */
export async function optimizeMany(
  files: Iterable<Blob>,
  opts: OptimizeOptions = {},
  concurrency = 3,
): Promise<OptimizeManyResult> {
  const queue = [...files];
  const results: OptimizeManyResult['results'] = [];
  const errors: OptimizeManyResult['errors'] = [];
  const workers = Math.min(queue.length, Math.max(1, Math.floor(concurrency) || 1));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        try {
          results.push({ file, result: await optimizeImage(file, opts) });
        } catch (error) {
          errors.push({ file, error });
          console.warn(
            '[image-optimizer] optimizeMany:',
            error instanceof Error ? error.message : error,
          );
        }
      }
    }),
  );
  return { results, errors };
}

/**
 * An avatar: the centred square of the image as one JPEG, at most `size` px
 * a side. Throws ImageOptimizerError like optimizeImage.
 */
export async function optimizeSquare(
  file: Blob,
  opts: SquareOptions = {},
): Promise<OptimizedSquare> {
  assertBlob(file);
  const size = opts.size ?? SQUARE_DEFAULTS.size;
  const quality = opts.quality ?? SQUARE_DEFAULTS.quality;

  const source = await decode(file);
  try {
    const { width, height } = dimensions(source);
    const { crop, side } = squareCrop(width, height, size);
    const blob = await toJpeg(draw(source, crop, side, side), quality);
    return { blob, size: side, originalSize: file.size };
  } finally {
    release(source);
  }
}
