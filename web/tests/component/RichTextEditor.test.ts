// S18 — RichTextEditor.svelte under jsdom.
//
// The two acceptance criteria are behavioural, so they are tested as behaviour:
//   1. the caret does not jump while typing — the surface's DOM nodes keep their
//      IDENTITY across an edit and across the value echo a bound parent pushes
//      back, and the live selection is untouched;
//   2. everything is sanitized in BOTH directions — an initial value, setHtml(),
//      a paste and a drop on the way IN; onchange / value / getHtml() on the way
//      OUT (MIGRATION.md D-005).
//
// jsdom has no execCommand / queryCommandState (they are deprecated APIs it
// never implemented), so both are installed as spies: that is also how the
// toolbar's command ids are asserted to match the legacy ones verbatim.
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RichTextEditor from '$lib/components/RichTextEditor.svelte';
import {
  RICH_TEXT_SWATCHES,
  RICH_TEXT_TOOLS,
  normalizeLinkUrl,
  safeHexColor,
} from '$lib/components/rich-text';

interface CommandDocument {
  execCommand: ReturnType<typeof vi.fn>;
  queryCommandState: ReturnType<typeof vi.fn>;
}

const commandDoc = () => document as unknown as CommandDocument;

beforeEach(() => {
  Object.assign(document, {
    execCommand: vi.fn(() => true),
    queryCommandState: vi.fn(() => false),
  });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  Reflect.deleteProperty(document, 'queryCommandState');
});

const area = (container: HTMLElement) => container.querySelector<HTMLElement>('.rt__area')!;
const toolbar = (container: HTMLElement) => container.querySelector<HTMLElement>('.rt__toolbar')!;
const toggle = (container: HTMLElement) => container.querySelector<HTMLElement>('.rt__toggle')!;
const tool = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(`[data-rt-key="${key}"]`)!;

/** Put a collapsed caret at `offset` inside `node` and hand back the range. */
function placeCaret(node: Node, offset: number): Range {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

function clipboardEvent(type: 'paste', html: string, text = ''): ClipboardEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (kind: string) => (kind === 'text/html' ? html : text) },
  });
  return event as ClipboardEvent;
}

function dropEvent(html: string, text = ''): DragEvent {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (kind: string) => (kind === 'text/html' ? html : text) },
  });
  return event as DragEvent;
}

