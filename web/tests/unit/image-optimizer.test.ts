// S45 — #lib/image-optimizer, the DF-004 port (JPEG only, the encoded type
// verified) plus the avatar's square crop. jsdom has no canvas, so the canvas
// and the decoder are fakes that record what was drawn and encoded: the tests
// pin the geometry (output sizes, the crop rectangle, no up-scaling), the
// output type and the failure paths, not pixels.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_OPTIMIZER_MESSAGES,
  ImageOptimizerError,
  JPEG_TYPE,
  OPTIMIZER_DEFAULTS,
  SQUARE_DEFAULTS,
  fitWidth,
  optimizeImage,
  optimizeMany,
  optimizeSquare,
  squareCrop,
} from '#lib/image-optimizer.js';

type Call = [string, ...unknown[]];

class FakeContext {
  fillStyle = '';
  imageSmoothingEnabled = false;
  imageSmoothingQuality = 'low';
  calls: Call[] = [];
  fillRect(...args: unknown[]): void {
    this.calls.push(['fillRect', this.fillStyle, ...args]);
  }
  drawImage(...args: unknown[]): void {
    this.calls.push(['drawImage', ...args]);
  }
}

/** What the fake encoder hands back; null = the type it was asked for. */
let encodedType: string | null = null;

class FakeOffscreenCanvas {
  static made: FakeOffscreenCanvas[] = [];
  readonly ctx = new FakeContext();
  encoded: { type?: string; quality?: number } | null = null;
  constructor(
    public width: number,
    public height: number,
  ) {
    FakeOffscreenCanvas.made.push(this);
  }
  getContext(kind: string): FakeContext | null {
    return kind === '2d' ? this.ctx : null;
  }
  async convertToBlob(options: { type?: string; quality?: number } = {}): Promise<Blob> {
    this.encoded = options;
    return new Blob([new Uint8Array(this.width + this.height)], {
      type: encodedType ?? options.type ?? 'image/png',
    });
  }
}

interface FakeBitmap {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
}

function bitmap(width: number, height: number): FakeBitmap {
  return { width, height, close: vi.fn() };
}

const file = (size = 2_000_000, type = 'image/jpeg'): File =>
  new File([new Uint8Array(size)], 'foto.jpg', { type });

let decodeImage: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  encodedType = null;
  FakeOffscreenCanvas.made = [];
  decodeImage = vi.fn(async () => bitmap(4000, 3000));
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('createImageBitmap', decodeImage);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const drawn = (canvas: FakeOffscreenCanvas) => canvas.ctx.calls.find((c) => c[0] === 'drawImage');

