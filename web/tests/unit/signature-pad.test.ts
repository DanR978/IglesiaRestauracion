// S19 — the ported signature canvas controller under jsdom with a mocked 2D
// context: the backing store is sized for the device pixel ratio, a pointer
// sequence flips isEmpty, clear() resets, the export is trimmed to the inked
// bounding box and capped, and loadDataURL() round-trips a stored signature.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSignaturePad,
  dataUrlByteLength,
  isWithinSignatureCap,
  SIGNATURE_INK,
  SIGNATURE_MAX_BYTES,
  SIGNATURE_PAD_HEIGHT,
  SIGNATURE_STROKE_WIDTH,
  type SignatureChangeReason,
} from '$lib/signature-pad';
import {
  flush,
  installCanvasMock,
  installImageMock,
  pointer,
  setDevicePixelRatio,
  type CanvasMock,
  type ImageMock,
} from '../helpers/canvas-mock';

const PNG = 'data:image/png;base64,AAAA';

let canvas: HTMLCanvasElement;
let mock: CanvasMock;
let images: ImageMock;
let changes: [SignatureChangeReason, boolean][];

/** Give the canvas a laid-out width (jsdom reports 0 for everything). */
function widen(el: HTMLElement, px: number): void {
  Object.defineProperty(el, 'clientWidth', { value: px, configurable: true });
}

function makePad(height = SIGNATURE_PAD_HEIGHT) {
  return createSignaturePad(canvas, {
    height,
    onChange: (reason, empty) => changes.push([reason, empty]),
  });
}

/** One complete stroke: press, drag, release. */
function stroke(): void {
  canvas.dispatchEvent(pointer('pointerdown', 10, 10));
  canvas.dispatchEvent(pointer('pointermove', 40, 25));
  canvas.dispatchEvent(pointer('pointerup', 40, 25));
}

beforeEach(() => {
  mock = installCanvasMock();
  images = installImageMock();
  changes = [];
  canvas = document.createElement('canvas');
  widen(canvas, 300);
  document.body.appendChild(canvas);
  setDevicePixelRatio(1);
});

afterEach(() => {
  canvas.remove();
  images.restore();
  vi.restoreAllMocks();
});

describe('dataUrlByteLength / isWithinSignatureCap', () => {
  it('decodes the base64 payload size, padding included', () => {
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUrlByteLength('data:image/png;base64,AAA=')).toBe(2);
    expect(dataUrlByteLength('data:image/png;base64,AA==')).toBe(1);
    expect(dataUrlByteLength('data:image/png;base64,')).toBe(0);
  });

  it('measures a non-base64 body as written, and a non-data string as 0', () => {
    expect(dataUrlByteLength('data:image/svg+xml,abcde')).toBe(5);
    expect(dataUrlByteLength('')).toBe(0);
    expect(dataUrlByteLength('not-a-data-url')).toBe(0);
  });

  it('caps at SIGNATURE_MAX_BYTES by default', () => {
    const big = `data:image/png;base64,${'A'.repeat(SIGNATURE_MAX_BYTES * 2)}`;
    expect(isWithinSignatureCap(PNG)).toBe(true);
    expect(isWithinSignatureCap(big)).toBe(false);
    expect(isWithinSignatureCap(big, 0)).toBe(false);
  });
});

