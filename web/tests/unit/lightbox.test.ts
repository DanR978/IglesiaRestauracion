// S20 — the lightbox store: the contract a caller (and the component) relies on,
// exercised without rendering anything. The legacy parity cases are called out
// where they are deliberate (wrap-around, the one-photo no-op, the clamped
// start index, the ignored empty list).
//
// share() and download() live here too, so their fallback chains are tested
// against mocked platform APIs rather than through a click.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOWNLOAD_BASENAME,
  SHARE_FALLBACK_TITLE,
  SWIPE_CLOSE_PX,
  SWIPE_NEXT_PX,
  closeLightbox,
  goToPhoto,
  lightbox,
  nextPhoto,
  openLightbox,
  photoAlt,
  photoFilename,
  photoSrc,
  prevPhoto,
  shareUrl,
  type LightboxPhoto,
} from '$lib/stores/lightbox.svelte';
import { toast } from '$lib/stores/toast.svelte';

const CDN = 'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/gallery';

function makePhotos(count: number): LightboxPhoto[] {
  return Array.from({ length: count }, (_, i) => ({
    public_url: `${CDN}/foto-${i + 1}.webp`,
    thumbnail_url: `${CDN}/thumb-${i + 1}.webp`,
    caption: i === 0 ? 'Retiro de jóvenes' : null,
    width: 1200,
    height: 800,
  }));
}

/** jsdom has no navigator.share / navigator.clipboard — install them per test. */
function stubNavigator(props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

function unstubNavigator(...keys: string[]): void {
  for (const key of keys) Reflect.deleteProperty(navigator, key);
}

function messages(): string[] {
  return toast.items.map((item) => item.message);
}

beforeEach(() => {
  closeLightbox();
  toast.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  closeLightbox();
  toast.clear();
  unstubNavigator('share', 'clipboard');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openLightbox', () => {
  it('opens on the requested photo', () => {
    const photos = makePhotos(4);
    openLightbox(photos, 2);

    expect(lightbox.isOpen).toBe(true);
    expect(lightbox.count).toBe(4);
    expect(lightbox.index).toBe(2);
    expect(lightbox.current).toEqual(photos[2]);
  });

  it('defaults to the first photo', () => {
    openLightbox(makePhotos(3));
    expect(lightbox.index).toBe(0);
  });

  it('clamps a start index that is out of range, negative or not a number', () => {
    openLightbox(makePhotos(3), 99);
    expect(lightbox.index).toBe(2);

    openLightbox(makePhotos(3), -5);
    expect(lightbox.index).toBe(0);

    openLightbox(makePhotos(3), Number.NaN);
    expect(lightbox.index).toBe(0);
  });

  it('ignores an empty list and a non-array (legacy parity)', () => {
    openLightbox([]);
    expect(lightbox.isOpen).toBe(false);

    openLightbox(null as unknown as LightboxPhoto[]);
    expect(lightbox.isOpen).toBe(false);
  });

  it('copies the list, so the caller can mutate its own array', () => {
    const photos = makePhotos(2);
    openLightbox(photos, 1);
    photos.push(...makePhotos(3));
    photos.length = 0;

    expect(lightbox.count).toBe(2);
    expect(lightbox.index).toBe(1);
  });
});

describe('navigation', () => {
  it('wraps forward and backward', () => {
    openLightbox(makePhotos(3), 2);

    nextPhoto();
    expect(lightbox.index).toBe(0);
    prevPhoto();
    expect(lightbox.index).toBe(2);
    prevPhoto();
    expect(lightbox.index).toBe(1);
  });

  it('does nothing with a single photo (legacy `length < 2` guard)', () => {
    openLightbox(makePhotos(1));

    nextPhoto();
    prevPhoto();
    expect(lightbox.index).toBe(0);
    expect(lightbox.isOpen).toBe(true);
  });

  it('goToPhoto jumps in range and ignores anything else', () => {
    openLightbox(makePhotos(4));

    goToPhoto(3);
    expect(lightbox.index).toBe(3);

    goToPhoto(4);
    goToPhoto(-1);
    goToPhoto(1.5);
    expect(lightbox.index).toBe(3);
  });
});

describe('closeLightbox', () => {
  it('closes and drops the list', () => {
    openLightbox(makePhotos(3), 1);
    closeLightbox();

    expect(lightbox.isOpen).toBe(false);
    expect(lightbox.count).toBe(0);
    expect(lightbox.index).toBe(0);
    expect(lightbox.current).toBeNull();
  });

  it('is a no-op when already closed', () => {
    expect(() => closeLightbox()).not.toThrow();
    expect(lightbox.isOpen).toBe(false);
  });
});

describe('photo helpers', () => {
  it('photoSrc prefers the full-size URL and falls back to the thumbnail', () => {
    expect(photoSrc({ public_url: 'a.webp', thumbnail_url: 't.webp' })).toBe('a.webp');
    expect(photoSrc({ public_url: '', thumbnail_url: 't.webp' })).toBe('t.webp');
    expect(photoSrc({ public_url: '', thumbnail_url: null })).toBe('');
  });

  it('photoAlt uses the caption, or the position when there is none', () => {
    expect(photoAlt({ public_url: 'a', caption: '  Bautismos  ' }, 0, 3)).toBe('Bautismos');
    expect(photoAlt({ public_url: 'a', caption: null }, 1, 3)).toBe('Foto 2 de 3');
    expect(photoAlt({ public_url: 'a', caption: '   ' }, 2, 3)).toBe('Foto 3 de 3');
  });

  it('photoFilename follows the real extension, not the legacy hardcoded .jpg', () => {
    const webp: LightboxPhoto = { public_url: `${CDN}/a.webp` };
    expect(photoFilename(webp, 0)).toBe(`${DOWNLOAD_BASENAME}-1.webp`);
    expect(photoFilename({ public_url: `${CDN}/a.JPEG?token=x` }, 2)).toBe('foto-3.jpg');
    expect(photoFilename({ public_url: `${CDN}/a.png#x` }, 0)).toBe('foto-1.png');
    // No extension in the URL → the blob's media type decides.
    expect(photoFilename({ public_url: `${CDN}/object/1234` }, 0, 'image/avif')).toBe(
      'foto-1.avif',
    );
    expect(photoFilename({ public_url: `${CDN}/object/1234` }, 0, 'image/png;charset=utf-8')).toBe(
      'foto-1.png',
    );
    // Nothing to go on at all → the legacy default.
    expect(photoFilename({ public_url: `${CDN}/object/1234` }, 0)).toBe('foto-1.jpg');
  });

  it('shareUrl leaves an absolute URL alone and resolves a relative one', () => {
    expect(shareUrl(`${CDN}/a.webp`)).toBe(`${CDN}/a.webp`);
    expect(shareUrl('/galeria/a.webp')).toBe(`${location.origin}/galeria/a.webp`);
  });
});

describe('swipe thresholds', () => {
  it('keeps the legacy distances', () => {
    expect(SWIPE_NEXT_PX).toBe(50);
    expect(SWIPE_CLOSE_PX).toBe(80);
  });
});

describe('share', () => {
  it('uses the Web Share API with the caption as the title', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    openLightbox(makePhotos(2));

    await lightbox.share();

    expect(share).toHaveBeenCalledWith({
      title: 'Retiro de jóvenes',
      url: `${CDN}/foto-1.webp`,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it('falls back to the church title when the photo has no caption', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });
    openLightbox(makePhotos(2), 1);

    await lightbox.share();

    expect(share).toHaveBeenCalledWith({
      title: SHARE_FALLBACK_TITLE,
      url: `${CDN}/foto-2.webp`,
    });
  });

  it('treats a cancelled share as done — no clipboard copy, no toast', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    openLightbox(makePhotos(2));

    await lightbox.share();

    expect(writeText).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it('copies the link when the share sheet fails for any other reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    openLightbox(makePhotos(2));

    await lightbox.share();

    expect(writeText).toHaveBeenCalledWith(`${CDN}/foto-1.webp`);
    expect(messages()).toEqual(['Enlace copiado']);
  });

  it('copies the link on a browser with no Web Share API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    openLightbox(makePhotos(2));

    await lightbox.share();

    expect(writeText).toHaveBeenCalledWith(`${CDN}/foto-1.webp`);
    expect(messages()).toEqual(['Enlace copiado']);
  });

  it('shares an ABSOLUTE link even when the photo URL is a site-relative path', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });
    openLightbox([{ public_url: '/galeria/foto.webp', caption: null }]);

    await lightbox.share();

    expect(share).toHaveBeenCalledWith({
      title: SHARE_FALLBACK_TITLE,
      url: `${location.origin}/galeria/foto.webp`,
    });
  });

  it('reports a human error when neither sharing nor copying is possible', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    openLightbox(makePhotos(2));

    await lightbox.share();

    expect(messages()).toEqual(['No pudimos copiar el enlace de la foto.']);
    expect(toast.items[0].variant).toBe('error');
  });

  it('does nothing while closed', async () => {
    const share = vi.fn();
    stubNavigator({ share });

    await lightbox.share();

    expect(share).not.toHaveBeenCalled();
  });
});

