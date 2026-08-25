// S20 — <Lightbox> under jsdom: the ROADMAP "done when" as tests.
// openLightbox(photos, i) opens it, the keys navigate the way the legacy did
// (wrap with two or more photos, stop with one), Escape closes and hands the
// focus back, the body scroll is locked and restored, the swipe thresholds
// behave, share falls back to the clipboard and download goes through
// fetch → blob instead of a cross-origin `download` attribute.
//
// Everything is driven from OUTSIDE the component, exactly as a gallery grid
// or a repo module would drive it; flushSync() applies those module-level
// mutations to the DOM.
import { fireEvent, render } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Lightbox from '$lib/components/Lightbox.svelte';
import {
  closeLightbox,
  lightbox,
  openLightbox,
  type LightboxPhoto,
} from '$lib/stores/lightbox.svelte';
import { toast } from '$lib/stores/toast.svelte';

const CDN = 'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/gallery';

const PHOTOS: LightboxPhoto[] = [
  { public_url: `${CDN}/foto-1.webp`, caption: 'Retiro de jóvenes', width: 1200, height: 800 },
  { public_url: `${CDN}/foto-2.webp`, caption: null, width: 800, height: 1200 },
  { public_url: `${CDN}/foto-3.webp`, caption: 'Navidad 2025', width: 1000, height: 1000 },
];

/** Open the viewer the way a caller does, then let Svelte write the DOM. */
function open(photos: LightboxPhoto[] = PHOTOS, index = 0): void {
  openLightbox(photos, index);
  flushSync();
}

/** The one element matching `selector`, or a readable failure. */
function el(selector: string): HTMLElement {
  const found = document.body.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`no element matches ${selector}`);
  return found;
}

function dialog(): HTMLElement {
  return el('.lightbox');
}

function counter(): string {
  return document.body.querySelector('.lightbox__counter')?.textContent?.trim() ?? '';
}

async function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  await fireEvent.keyDown(document, { key, ...init });
  flushSync();
}

/**
 * jsdom implements no Touch Events, so the swipe is dispatched by hand — a
 * bubbling event carrying the two coordinate lists the handler reads.
 */
function swipe(from: [number, number], to: [number, number]): void {
  const el = dialog();
  const start = new Event('touchstart', { bubbles: true });
  Object.defineProperty(start, 'touches', { value: [{ clientX: from[0], clientY: from[1] }] });
  el.dispatchEvent(start);

  const end = new Event('touchend', { bubbles: true });
  Object.defineProperty(end, 'touches', { value: [] });
  Object.defineProperty(end, 'changedTouches', { value: [{ clientX: to[0], clientY: to[1] }] });
  el.dispatchEvent(end);
  flushSync();
}

beforeEach(() => {
  closeLightbox();
  toast.clear();
  document.body.style.overflow = '';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  closeLightbox();
  flushSync();
  toast.clear();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Lightbox — opening from the store', () => {
  it('renders nothing until openLightbox is called', () => {
    render(Lightbox);
    expect(document.body.querySelector('.lightbox')).toBeNull();
  });

  it('opens on the requested photo as a labelled modal dialog', async () => {
    render(Lightbox);
    open(PHOTOS, 1);

    const el = dialog();
    expect(el).toHaveAttribute('role', 'dialog');
    expect(el).toHaveAttribute('aria-modal', 'true');
    expect(el).toHaveAttribute('aria-label', 'Visor de imagen');
    expect(counter()).toBe('2 / 3');

    const img = document.body.querySelector<HTMLImageElement>('.lightbox__img');
    expect(img?.getAttribute('src')).toBe(`${CDN}/foto-2.webp`);
    expect(img).toHaveAttribute('width', '800');
    expect(img).toHaveAttribute('height', '1200');
    await tick();
  });

  it('names an uncaptioned photo by its position instead of leaving alt empty', () => {
    render(Lightbox);
    open(PHOTOS, 1);

    expect(document.body.querySelector('.lightbox__img')).toHaveAttribute('alt', 'Foto 2 de 3');
    expect(document.body.querySelector('.lightbox__caption')?.textContent).toBe('');
  });

  it('renders the caption as text, never as markup (D-005)', () => {
    render(Lightbox);
    open([
      { public_url: `${CDN}/x.webp`, caption: '<img src=x onerror="alert(1)"> & <b>hola</b>' },
    ]);

    const caption = document.body.querySelector('.lightbox__caption');
    expect(caption?.querySelector('img')).toBeNull();
    expect(caption?.querySelector('b')).toBeNull();
    expect(caption?.textContent).toBe('<img src=x onerror="alert(1)"> & <b>hola</b>');
  });

  it('keeps a single dialog when a second album is opened over the first', () => {
    render(Lightbox);
    open(PHOTOS, 2);
    open([{ public_url: `${CDN}/otra.webp`, caption: 'Otro álbum' }]);

    expect(document.body.querySelectorAll('.lightbox')).toHaveLength(1);
    expect(counter()).toBe('1 / 1');
  });
});

