/* ============================================================================
 * web/src/lib/signature-pad.ts — the signature canvas controller (port of
 * js/components/signature-pad.js, S19)
 * ----------------------------------------------------------------------------
 * Dependency-free pointer drawing on ONE <canvas>: mouse, touch and pen alike.
 * High-DPI aware — the backing store is (CSS size × devicePixelRatio), so the
 * stroke stays crisp on a phone — and it exports a TRANSPARENT PNG trimmed to
 * the inked bounding box, which keeps the stored payload small and prints
 * cleanly on the white page of the waiver PDF.
 *
 * The drawing math is preserved, not redesigned (MIGRATION.md D-009). What the
 * port changes: the controller no longer BUILDS its DOM. Legacy
 * createSignaturePad() created a wrapper + canvas + hint and handed back
 * `.element`; here Svelte owns the markup and the controller attaches to a
 * canvas it is given (SignaturePad.svelte). The other deltas are listed in the
 * S19 NOTES: an onChange reason argument, promise-returning resize/loadDataURL,
 * a ResizeObserver instead of the window-resize listener, and the export size
 * cap below.
 *
 * Usage:
 *   const pad = createSignaturePad(canvasEl, { height: 170, onChange });
 *   pad.isEmpty();                // → boolean
 *   pad.toDataURL();              // → 'data:image/png;base64,…' (trimmed) or ''
 *   pad.clear();
 *   await pad.loadDataURL(url);   // restore a previously captured signature
 *   await pad.resize();           // the container width changed
 *   pad.destroy();
 * ========================================================================== */

/**
 * The ink a signature is drawn in. Deliberately NOT a theme token: this colour
 * is baked into the exported PNG, which is reproduced on the permanently white
 * page of the waiver PDF (`WV_DARK` in $lib/waiver is the same value). It must
 * not reverse with the theme — which is why SignaturePad.svelte keeps the
 * drawing surface permanently light too (CLAUDE.md §4 surface/ink pairing).
 */
export const SIGNATURE_INK = '#0e2d38';

/** Stroke width in CSS px, before the devicePixelRatio transform. */
export const SIGNATURE_STROKE_WIDTH = 2.2;

/** Default drawing-area height in CSS px (legacy default). */
export const SIGNATURE_PAD_HEIGHT = 170;

/**
 * Cap on the exported data URL. An unbounded PNG is a free amplification on the
 * anon INSERT into `event_registrations` (SEC-09); a trimmed signature is a few
 * kB, so this only ever bites on a pathological canvas. S33 owns the
 * submit-path rejection + its Spanish message; this is the producer-side floor.
 */
export const SIGNATURE_MAX_BYTES = 128 * 1024;

/** Backing-store multiplier ceiling: past 3× the memory cost buys nothing. */
const MAX_DPR = 3;

/** Width used when the canvas has not been laid out yet (hidden, SSR→hydrate). */
const FALLBACK_WIDTH = 320;

/** Breathing room around the trimmed bounding box, in CSS px. */
const TRIM_PADDING = 6;

/** How many times the export may halve itself down toward `maxBytes`. */
const MAX_EXPORT_ATTEMPTS = 4;

/** Why the pad reported a change. `draw` fires per stroke start, not per point. */
export type SignatureChangeReason = 'draw' | 'stroke-end' | 'clear' | 'load';

export interface SignaturePadOptions {
  /** Drawing-area height in CSS px. Fixed for the life of the controller. */
  height?: number;
  /** Called after every ink change, with the reason and the resulting emptiness. */
  onChange?: (reason: SignatureChangeReason, isEmpty: boolean) => void;
}

export interface SignatureExportOptions {
  /** Shrink the export until it fits. `0` disables the cap. */
  maxBytes?: number;
}

export interface SignaturePad {
  readonly canvas: HTMLCanvasElement;
  /** True until the first mark is made, and again after clear(). */
  isEmpty(): boolean;
  /** Trimmed transparent PNG, or '' when the pad is empty. */
  toDataURL(options?: SignatureExportOptions): string;
  clear(): void;
  /** Restore a captured signature, fitted and centred. Resolves false if it did not load. */
  loadDataURL(url: string): Promise<boolean>;
  /** Re-scale the backing store to the current CSS size × DPR, preserving the drawing. */
  resize(): Promise<void>;
  destroy(): void;
}

/**
 * Decoded byte length of a data URL. Base64 bodies are measured after decoding
 * (4 chars → 3 bytes); any other body is measured as written.
 */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  if (!/;base64$/i.test(dataUrl.slice(0, comma))) return body.length;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/** True when the payload is within the cap. The guard S33 applies before insert. */
export function isWithinSignatureCap(dataUrl: string, maxBytes = SIGNATURE_MAX_BYTES): boolean {
  return dataUrlByteLength(dataUrl) <= maxBytes;
}

function currentDpr(): number {
  const raw = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(raw, MAX_DPR));
}

/** Decode a data URL into an <img>. Resolves null instead of throwing on a bad payload. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Encode a crop of `source` as a PNG, shrinking the output until it fits
 * `maxBytes` (SEC-09). Returns the smallest attempt if even that overshoots —
 * losing resolution beats losing the signature.
 */