describe('RichTextEditor — structure and the ported toolbar', () => {
  it('names the surface, keeps the toolbar hidden and offers the Formato toggle', async () => {
    const { container, getByRole } = render(RichTextEditor, {
      label: 'Descripción',
      placeholder: 'De qué se trata el evento...',
    });
    await tick();

    expect(getByRole('textbox', { name: 'Descripción' })).toBe(area(container));
    expect(area(container)).toHaveAttribute('contenteditable', 'true');
    expect(area(container)).toHaveAttribute('data-placeholder', 'De qué se trata el evento...');
    expect(area(container)).toHaveClass('is-empty');

    // Teams-style: the bar stays out of the way until you ask for it.
    expect(toolbar(container)).toHaveAttribute('hidden');
    expect(toggle(container)).toHaveAttribute('aria-pressed', 'false');
  });

  it('reveals every legacy command, each with its Spanish accessible name', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();
    await fireEvent.click(toggle(container));

    expect(toolbar(container)).not.toHaveAttribute('hidden');
    expect(toggle(container)).toHaveAttribute('aria-pressed', 'true');
    expect(toolbar(container)).toHaveAttribute('role', 'toolbar');

    for (const entry of RICH_TEXT_TOOLS) {
      const button = tool(container, entry.command);
      expect(button, entry.command).toBeTruthy();
      expect(button).toHaveAttribute('aria-label', entry.label);
      // Only a toggle reports pressed state; createLink/removeFormat are actions.
      if (entry.stateful) expect(button).toHaveAttribute('aria-pressed', 'false');
      else expect(button).not.toHaveAttribute('aria-pressed');
    }
    expect(tool(container, 'color')).toHaveAttribute('aria-label', 'Color del texto');
  });

  it('gives the toolbar one tab stop and moves between controls with the arrows', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();
    await fireEvent.click(toggle(container));

    expect(tool(container, 'bold')).toHaveAttribute('tabindex', '0');
    expect(tool(container, 'italic')).toHaveAttribute('tabindex', '-1');

    await fireEvent.keyDown(toolbar(container), { key: 'ArrowRight' });
    expect(tool(container, 'italic')).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(tool(container, 'italic'));

    await fireEvent.keyDown(toolbar(container), { key: 'End' });
    expect(tool(container, 'removeFormat')).toHaveAttribute('tabindex', '0');
  });

  it('mirrors the browser command state into aria-pressed', async () => {
    commandDoc().queryCommandState.mockImplementation((command: string) => command === 'bold');
    const { container } = render(RichTextEditor, { label: 'Descripción', value: '<p>Hola</p>' });
    await tick();
    await fireEvent.click(toggle(container));

    placeCaret(area(container).querySelector('p')!.firstChild!, 1);
    await fireEvent.input(area(container));
    await tick();

    expect(tool(container, 'bold')).toHaveAttribute('aria-pressed', 'true');
    expect(tool(container, 'italic')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('RichTextEditor — the caret does not jump', () => {
  it('leaves the surface DOM untouched when the edit echoes back through value', async () => {
    const onchange = vi.fn();
    const { container, rerender } = render(RichTextEditor, {
      label: 'Descripción',
      value: '<p>Hola</p>',
      onchange,
    });
    await tick();

    const paragraph = area(container).querySelector('p')!;
    const text = paragraph.firstChild as Text;
    placeCaret(text, 4);

    // The keystroke: the browser mutates the text node in place and fires input.
    text.data = 'Holaa';
    placeCaret(text, 5);
    await fireEvent.input(area(container));
    await tick();

    expect(onchange).toHaveBeenCalledWith('<p>Holaa</p>');
    // Node IDENTITY is the assertion: a re-render would have replaced these.
    expect(area(container).querySelector('p')).toBe(paragraph);
    expect(paragraph.firstChild).toBe(text);

    const selection = document.getSelection()!;
    expect(selection.anchorNode).toBe(text);
    expect(selection.anchorOffset).toBe(5);

    // A bound parent pushes the same value straight back — the echo guard must
    // swallow it, or every keystroke would reset the caret to the start.
    await rerender({ value: '<p>Holaa</p>' });
    await tick();
    expect(area(container).querySelector('p')).toBe(paragraph);
    expect(paragraph.firstChild).toBe(text);
    expect(document.getSelection()!.anchorOffset).toBe(5);
  });

  it('survives a run of keystrokes without ever re-rendering the surface', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción', value: '<p>a</p>' });
    await tick();
    const text = area(container).querySelector('p')!.firstChild as Text;

    for (const next of ['ab', 'abc', 'abcd', 'abcde']) {
      text.data = next;
      placeCaret(text, next.length);
      await fireEvent.input(area(container));
      await tick();
      expect(area(container).querySelector('p')!.firstChild).toBe(text);
      expect(document.getSelection()!.anchorOffset).toBe(next.length);
    }
  });

  it('still applies a genuinely EXTERNAL value (a different row loaded into the form)', async () => {
    const { container, rerender } = render(RichTextEditor, {
      label: 'Descripción',
      value: '<p>Hola</p>',
    });
    await tick();
    const paragraph = area(container).querySelector('p')!;

    await rerender({ value: '<p>Otro evento</p>' });
    await tick();

    expect(area(container).querySelector('p')).not.toBe(paragraph);
    expect(area(container).textContent).toBe('Otro evento');
  });
});

describe('RichTextEditor — sanitized on the way in', () => {
  it('cleans the initial value before it reaches the surface', async () => {
    const { container } = render(RichTextEditor, {
      label: 'Descripción',
      value: '<b>Hola</b><script>alert(1)</script><img src="x" onerror="alert(1)">',
    });
    await tick();

    expect(area(container).innerHTML).toBe('<b>Hola</b>');
    expect(area(container).querySelector('script')).toBeNull();
    expect(area(container).querySelector('img')).toBeNull();
  });

  it('cleans a paste, and never lets the raw clipboard HTML touch the DOM', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();

    area(container).dispatchEvent(
      clipboardEvent('paste', '<b>ok</b><img src="x" onerror="alert(1)">', 'ok'),
    );
    await tick();

    expect(commandDoc().execCommand).toHaveBeenCalledWith('insertHTML', false, '<b>ok</b>');
  });

  it('escapes a plain-text paste instead of inserting it as markup', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();

    area(container).dispatchEvent(clipboardEvent('paste', '', 'a < b\nc & d'));
    await tick();

    expect(commandDoc().execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      'a &lt; b<br>c &amp; d',
    );
  });

  it('cleans a drop — the hole the legacy paste handler left open', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();

    area(container).dispatchEvent(dropEvent('<i>hola</i><script>alert(1)</script>'));
    await tick();

    expect(commandDoc().execCommand).toHaveBeenCalledWith('insertHTML', false, '<i>hola</i>');
  });

  it('cleans a programmatic setHtml() through the component ref', async () => {
    const { container, component } = render(RichTextEditor, { label: 'Descripción' });
    await tick();

    component.setHtml('<p>Bien</p><iframe src="https://evil.example"></iframe>');
    await tick();

    expect(area(container).innerHTML).toBe('<p>Bien</p>');
    expect(component.getHtml()).toBe('<p>Bien</p>');
    expect(component.isEmpty()).toBe(false);
  });
});

describe('RichTextEditor — sanitized on the way out', () => {
  it('emits the sanitized value on save even when the surface holds junk', async () => {
    const onchange = vi.fn();
    const { container, component } = render(RichTextEditor, { label: 'Descripción', onchange });
    await tick();

    // Whatever a browser quirk, an extension or a drag left behind:
    area(container).innerHTML =
      '<b>Hola</b><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">clic</a>';
    await fireEvent.input(area(container));
    await tick();

    expect(onchange).toHaveBeenCalledWith('<b>Hola</b><a>clic</a>');
    expect(component.getHtml()).toBe('<b>Hola</b><a>clic</a>');
  });

  it('reports emptiness from the sanitized value, not from the raw markup', async () => {
    const { container, component } = render(RichTextEditor, { label: 'Descripción' });
    await tick();

    area(container).innerHTML = '<img src="x" onerror="alert(1)">';
    await fireEvent.input(area(container));
    await tick();

    expect(component.isEmpty()).toBe(true);
    expect(area(container)).toHaveClass('is-empty');
  });
});