describe('Lightbox — keyboard', () => {
  it('walks with the arrows and wraps around both ends', async () => {
    render(Lightbox);
    open(PHOTOS, 2);

    await press('ArrowRight');
    expect(counter()).toBe('1 / 3');

    await press('ArrowLeft');
    expect(counter()).toBe('3 / 3');

    await press('ArrowLeft');
    expect(counter()).toBe('2 / 3');
  });

  it('stops on a one-photo album, and disables both arrows (legacy parity)', async () => {
    render(Lightbox);
    open([PHOTOS[0]]);

    await press('ArrowRight');
    await press('ArrowLeft');
    expect(counter()).toBe('1 / 1');

    const [prev, next] = document.body.querySelectorAll<HTMLButtonElement>('.lightbox__nav');
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
  });

  it('closes on Escape', async () => {
    render(Lightbox);
    open();

    await press('Escape');
    expect(document.body.querySelector('.lightbox')).toBeNull();
    expect(lightbox.isOpen).toBe(false);
  });

  it('leaves Ctrl/⌘ combinations to the browser', async () => {
    render(Lightbox);
    open(PHOTOS, 0);

    await press('ArrowRight', { ctrlKey: true });
    await press('f', { metaKey: true });
    expect(counter()).toBe('1 / 3');
  });

  it('keeps Tab inside the dialog', async () => {
    render(Lightbox);
    open();
    await tick();

    const controls = [
      ...document.body.querySelectorAll<HTMLButtonElement>('.lightbox button'),
    ].filter((button) => button.tabIndex !== -1);
    controls[controls.length - 1].focus();
    await press('Tab');

    expect(document.activeElement).toBe(controls[0]);
  });
});

describe('Lightbox — pointer, swipe and the backdrop', () => {
  it('navigates with the on-screen arrows', async () => {
    render(Lightbox);
    open(PHOTOS, 0);

    await fireEvent.click(el('.lightbox__nav--next'));
    flushSync();
    expect(counter()).toBe('2 / 3');

    await fireEvent.click(el('.lightbox__nav--prev'));
    flushSync();
    expect(counter()).toBe('1 / 3');
  });

  it('closes on the backdrop and on the Cerrar button', async () => {
    render(Lightbox);
    open();

    await fireEvent.click(el('.lightbox__scrim'));
    flushSync();
    expect(lightbox.isOpen).toBe(false);

    open();
    await fireEvent.click(el('.lightbox__close'));
    flushSync();
    expect(lightbox.isOpen).toBe(false);
  });

  it('swipes sideways to change photo and down to close (legacy thresholds)', () => {
    render(Lightbox);
    open(PHOTOS, 0);

    swipe([300, 200], [200, 210]); // 100px left → next
    expect(counter()).toBe('2 / 3');

    swipe([200, 200], [320, 215]); // 120px right → previous
    expect(counter()).toBe('1 / 3');

    swipe([200, 200], [230, 240]); // 40px: below the threshold, nothing happens
    expect(counter()).toBe('1 / 3');

    swipe([200, 100], [210, 300]); // 200px down → close
    expect(lightbox.isOpen).toBe(false);
  });
});

describe('Lightbox — scroll lock and focus', () => {
  it('locks the body scroll while open and restores what was there before', () => {
    document.body.style.overflow = 'auto';
    render(Lightbox);

    open();
    expect(document.body.style.overflow).toBe('hidden');

    closeLightbox();
    flushSync();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('moves focus into the dialog and returns it to the opener on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Ver foto';
    document.body.append(trigger);
    trigger.focus();

    render(Lightbox);
    open();
    await tick();
    expect(document.activeElement).toBe(dialog());

    closeLightbox();
    flushSync();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe('Lightbox — share, download and full screen', () => {
  it('copies the link and confirms it when the browser has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { getByLabelText } = render(Lightbox);
    open(PHOTOS, 2);

    await fireEvent.click(getByLabelText('Compartir la foto'));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(`${CDN}/foto-3.webp`));
    await vi.waitFor(() =>
      expect(toast.items.map((item) => item.message)).toEqual(['Enlace copiado']),
    );

    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('downloads through fetch → blob, not a cross-origin `download` attribute', async () => {
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchors.push(this);
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock-url'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const blob = new Blob(['bytes'], { type: 'image/webp' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal('fetch', fetchMock);

    const { getByLabelText } = render(Lightbox);
    open(PHOTOS, 1);

    await fireEvent.click(getByLabelText('Descargar la foto'));
    await vi.waitFor(() => expect(anchors).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledWith(`${CDN}/foto-2.webp`, {
      mode: 'cors',
      credentials: 'omit',
    });
    expect(anchors[0].download).toBe('foto-2.webp');
    expect(anchors[0].getAttribute('href')).toBe('blob:mock-url');
    expect(toast.items).toHaveLength(0);
  });

  it('surfaces a human error when the download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { getByLabelText } = render(Lightbox);
    open();

    await fireEvent.click(getByLabelText('Descargar la foto'));
    await vi.waitFor(() =>
      expect(toast.items.map((item) => item.message)).toEqual([
        'No pudimos descargar la foto. Intenta de nuevo.',
      ]),
    );
    expect(toast.items[0].variant).toBe('error');
  });

  it('offers full screen without breaking where the API is missing (jsdom)', async () => {
    const { getByLabelText } = render(Lightbox);
    open();

    const button = getByLabelText('Pantalla completa');
    await fireEvent.click(button);
    flushSync();

    expect(document.body.querySelector('.lightbox')).not.toBeNull();
    expect(getByLabelText('Pantalla completa')).toBe(button);
  });

  it('names every icon-only control and keeps its glyph decorative', () => {
    const { getByLabelText } = render(Lightbox);
    open();

    for (const name of [
      'Foto anterior',
      'Foto siguiente',
      'Compartir la foto',
      'Descargar la foto',
      'Pantalla completa',
    ]) {
      const control = getByLabelText(name);
      expect(control.tagName).toBe('BUTTON');
      expect(control.querySelector('.icon')).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