describe('download', () => {
  const anchors: HTMLAnchorElement[] = [];
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    anchors.length = 0;
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    // jsdom would try to navigate on a real anchor click.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchors.push(this);
    });
  });

  it('fetches the bytes and hands over a same-origin blob (the cross-origin `download` fix)', async () => {
    const blob = new Blob(['bytes'], { type: 'image/webp' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal('fetch', fetchMock);
    openLightbox(makePhotos(3), 1);

    await lightbox.download();

    expect(fetchMock).toHaveBeenCalledWith(`${CDN}/foto-2.webp`, {
      mode: 'cors',
      credentials: 'omit',
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute('href')).toBe('blob:mock-url');
    expect(anchors[0].download).toBe('foto-2.webp');
    // The anchor is a means, not markup: it never stays in the document.
    expect(anchors[0].isConnected).toBe(false);
    expect(messages()).toEqual([]);
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'));
  });

  it('reports a human error on an HTTP failure and downloads nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, blob: async () => new Blob() }),
    );
    openLightbox(makePhotos(2));

    await lightbox.download();

    expect(anchors).toHaveLength(0);
    expect(messages()).toEqual(['No pudimos descargar la foto. Intenta de nuevo.']);
    expect(toast.items[0].variant).toBe('error');
  });

  it('reports a human error when the request itself fails (offline, CORS)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    openLightbox(makePhotos(2));

    await lightbox.download();

    expect(messages()).toEqual(['No pudimos descargar la foto. Intenta de nuevo.']);
  });

  it('flags itself busy and refuses a second download until the first settles', async () => {
    let release: (value: { ok: boolean; blob: () => Promise<Blob> }) => void = () => {};
    const pending = new Promise<{ ok: boolean; blob: () => Promise<Blob> }>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);
    openLightbox(makePhotos(2));

    const first = lightbox.download();
    expect(lightbox.downloading).toBe(true);
    await lightbox.download();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release({ ok: true, blob: async () => new Blob(['x'], { type: 'image/webp' }) });
    await first;
    expect(lightbox.downloading).toBe(false);
  });

  it('does nothing while closed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await lightbox.download();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