describe('fitWidth — the gallery size rule', () => {
  it('scales a wide image down to the maximum width, keeping the aspect ratio', () => {
    expect(fitWidth(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitWidth(3000, 4000, 640)).toEqual({ width: 640, height: 853 });
  });

  it('never scales up', () => {
    expect(fitWidth(800, 600, 1920)).toEqual({ width: 800, height: 600 });
    expect(fitWidth(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
  });

  it('never rounds a side to zero', () => {
    expect(fitWidth(100_000, 10, 1920)).toEqual({ width: 1920, height: 1 });
  });
});

describe('squareCrop — the avatar rule', () => {
  it('takes the centred square of a landscape image', () => {
    expect(squareCrop(4000, 3000, 512)).toEqual({
      crop: { x: 500, y: 0, width: 3000, height: 3000 },
      side: 512,
    });
  });

  it('takes the centred square of a portrait image', () => {
    expect(squareCrop(1080, 1920, 512)).toEqual({
      crop: { x: 0, y: 420, width: 1080, height: 1080 },
      side: 512,
    });
  });

  it('keeps a square whole and never scales a small one up', () => {
    expect(squareCrop(300, 300, 512)).toEqual({
      crop: { x: 0, y: 0, width: 300, height: 300 },
      side: 300,
    });
    expect(squareCrop(300, 200, 512).side).toBe(200);
  });
});

describe('optimizeSquare — an avatar', () => {
  it('draws the centred square at 512px on white and encodes it as JPEG', async () => {
    const pic = bitmap(4000, 3000);
    decodeImage.mockResolvedValueOnce(pic);
    const result = await optimizeSquare(file());

    expect(decodeImage).toHaveBeenCalledWith(expect.any(File), { imageOrientation: 'from-image' });
    expect(FakeOffscreenCanvas.made).toHaveLength(1);
    const [canvas] = FakeOffscreenCanvas.made;
    expect([canvas.width, canvas.height]).toEqual([512, 512]);
    // White first (JPEG has no alpha), then the crop: source rect → full canvas.
    expect(canvas.ctx.calls[0]).toEqual(['fillRect', 'white', 0, 0, 512, 512]);
    expect(drawn(canvas)).toEqual(['drawImage', pic, 500, 0, 3000, 3000, 0, 0, 512, 512]);
    expect(canvas.ctx.imageSmoothingQuality).toBe('high');
    expect(canvas.encoded).toEqual({ type: JPEG_TYPE, quality: SQUARE_DEFAULTS.quality });

    expect(result.blob.type).toBe(JPEG_TYPE);
    expect(result.size).toBe(512);
    expect(result.originalSize).toBe(2_000_000);
    expect(pic.close).toHaveBeenCalledTimes(1);
  });

  it('crops a portrait photo from its middle', async () => {
    const pic = bitmap(1080, 1920);
    decodeImage.mockResolvedValueOnce(pic);
    await optimizeSquare(file());
    expect(drawn(FakeOffscreenCanvas.made[0])).toEqual([
      'drawImage',
      pic,
      0,
      420,
      1080,
      1080,
      0,
      0,
      512,
      512,
    ]);
  });

  it('keeps a small image at its own size', async () => {
    decodeImage.mockResolvedValueOnce(bitmap(300, 200));
    const result = await optimizeSquare(file());
    const [canvas] = FakeOffscreenCanvas.made;
    expect([canvas.width, canvas.height]).toEqual([200, 200]);
    expect(result.size).toBe(200);
  });

  it('takes another size and quality', async () => {
    const result = await optimizeSquare(file(), { size: 256, quality: 0.8 });
    expect(result.size).toBe(256);
    expect(FakeOffscreenCanvas.made[0].encoded).toEqual({ type: JPEG_TYPE, quality: 0.8 });
  });

  it('refuses a browser that hands back another type (WebKit and WebP), and frees the image', async () => {
    encodedType = 'image/png';
    const pic = bitmap(800, 800);
    decodeImage.mockResolvedValueOnce(pic);
    const failure = await optimizeSquare(file()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ImageOptimizerError);
    expect((failure as ImageOptimizerError).reason).toBe('encode');
    expect((failure as Error).message).toBe(IMAGE_OPTIMIZER_MESSAGES.encode);
    expect(pic.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[image-optimizer] encode:',
      'the browser returned image/png instead of image/jpeg',
    );
  });

  it('a file with no pixels is a decode failure', async () => {
    decodeImage.mockResolvedValueOnce(bitmap(0, 0));
    await expect(optimizeSquare(file())).rejects.toMatchObject({ reason: 'decode' });
    expect(FakeOffscreenCanvas.made).toHaveLength(0);
  });

  it('anything that is not a file is invalid, before any work', async () => {
    await expect(optimizeSquare('foto.jpg' as unknown as Blob)).rejects.toMatchObject({
      reason: 'invalid',
      message: IMAGE_OPTIMIZER_MESSAGES.invalid,
    });
    expect(decodeImage).not.toHaveBeenCalled();
  });
});

describe('decoding through an <img> when createImageBitmap refuses the file', () => {
  let createUrl: ReturnType<typeof vi.fn>;
  let revokeUrl: ReturnType<typeof vi.fn>;
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  /** An Image that "loads" (or fails) as soon as it gets a src. */
  function fakeImage(outcome: 'load' | 'error', width = 900, height = 1200) {
    return class {
      naturalWidth = outcome === 'load' ? width : 0;
      naturalHeight = outcome === 'load' ? height : 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => (outcome === 'load' ? this.onload?.() : this.onerror?.()));
      }
    };
  }

  beforeEach(() => {
    decodeImage.mockRejectedValue(new DOMException('unsupported', 'InvalidStateError'));
    createUrl = vi.fn(() => 'blob:fake');
    revokeUrl = vi.fn();
    URL.createObjectURL = createUrl as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeUrl as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  it('uses the image and its natural size', async () => {
    vi.stubGlobal('Image', fakeImage('load', 900, 1200));
    const result = await optimizeSquare(file());
    expect(result.size).toBe(512);
    const call = drawn(FakeOffscreenCanvas.made[0]);
    expect(call?.slice(2)).toEqual([0, 150, 900, 900, 0, 0, 512, 512]);
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
  });

  it('an image the browser cannot read either is a decode failure', async () => {
    vi.stubGlobal('Image', fakeImage('error'));
    await expect(optimizeSquare(file())).rejects.toMatchObject({
      reason: 'decode',
      message: IMAGE_OPTIMIZER_MESSAGES.decode,
    });
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
  });
});

describe('without OffscreenCanvas — a <canvas> element and toBlob()', () => {
  let ctx: FakeContext;
  let toBlobType: string | null;

  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    ctx = new FakeContext();
    toBlobType = null;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
    ) {
      callback(toBlobType === 'none' ? null : new Blob(['x'], { type: toBlobType ?? type }));
    });
  });

  it('draws on a canvas element sized to the output and checks the JPEG', async () => {
    const result = await optimizeSquare(file());
    expect(result.blob.type).toBe(JPEG_TYPE);
    const drawCall = ctx.calls.find((c) => c[0] === 'drawImage');
    expect(drawCall?.slice(2)).toEqual([500, 0, 3000, 3000, 0, 0, 512, 512]);
  });

  it('a PNG fallback or an empty canvas is an encode failure', async () => {
    toBlobType = 'image/png';
    await expect(optimizeSquare(file())).rejects.toMatchObject({ reason: 'encode' });
    toBlobType = 'none';
    await expect(optimizeSquare(file())).rejects.toMatchObject({ reason: 'encode' });
  });

  it('a canvas with no 2D context is an encode failure', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(optimizeSquare(file())).rejects.toMatchObject({ reason: 'encode' });
  });
});