describe('createSignaturePad — hi-DPI sizing', () => {
  it('scales the backing store by devicePixelRatio and keeps the CSS height', () => {
    setDevicePixelRatio(2);
    makePad(170);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(340);
    expect(canvas.style.height).toBe('170px');
    expect(mock.ctx(canvas).transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('applies the stroke settings once, at setup', () => {
    const ctx = mock.ctx(makePad().canvas);
    expect(ctx.lineWidth).toBe(SIGNATURE_STROKE_WIDTH);
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('round');
    expect(ctx.strokeStyle).toBe(SIGNATURE_INK);
  });

  it('clamps the ratio to 3× and floors it at 1×', () => {
    setDevicePixelRatio(4);
    makePad(100);
    expect(canvas.width).toBe(900);

    const second = document.createElement('canvas');
    widen(second, 200);
    setDevicePixelRatio(0);
    createSignaturePad(second, { height: 100 });
    expect(second.width).toBe(200);
  });

  it('falls back to 320px wide when nothing has been laid out yet', () => {
    const hidden = document.createElement('canvas');
    createSignaturePad(hidden, { height: 50 });
    expect(hidden.width).toBe(320);
  });

  it('measures the parent when the canvas itself has no layout width', () => {
    const host = document.createElement('div');
    widen(host, 480);
    const child = document.createElement('canvas');
    host.appendChild(child);
    createSignaturePad(child, { height: 50 });
    expect(child.width).toBe(480);
  });

  it('throws when the browser refuses a 2D context', () => {
    mock.denyContext();
    expect(() => createSignaturePad(document.createElement('canvas'))).toThrow(/2D context/);
  });
});

describe('createSignaturePad — pointer drawing', () => {
  it('starts empty and stays empty until a pointer goes down', () => {
    const pad = makePad();
    canvas.dispatchEvent(pointer('pointermove', 10, 10));
    expect(pad.isEmpty()).toBe(true);
    expect(changes).toEqual([]);
  });

  it('marks a dot on pointerdown so a tap leaves a mark', () => {
    const pad = makePad();
    canvas.dispatchEvent(pointer('pointerdown', 10, 12));
    expect(pad.isEmpty()).toBe(false);
    expect(changes).toEqual([['draw', false]]);
    expect(mock.ctx(canvas).arcs).toEqual([[10, 12, SIGNATURE_STROKE_WIDTH / 2]]);
  });

  it('draws a segment per pointermove and reports the finished stroke once', () => {
    const pad = makePad();
    stroke();
    expect(pad.isEmpty()).toBe(false);
    expect(mock.ctx(canvas).path).toEqual([
      ['moveTo', 10, 10],
      ['lineTo', 40, 25],
    ]);
    expect(changes).toEqual([
      ['draw', false],
      ['stroke-end', false],
    ]);

    // A stray second release is not a second change.
    canvas.dispatchEvent(pointer('pointerup', 40, 25));
    expect(changes).toHaveLength(2);
  });

  it.each(['pointerleave', 'pointercancel'])('ends the stroke on %s', (type) => {
    makePad();
    canvas.dispatchEvent(pointer('pointerdown', 5, 5));
    canvas.dispatchEvent(pointer(type, 5, 5));
    expect(changes.at(-1)).toEqual(['stroke-end', false]);
    // Moves after the stroke ended must not extend it.
    canvas.dispatchEvent(pointer('pointermove', 90, 90));
    expect(mock.ctx(canvas).path).toEqual([]);
  });
});

describe('createSignaturePad — clear / isEmpty', () => {
  it('wipes the CSS box and reports empty again', () => {
    const pad = makePad(170);
    stroke();
    pad.clear();
    expect(pad.isEmpty()).toBe(true);
    expect(mock.ctx(canvas).clearRectCalls).toEqual([[0, 0, 300, 170]]);
    expect(changes.at(-1)).toEqual(['clear', true]);
  });
});

describe('createSignaturePad — toDataURL', () => {
  it('returns an empty string while nothing has been drawn', () => {
    expect(makePad().toDataURL()).toBe('');
  });

  it('returns an empty string when the pixels turn out to be blank', () => {
    const pad = makePad();
    stroke();
    expect(pad.toDataURL()).toBe('');
  });

  it('crops to the inked bounding box plus 6 CSS px of padding', () => {
    const pad = makePad(170);
    stroke();
    mock.ctx(canvas).inkBox = { x0: 100, y0: 50, x1: 140, y1: 70 };

    const url = pad.toDataURL();
    expect(url.startsWith('data:image/png;base64,')).toBe(true);

    // 100−6 … 140+6 → 52 wide, 50−6 … 70+6 → 32 tall.
    const out = mock.canvases.at(-1)!;
    expect([out.width, out.height]).toEqual([52, 32]);
    expect(mock.ctx(out).drawImageCalls.at(-1)!.slice(1)).toEqual([94, 44, 52, 32, 0, 0, 52, 32]);
  });

  it('scales the trim padding with the device pixel ratio', () => {
    setDevicePixelRatio(2);
    const pad = makePad(170);
    stroke();
    mock.ctx(canvas).inkBox = { x0: 100, y0: 50, x1: 140, y1: 70 };
    pad.toDataURL();
    const out = mock.canvases.at(-1)!;
    expect([out.width, out.height]).toEqual([64, 44]);
  });

  it('clamps the padded box to the canvas edges', () => {
    const pad = makePad(170);
    stroke();
    mock.ctx(canvas).inkBox = { x0: 0, y0: 0, x1: 299, y1: 169 };
    pad.toDataURL();
    const out = mock.canvases.at(-1)!;
    expect([out.width, out.height]).toEqual([300, 170]);
  });

  it('shrinks the export until it fits maxBytes (SEC-09)', () => {
    const pad = makePad(170);
    stroke();
    mock.ctx(canvas).inkBox = { x0: 0, y0: 0, x1: 299, y1: 169 };

    // The mock encodes 1 byte per pixel: 300×170 = 51 000 > 30 000, and the
    // first 0.75× step (225×128 = 28 800) fits.
    const url = pad.toDataURL({ maxBytes: 30_000 });
    expect(dataUrlByteLength(url)).toBeLessThanOrEqual(30_000);
    const out = mock.canvases.at(-1)!;
    expect([out.width, out.height]).toEqual([225, 128]);
  });

  it('leaves the export at full size when the cap is disabled', () => {
    const pad = makePad(170);
    stroke();
    mock.ctx(canvas).inkBox = { x0: 0, y0: 0, x1: 299, y1: 169 };
    pad.toDataURL({ maxBytes: 0 });
    expect(mock.canvases.at(-1)!.width).toBe(300);
  });

  it('never exceeds the default cap for a real-sized signature', () => {
    const pad = makePad(170);
    stroke();
    mock.ctx(canvas).inkBox = { x0: 20, y0: 20, x1: 220, y1: 120 };
    expect(isWithinSignatureCap(pad.toDataURL(), SIGNATURE_MAX_BYTES)).toBe(true);
  });

  it('falls back to the untrimmed export when the canvas is tainted', () => {
    const pad = makePad(170);
    stroke();
    const ctx = mock.ctx(canvas);
    ctx.getImageDataThrows = true;
    const before = mock.canvases.length;
    // The whole 300×170 backing store, not a crop — and no offscreen canvas.
    expect(dataUrlByteLength(pad.toDataURL())).toBe(300 * 170);
    expect(mock.canvases.length).toBe(before);
  });
});

describe('createSignaturePad — loadDataURL', () => {
  it('paints a stored signature fitted and centred, and flips isEmpty', async () => {
    const pad = makePad(170);
    images.size(200, 80);

    await expect(pad.loadDataURL(PNG)).resolves.toBe(true);
    expect(pad.isEmpty()).toBe(false);
    expect(changes.at(-1)).toEqual(['load', false]);
    // 200×80 fits inside 300×170 at 1× → centred at (50, 45).
    expect(mock.ctx(canvas).drawImageCalls.at(-1)!.slice(1)).toEqual([50, 45, 200, 80]);
  });

  it('scales an oversized signature down to fit', async () => {
    const pad = makePad(170);
    images.size(600, 170);
    await pad.loadDataURL(PNG);
    // scale = min(300/600, 170/170, 1) = 0.5 → 300×85, centred at (0, 42.5).
    expect(mock.ctx(canvas).drawImageCalls.at(-1)!.slice(1)).toEqual([0, 42.5, 300, 85]);
  });

  it('round-trips: draw → export → clear → load reports inked again', async () => {
    const pad = makePad(170);
    stroke();
    mock.ctx(canvas).inkBox = { x0: 40, y0: 30, x1: 90, y1: 60 };
    const url = pad.toDataURL();
    expect(url).not.toBe('');

    pad.clear();
    expect(pad.isEmpty()).toBe(true);

    await expect(pad.loadDataURL(url)).resolves.toBe(true);
    expect(pad.isEmpty()).toBe(false);
  });

  it('ignores an empty url and reports an undecodable one', async () => {
    const pad = makePad();
    await expect(pad.loadDataURL('')).resolves.toBe(false);
    await expect(pad.loadDataURL('https://example.test/firma.png')).resolves.toBe(false);
    expect(pad.isEmpty()).toBe(true);
  });

  it('does nothing after destroy()', async () => {
    const pad = makePad();
    pad.destroy();
    await expect(pad.loadDataURL(PNG)).resolves.toBe(false);
    expect(pad.isEmpty()).toBe(true);
  });
});

describe('createSignaturePad — resize / destroy', () => {
  it('re-scales the backing store and repaints the previous drawing', async () => {
    const pad = makePad(170);
    stroke();
    const drawnBefore = mock.ctx(canvas).drawImageCalls.length;

    widen(canvas, 500);
    await pad.resize();

    expect(canvas.width).toBe(500);
    expect(mock.ctx(canvas).drawImageCalls.length).toBe(drawnBefore + 1);
    expect(mock.ctx(canvas).drawImageCalls.at(-1)!.slice(1)).toEqual([0, 0, 500, 170]);
  });

  it('is a no-op when neither the width nor the ratio changed', async () => {
    const pad = makePad(170);
    stroke();
    const toDataURL = vi.spyOn(canvas, 'toDataURL');
    await pad.resize();
    expect(toDataURL).not.toHaveBeenCalled(); // no snapshot ⇒ no re-scale
  });

  it('re-scales on a window resize when ResizeObserver is unavailable', async () => {
    expect(globalThis.ResizeObserver).toBeUndefined();
    makePad(170);
    widen(canvas, 640);
    window.dispatchEvent(new Event('resize'));
    await flush();
    expect(canvas.width).toBe(640);
  });

  it('observes the canvas itself when ResizeObserver exists', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = disconnect;
        unobserve = vi.fn();
      },
    );
    try {
      const pad = makePad(170);
      expect(observe).toHaveBeenCalledWith(canvas);
      pad.destroy();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stops drawing and listening after destroy()', async () => {
    const pad = makePad(170);
    pad.destroy();

    canvas.dispatchEvent(pointer('pointerdown', 10, 10));
    expect(pad.isEmpty()).toBe(true);
    expect(changes).toEqual([]);

    widen(canvas, 800);
    window.dispatchEvent(new Event('resize'));
    await flush();
    expect(canvas.width).toBe(300);
  });
});