function exportCrop(
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxBytes: number,
): string {
  let scale = 1;
  let url = '';
  for (let attempt = 0; attempt < MAX_EXPORT_ATTEMPTS; attempt++) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * scale));
    out.height = Math.max(1, Math.round(sh * scale));
    const octx = out.getContext('2d');
    if (!octx) return '';
    octx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
    url = out.toDataURL('image/png');
    if (maxBytes <= 0 || dataUrlByteLength(url) <= maxBytes) return url;
    scale *= 0.75;
  }
  return url;
}

/**
 * Attach a signature pad to an existing canvas. Throws when the browser gives
 * no 2D context — the caller renders a non-drawing fallback (the typed-name
 * e-signature in the registration wizard).
 */
export function createSignaturePad(
  canvas: HTMLCanvasElement,
  { height = SIGNATURE_PAD_HEIGHT, onChange }: SignaturePadOptions = {},
): SignaturePad {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('[signature-pad] no 2D context on this canvas');
  // Re-bound so the closures below see a non-nullable type, not the narrowing.
  const ctx: CanvasRenderingContext2D = context;

  let drawing = false;
  let dirty = false;
  let last: { x: number; y: number } | null = null;
  let dpr = currentDpr();
  let destroyed = false;
  let lastWidth = 0;
  let lastDpr = 0;

  function cssSize(): { w: number; h: number } {
    const measured = canvas.clientWidth || canvas.parentElement?.clientWidth || FALLBACK_WIDTH;
    return { w: Math.max(1, Math.round(measured)), h: height };
  }

  // Re-scale the backing store to the element's CSS size × DPR, preserving any
  // existing drawing by snapshotting before the resize.
  async function resize(): Promise<void> {
    if (destroyed) return;
    const { w, h } = cssSize();
    const nextDpr = currentDpr();
    if (w === lastWidth && nextDpr === lastDpr) return;
    lastWidth = w;
    lastDpr = nextDpr;

    const snapshot = dirty ? canvas.toDataURL('image/png') : null;
    dpr = nextDpr;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = SIGNATURE_STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = SIGNATURE_INK;
    if (snapshot) {
      const img = await loadImage(snapshot);
      if (img && !destroyed) ctx.drawImage(img, 0, 0, w, h);
    }
  }

  function pos(e: PointerEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function markDirty(reason: SignatureChangeReason): void {
    if (!dirty) dirty = true;
    onChange?.(reason, false);
  }

  function start(e: PointerEvent): void {
    if (destroyed) return;
    e.preventDefault();
    drawing = true;
    last = pos(e);
    // A dot so a tap leaves a mark.
    ctx.beginPath();
    ctx.arc(last.x, last.y, SIGNATURE_STROKE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fillStyle = SIGNATURE_INK;
    ctx.fill();
    markDirty('draw');
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Not supported here (jsdom, older Safari) — drawing still works.
    }
  }

  function move(e: PointerEvent): void {
    if (!drawing || !last) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }

  function end(e?: PointerEvent): void {
    if (!drawing) return;
    drawing = false;
    last = null;
    if (e) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Capture was never taken — nothing to release.
      }
    }
    onChange?.('stroke-end', !dirty);
  }

  function clear(): void {
    const { w, h } = cssSize();
    ctx.clearRect(0, 0, w, h);
    dirty = false;
    onChange?.('clear', true);
  }

  function isEmpty(): boolean {
    return !dirty;
  }

  // Export the inked area trimmed to its bounding box. Returns '' when empty.
  function toDataURL({ maxBytes = SIGNATURE_MAX_BYTES }: SignatureExportOptions = {}): string {
    if (!dirty) return '';
    const { width, height: H } = canvas;
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, width, H).data;
    } catch {
      // Tainted canvas (a cross-origin image was drawn into it): the untrimmed
      // export is still a valid signature, so ship that rather than nothing.
      return canvas.toDataURL('image/png');
    }
    let minX = width;
    let minY = H;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] !== 0) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return '';
    const pad = Math.round(TRIM_PADDING * dpr);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad);
    maxY = Math.min(H, maxY + pad);
    return exportCrop(canvas, minX, minY, maxX - minX, maxY - minY, maxBytes);
  }

  async function loadDataURL(url: string): Promise<boolean> {
    if (!url || destroyed) return false;
    const img = await loadImage(url);
    if (!img || destroyed) return false;
    const { w, h } = cssSize();
    // Fit the image within the pad, centered.
    const scale = Math.min(w / img.width, h / img.height, 1);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    markDirty('load');
    return true;
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointerleave', end);
  canvas.addEventListener('pointercancel', end);

  // A ResizeObserver catches the container changing (a modal opening, a wizard
  // step swapping) which the legacy window-resize listener missed — that is why
  // the wizard had to poke resize() from a requestAnimationFrame. Fall back to
  // the legacy listener where ResizeObserver is unavailable.
  const onViewportResize = () => void resize();
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => void resize());
  if (observer) observer.observe(canvas);
  else window.addEventListener('resize', onViewportResize);

  function destroy(): void {
    destroyed = true;
    observer?.disconnect();
    window.removeEventListener('resize', onViewportResize);
    canvas.removeEventListener('pointerdown', start);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', end);
    canvas.removeEventListener('pointerleave', end);
    canvas.removeEventListener('pointercancel', end);
  }

  // Size synchronously: the caller mounts into a laid-out DOM, and an empty pad
  // has no snapshot to await.
  void resize();

  return { canvas, isEmpty, toDataURL, clear, loadDataURL, resize, destroy };
}