describe('optimizeImage — a gallery upload (DF-004)', () => {
  it('makes a 1920px main and a 640px thumb, both JPEG, at the DF-004 qualities', async () => {
    const pic = bitmap(4000, 3000);
    decodeImage.mockResolvedValueOnce(pic);
    const result = await optimizeImage(file(4_000_000));

    const [main, thumb] = FakeOffscreenCanvas.made;
    expect([main.width, main.height]).toEqual([1920, 1440]);
    expect([thumb.width, thumb.height]).toEqual([640, 480]);
    // The whole image, never cropped.
    expect(drawn(main)).toEqual(['drawImage', pic, 0, 0, 4000, 3000, 0, 0, 1920, 1440]);
    expect(main.encoded).toEqual({ type: JPEG_TYPE, quality: OPTIMIZER_DEFAULTS.quality });
    expect(thumb.encoded).toEqual({ type: JPEG_TYPE, quality: OPTIMIZER_DEFAULTS.thumbQuality });

    expect(result.main.type).toBe(JPEG_TYPE);
    expect(result.thumb.type).toBe(JPEG_TYPE);
    expect([result.width, result.height]).toEqual([1920, 1440]);
    expect(result.originalSize).toBe(4_000_000);
    expect(result.ratio).toBeCloseTo(result.main.size / 4_000_000);
    expect(pic.close).toHaveBeenCalledTimes(1);
  });

  it('never scales a small photo up', async () => {
    decodeImage.mockResolvedValueOnce(bitmap(800, 600));
    const result = await optimizeImage(file());
    const [main, thumb] = FakeOffscreenCanvas.made;
    expect([main.width, main.height]).toEqual([800, 600]);
    expect([thumb.width, thumb.height]).toEqual([640, 480]);
    expect([result.width, result.height]).toEqual([800, 600]);
  });

  it('takes other limits', async () => {
    await optimizeImage(file(), { maxWidth: 1000, thumbWidth: 200, quality: 0.7 });
    const [main, thumb] = FakeOffscreenCanvas.made;
    expect(main.width).toBe(1000);
    expect(thumb.width).toBe(200);
    expect(main.encoded?.quality).toBe(0.7);
  });

  it('fails as a whole when either output is not JPEG', async () => {
    encodedType = 'image/webp';
    await expect(optimizeImage(file())).rejects.toMatchObject({ reason: 'encode' });
  });
});

describe('optimizeMany', () => {
  it('collects the successes and the failures, file by file', async () => {
    const good = [file(10), file(20)];
    const bad = file(30);
    decodeImage.mockImplementation(async (blob: Blob) =>
      blob === bad ? bitmap(0, 0) : bitmap(1000, 800),
    );
    const { results, errors } = await optimizeMany([good[0], bad, good[1]]);
    expect(results.map((r) => r.file)).toEqual(expect.arrayContaining(good));
    expect(results).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe(bad);
    expect(errors[0].error).toBeInstanceOf(ImageOptimizerError);
  });

  it('runs at most `concurrency` files at once, and at least one', async () => {
    let running = 0;
    let peak = 0;
    decodeImage.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((settle) => setTimeout(settle, 1));
      running--;
      return bitmap(100, 100);
    });
    const files = Array.from({ length: 7 }, () => file(5));
    expect((await optimizeMany(files, {}, 2)).results).toHaveLength(7);
    expect(peak).toBe(2);

    peak = 0;
    expect((await optimizeMany(files, {}, 0)).results).toHaveLength(7);
    expect(peak).toBe(1);
  });

  it('an empty list does nothing', async () => {
    expect(await optimizeMany([])).toEqual({ results: [], errors: [] });
    expect(decodeImage).not.toHaveBeenCalled();
  });
});
