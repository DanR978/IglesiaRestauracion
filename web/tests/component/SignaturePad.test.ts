// S19 — SignaturePad.svelte under jsdom: the pad announces itself, the
// controller methods are exposed on the instance, drawing emits a trimmed PNG
// through `onchange`, clear() empties it again, and a browser with no 2D
// context degrades to the typed-signature message instead of throwing.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignaturePad from '$lib/components/SignaturePad.svelte';
import {
  flush,
  installCanvasMock,
  installImageMock,
  pointer,
  type CanvasMock,
  type ImageMock,
} from '../helpers/canvas-mock';

let mock: CanvasMock;
let images: ImageMock;

/** The exports SignaturePad.svelte puts on its instance. */
interface PadExports {
  clear(): void;
  isEmpty(): boolean;
  toDataURL(): string;
  loadDataURL(url: string): Promise<boolean>;
  resize(): void;
}

async function mountPad(props: Record<string, unknown> = {}) {
  const result = render(SignaturePad, props);
  // Two cycles: the setup effect mounts the controller, its state lands in the
  // next one. flush() then lets a restored image finish decoding.
  await tick();
  await tick();
  await flush();
  const canvas = result.container.querySelector('canvas');
  if (!canvas) throw new Error('no canvas rendered');
  return { ...result, canvas, pad: result.component as unknown as PadExports };
}

/** Ink the pad and tell the mock which pixels came out opaque. */
async function sign(canvas: HTMLCanvasElement): Promise<void> {
  mock.ctx(canvas).inkBox = { x0: 20, y0: 20, x1: 120, y1: 60 };
  canvas.dispatchEvent(pointer('pointerdown', 20, 20));
  canvas.dispatchEvent(pointer('pointermove', 120, 60));
  canvas.dispatchEvent(pointer('pointerup', 120, 60));
  await tick();
}

beforeEach(() => {
  mock = installCanvasMock();
  images = installImageMock();
});

afterEach(() => {
  images.restore();
  vi.restoreAllMocks();
});

describe('SignaturePad — markup and a11y', () => {
  it('names the drawing area and shows the hint until it is signed', async () => {
    const { getByRole, getByText, canvas, container } = await mountPad();
    // The name is on the wrapper — <canvas> is embedded content and cannot
    // carry a non-interactive role.
    const area = getByRole('img', { name: 'Área de firma' });
    expect(area).toBe(container.querySelector('.sigpad__paper'));
    expect(area).toContainElement(canvas);
    expect(getByText('Firma aquí')).toHaveClass('sigpad__hint');
    expect(getByRole('status')).toHaveTextContent('Sin firma.');

    await sign(canvas);
    expect(getByRole('status')).toHaveTextContent('Firma capturada.');
  });

  it('describes the pad with its helper text, and drops it when suppressed', async () => {
    const withText = await mountPad();
    const paper = withText.container.querySelector('.sigpad__paper')!;
    const described = paper.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(withText.container.querySelector(`#${described}`)).toHaveTextContent(
      'Dibuja tu firma con el dedo',
    );

    const bare = await mountPad({ description: '' });
    expect(bare.container.querySelector('.sigpad__paper')).not.toHaveAttribute('aria-describedby');
  });

  it('applies the variant class and keeps a custom class', async () => {
    const framed = await mountPad({ class: 'wv-sigmount' });
    expect(framed.container.querySelector('.sigpad')).toHaveClass('sigpad--framed', 'wv-sigmount');

    const bare = await mountPad({ variant: 'bare' });
    expect(bare.container.querySelector('.sigpad')).toHaveClass('sigpad--bare');
    expect(bare.container.querySelector('.sigpad')).not.toHaveClass('sigpad--framed');
  });

  it('sizes the drawing box from `height` before the controller measures it', async () => {
    const { container } = await mountPad({ height: 64 });
    expect(container.querySelector('.sigpad__paper')!.getAttribute('style')).toContain(
      '--sigpad-h: 64px',
    );
  });
});

describe('SignaturePad — exposed controller', () => {
  it('exposes clear / loadDataURL / isEmpty (plus toDataURL and resize)', async () => {
    const { pad } = await mountPad();
    for (const name of ['clear', 'loadDataURL', 'isEmpty', 'toDataURL', 'resize'] as const) {
      expect(typeof pad[name], name).toBe('function');
    }
    expect(pad.isEmpty()).toBe(true);
    expect(pad.toDataURL()).toBe('');
  });

  it('clear() empties the pad and resets the announced state', async () => {
    const { pad, canvas, getByRole } = await mountPad();
    await sign(canvas);
    expect(pad.isEmpty()).toBe(false);

    pad.clear();
    await tick();
    expect(pad.isEmpty()).toBe(true);
    expect(getByRole('status')).toHaveTextContent('Sin firma.');
  });

  it('loadDataURL() restores a stored signature and adopts it as the value', async () => {
    const changes: string[] = [];
    const { pad, getByRole } = await mountPad({ onchange: (url: string) => changes.push(url) });

    await expect(pad.loadDataURL('data:image/png;base64,AAAA')).resolves.toBe(true);
    await tick();
    expect(pad.isEmpty()).toBe(false);
    expect(getByRole('status')).toHaveTextContent('Firma capturada.');
    // A programmatic restore must not re-emit a re-encoded payload.
    expect(changes).toEqual([]);
  });
});

describe('SignaturePad — value + onchange', () => {
  it('emits the trimmed PNG when a stroke finishes and "" when cleared', async () => {
    const changes: string[] = [];
    const { pad, canvas } = await mountPad({ onchange: (url: string) => changes.push(url) });

    await sign(canvas);
    expect(changes).toHaveLength(1);
    expect(changes[0].startsWith('data:image/png;base64,')).toBe(true);

    pad.clear();
    await tick();
    expect(changes).toEqual([changes[0], '']);
  });

  it('paints an initial value onto the pad on mount', async () => {
    const { pad, getByRole } = await mountPad({ value: 'data:image/png;base64,AAAA' });
    expect(pad.isEmpty()).toBe(false);
    expect(getByRole('status')).toHaveTextContent('Firma capturada.');
  });
});

describe('SignaturePad — clear button', () => {
  it('is disabled while empty, enabled once signed, and wipes the pad', async () => {
    const { pad, canvas, getByRole } = await mountPad();
    const button = getByRole('button', { name: 'Borrar firma' });
    expect(button).toBeDisabled();

    await sign(canvas);
    expect(button).toBeEnabled();

    button.click();
    await tick();
    expect(pad.isEmpty()).toBe(true);
    expect(button).toBeDisabled();
  });

  it('can be replaced by the host', async () => {
    const { queryByRole } = await mountPad({ clearable: false });
    expect(queryByRole('button')).toBeNull();
  });

  it('stays disabled while the pad is disabled', async () => {
    const { getByRole } = await mountPad({ disabled: true });
    expect(getByRole('button', { name: 'Borrar firma' })).toBeDisabled();
  });
});

describe('SignaturePad — no canvas support', () => {
  it('degrades to the typed-signature message instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mock.denyContext();

    const { getByRole } = await mountPad();
    expect(getByRole('alert')).toHaveTextContent('Escribe tu nombre completo');
    expect(warn).toHaveBeenCalledWith(
      '[signature-pad] canvas unavailable:',
      expect.stringContaining('2D context'),
    );
  });
});