describe('RichTextEditor — commands, colour and links', () => {
  it('issues the legacy execCommand id for every simple tool', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();
    await fireEvent.click(toggle(container));

    for (const entry of RICH_TEXT_TOOLS) {
      if (entry.command === 'createLink') continue;
      commandDoc().execCommand.mockClear();
      await fireEvent.click(tool(container, entry.command));
      expect(commandDoc().execCommand).toHaveBeenCalledWith(entry.command, false, undefined);
    }
  });

  it('applies a swatch as foreColor and closes the panel', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();
    await fireEvent.click(toggle(container));
    await fireEvent.click(tool(container, 'color'));

    expect(tool(container, 'color')).toHaveAttribute('aria-expanded', 'true');
    const swatches = container.querySelectorAll<HTMLElement>('.rt__swatch');
    expect(swatches).toHaveLength(RICH_TEXT_SWATCHES.length);

    await fireEvent.click(swatches[1]);
    expect(commandDoc().execCommand).toHaveBeenCalledWith(
      'foreColor',
      false,
      RICH_TEXT_SWATCHES[1].value,
    );
    expect(tool(container, 'color')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a link panel instead of a native prompt(), and normalizes the URL', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();
    await fireEvent.click(toggle(container));
    await fireEvent.click(tool(container, 'createLink'));

    const input = container.querySelector<HTMLInputElement>('.rt__input')!;
    await fireEvent.input(input, { target: { value: 'irdlex.org/eventos' } });
    await fireEvent.click(container.querySelector<HTMLElement>('.rt__panel-btn')!);

    expect(commandDoc().execCommand).toHaveBeenCalledWith(
      'createLink',
      false,
      'https://irdlex.org/eventos',
    );
  });

  it('refuses a javascript: link outright', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();
    await fireEvent.click(toggle(container));
    await fireEvent.click(tool(container, 'createLink'));

    const input = container.querySelector<HTMLInputElement>('.rt__input')!;
    await fireEvent.input(input, { target: { value: 'javascript:alert(1)' } });
    await fireEvent.click(container.querySelector<HTMLElement>('.rt__panel-btn')!);

    expect(commandDoc().execCommand).not.toHaveBeenCalledWith(
      'createLink',
      false,
      expect.anything(),
    );
  });

  it('closes an open panel on Escape and hands focus back to its trigger', async () => {
    const { container } = render(RichTextEditor, { label: 'Descripción' });
    await tick();
    await fireEvent.click(toggle(container));
    await fireEvent.click(tool(container, 'color'));
    expect(container.querySelector('.rt__panel')).toBeTruthy();

    await fireEvent.keyDown(toolbar(container), { key: 'Escape' });
    expect(container.querySelector('.rt__panel')).toBeNull();
    expect(document.activeElement).toBe(tool(container, 'color'));
  });
});

describe('RichTextEditor — read-only', () => {
  it('stops accepting input and disables every control', async () => {
    const onchange = vi.fn();
    const { container } = render(RichTextEditor, {
      label: 'Descripción',
      value: '<p>Fijo</p>',
      disabled: true,
      onchange,
    });
    await tick();

    expect(area(container)).toHaveAttribute('contenteditable', 'false');
    expect(area(container)).toHaveAttribute('aria-readonly', 'true');
    expect(toggle(container)).toBeDisabled();
    expect(container.querySelector('.rt')).toHaveClass('rt--readonly');

    area(container).dispatchEvent(clipboardEvent('paste', '<b>no</b>'));
    await tick();
    // The only call is the one-off styleWithCSS setup the editor does on mount.
    expect(commandDoc().execCommand).not.toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.anything(),
    );
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('the value guards', () => {
  it('only lets a hex literal through to the style custom property', () => {
    expect(safeHexColor('#0e2d38')).toBe('#0e2d38');
    expect(safeHexColor('#ABC')).toBe('#ABC');
    expect(safeHexColor('red; background: url(javascript:alert(1))')).toBe('#0e2d38');
    expect(safeHexColor(null)).toBe('#0e2d38');
  });

  it('accepts the schemes the sanitizer accepts and nothing else', () => {
    expect(normalizeLinkUrl('https://irdlex.org')).toBe('https://irdlex.org');
    expect(normalizeLinkUrl('mailto:info@irdlex.org')).toBe('mailto:info@irdlex.org');
    expect(normalizeLinkUrl('/eventos/')).toBe('/eventos/');
    expect(normalizeLinkUrl('irdlex.org')).toBe('https://irdlex.org');
    expect(normalizeLinkUrl(' javascript:alert(1) ')).toBeNull();
    expect(normalizeLinkUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeLinkUrl('   ')).toBeNull();
  });
});
