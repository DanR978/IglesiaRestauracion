// S18 — RichText.svelte: the RENDER half of D-005's defense in depth.
//
// The editor already sanitizes on save, so this component exists for the case
// where that guarantee is worth nothing: a row edited by another tool, restored
// from a backup, or written by a legacy screen that predates the allowlist. The
// strongest available proof is the S07 XSS corpus — the same 73 vectors the
// sanitizer golden uses — pushed through the component and asserted INERT in
// the real DOM, not just in a string.
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import RichText from '$lib/components/RichText.svelte';
import { RICH_TEXT_CONTENT_BLOCK } from '$lib/components/rich-text';

interface Vector {
  input: string;
  expected: string;
  note: string;
}

const corpus: Vector[] = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sanitize-html.json'), 'utf8'),
).sanitizeHtml;

const block = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(`.${RICH_TEXT_CONTENT_BLOCK}`);

/** Every way markup can still be live after it is in the document. */
function inertViolations(root: HTMLElement): string[] {
  const problems: string[] = [];
  for (const el of root.querySelectorAll('*')) {
    if (
      /^(SCRIPT|IFRAME|OBJECT|EMBED|SVG|IMG|STYLE|FORM|VIDEO|AUDIO|LINK|META)$/.test(el.tagName)
    ) {
      problems.push(`element ${el.tagName}`);
    }
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name)) problems.push(`${el.tagName}[${attr.name}]`);
      if (/^(href|src|xlink:href|action|formaction)$/i.test(attr.name)) {
        if (/^\s*(javascript|data|vbscript):/i.test(attr.value)) {
          problems.push(`${el.tagName}[${attr.name}=${attr.value}]`);
        }
      }
      if (attr.name === 'style' && /url\(|expression|javascript/i.test(attr.value)) {
        problems.push(`${el.tagName}[style=${attr.value}]`);
      }
    }
  }
  return problems;
}

describe('RichText — the render pass really sanitizes', () => {
  it('has a corpus to run (guards against a silently empty fixture)', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(70);
  });

  it.each(corpus.map((v): [string, Vector] => [v.note, v]))('renders %s inert', (_note, vector) => {
    const { container } = render(RichText, { value: vector.input });
    const rendered = block(container);
    if (!rendered) return; // nothing visible → nothing rendered at all
    expect(inertViolations(rendered), vector.input).toEqual([]);
  });

  it('keeps the allowlisted markup it is supposed to keep', () => {
    const { container } = render(RichText, {
      value: '<p>Trae <b>agua</b> y <i>gorra</i></p><ul><li>9:00 a. m.</li></ul>',
    });
    expect(block(container)?.innerHTML).toBe(
      '<p>Trae <b>agua</b> y <i>gorra</i></p><ul><li>9:00 a. m.</li></ul>',
    );
  });

  it('strips a script even though the editor swore it already had', () => {
    const { container } = render(RichText, {
      value: '<p>Hola</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
    });
    expect(block(container)?.innerHTML).toBe('<p>Hola</p>');
  });

  it('hardens an outbound link the sanitizer rewrote', () => {
    const { container } = render(RichText, { value: '<a href="https://irdlex.org">Ver</a>' });
    const link = block(container)?.querySelector('a');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('RichText — the legacy plain-text path', () => {
  it('turns pre-editor rows into escaped paragraphs, not one run-on line', () => {
    const { container } = render(RichText, {
      value: 'Primera línea\nsegunda\n\nOtro párrafo',
    });
    const paragraphs = block(container)!.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].innerHTML).toBe('Primera línea<br>segunda');
    expect(paragraphs[1].textContent).toBe('Otro párrafo');
  });

  it('escapes the characters a plain-text row can contain', () => {
    // No tag-shaped run, so renderRichText takes the plain-text branch and the
    // stray < & > are escaped rather than swallowed by the parser.
    const { container } = render(RichText, { value: 'Cupo < 25 & > 5 niños' });
    expect(block(container)?.innerHTML).toBe('<p>Cupo &lt; 25 &amp; &gt; 5 niños</p>');
    expect(block(container)?.textContent).toBe('Cupo < 25 & > 5 niños');
  });
});

describe('RichText — empty values render nothing', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '   \n  '],
    ['markup with no visible text', '<p> </p><b></b>'],
    ['a value that sanitizes down to nothing', '<script>alert(1)</script>'],
  ])('renders no container for %s', (_name, value) => {
    const { container } = render(RichText, { value });
    expect(block(container)).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('RichText — the container', () => {
  it('carries the shared .rich-content class plus any caller class', () => {
    const { container } = render(RichText, { value: '<p>x</p>', class: 'ed-section__body' });
    expect(block(container)).toHaveClass(RICH_TEXT_CONTENT_BLOCK);
    expect(block(container)).toHaveClass('ed-section__body');
  });
});
