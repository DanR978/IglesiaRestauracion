/* ============================================================================
 * tests/helpers/canvas-mock.ts — a 2D canvas under jsdom (S19)
 * ----------------------------------------------------------------------------
 * jsdom ships no canvas implementation: getContext('2d') and toDataURL() throw
 * "not implemented", and <img>.src never loads. This installs the smallest
 * fakes the signature-pad controller actually touches, and records what was
 * drawn so a test can assert the geometry instead of pixels.
 *
 * Usage:
 *   const canvas = installCanvasMock();  const images = installImageMock();
 *   …                                    // vi.restoreAllMocks() undoes canvas
 *   images.restore();
 * ========================================================================== */
import { vi } from 'vitest';

/** Inclusive pixel box that getImageData() reports as opaque. */
export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FakeContext {
  readonly canvas: HTMLCanvasElement;
  /** Every method name, in call order. */
  calls: string[];
  /** The 6 setTransform() arguments, or null before the first call. */
  transform: number[] | null;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: string;
  fillStyle: string;
  arcs: number[][];
  path: [string, number, number][];
  clearRectCalls: number[][];
  drawImageCalls: unknown[][];
  /** What getImageData() reports as inked. null = a fully transparent canvas. */
  inkBox: InkBox | null;
  /** Simulate a cross-origin-tainted canvas. */
  getImageDataThrows: boolean;
}

export interface CanvasMock {
  /** Every canvas that asked for a 2D context, in the order they asked. */
  canvases: HTMLCanvasElement[];
  ctx(canvas: HTMLCanvasElement): FakeContext;
  /** Override what toDataURL() returns. Default: 1 byte per backing-store pixel. */
  setPng(fn: (canvas: HTMLCanvasElement) => string): void;
  /** Refuse a 2D context, the way a locked-down browser would. */
  denyContext(): void;
}

export interface ImageMock {
  /** Intrinsic size the next decoded image reports. */
  size(width: number, height: number): void;
  restore(): void;
}

const CONTEXTS = new WeakMap<HTMLCanvasElement, FakeContext>();

function alphaPlane(w: number, h: number, box: InkBox | null): Uint8ClampedArray {
  const data = new Uint8ClampedArray(Math.max(0, w * h * 4));
  if (!box) return data;
  for (let y = Math.max(0, box.y0); y <= Math.min(h - 1, box.y1); y++) {
    for (let x = Math.max(0, box.x0); x <= Math.min(w - 1, box.x1); x++) {
      data[(y * w + x) * 4 + 3] = 255;
    }
  }
  return data;
}

/** A PNG whose decoded size grows with the canvas, so the export cap is testable. */
function defaultPng(canvas: HTMLCanvasElement): string {
  const bytes = Math.max(1, canvas.width * canvas.height);
  return `data:image/png;base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`;
}

function createFakeContext(canvas: HTMLCanvasElement): FakeContext {
  const ctx: FakeContext = {
    canvas,
    calls: [],
    transform: null,
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    fillStyle: '',
    arcs: [],
    path: [],
    clearRectCalls: [],
    drawImageCalls: [],
    inkBox: null,
    getImageDataThrows: false,
  };
  const api = {
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      ctx.transform = [a, b, c, d, e, f];
      ctx.calls.push('setTransform');
    },
    beginPath() {
      ctx.calls.push('beginPath');
    },
    arc(x: number, y: number, r: number) {
      ctx.arcs.push([x, y, r]);
      ctx.calls.push('arc');
    },
    fill() {
      ctx.calls.push('fill');
    },
    moveTo(x: number, y: number) {
      ctx.path.push(['moveTo', x, y]);
      ctx.calls.push('moveTo');
    },
    lineTo(x: number, y: number) {
      ctx.path.push(['lineTo', x, y]);
      ctx.calls.push('lineTo');
    },
    stroke() {
      ctx.calls.push('stroke');
    },
    clearRect(x: number, y: number, w: number, h: number) {
      ctx.clearRectCalls.push([x, y, w, h]);
      ctx.calls.push('clearRect');
    },
    drawImage(...args: unknown[]) {
      ctx.drawImageCalls.push(args);
      ctx.calls.push('drawImage');
    },
    getImageData(x: number, y: number, w: number, h: number) {
      ctx.calls.push('getImageData');
      if (ctx.getImageDataThrows) throw new Error('SecurityError: tainted canvas');
      return { data: alphaPlane(w, h, ctx.inkBox), width: w, height: h };
    },
  };
  return Object.assign(ctx, api);
}

export function installCanvasMock(): CanvasMock {
  const canvases: HTMLCanvasElement[] = [];
  let png = defaultPng;
  let deny = false;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    id: string,
  ) {
    if (deny || id !== '2d') return null;
    let existing = CONTEXTS.get(this);
    if (!existing) {
      existing = createFakeContext(this);
      CONTEXTS.set(this, existing);
      canvases.push(this);
    }
    return existing as unknown as CanvasRenderingContext2D;
  } as never);

  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return png(this);
  });

  return {
    canvases,
    ctx(canvas) {
      const found = CONTEXTS.get(canvas);
      if (!found) throw new Error('canvas-mock: getContext("2d") was never called on this canvas');
      return found;
    },
    setPng(fn) {
      png = fn;
    },
    denyContext() {
      deny = true;
    },
  };
}

export function installImageMock(): ImageMock {
  const original = globalThis.Image;
  let intrinsicWidth = 200;
  let intrinsicHeight = 80;

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = intrinsicWidth;
    height = intrinsicHeight;
    private value = '';
    get src(): string {
      return this.value;
    }
    // Only a data URL "decodes"; anything else reports an error, which is how
    // the controller's loadDataURL() learns a stored payload was unusable.
    set src(next: string) {
      this.value = next;
      queueMicrotask(() => (next.startsWith('data:') ? this.onload?.() : this.onerror?.()));
    }
  }

  globalThis.Image = FakeImage as unknown as typeof Image;

  return {
    size(w, h) {
      intrinsicWidth = w;
      intrinsicHeight = h;
    },
    restore() {
      globalThis.Image = original;
    },
  };
}

/** A pointer event jsdom will dispatch (it implements no PointerEvent). */
export function pointer(type: string, x: number, y: number, pointerId = 1): Event {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

/** Let queued microtasks (image decode) and their continuations run. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Pretend to be a screen of `ratio` device pixels per CSS pixel. */
export function setDevicePixelRatio(ratio: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });
}
