// S07 capture harness — generates web/tests/fixtures/sanitize-html.json by
// RUNNING THE LEGACY js/lib/sanitize-html.js over the corpus below (D-012).
// It needs DOMParser, so it runs inside vitest's jsdom environment (G-001)
// instead of a plain node generator script.
//
// Disabled unless CAPTURE=1:
//   CAPTURE=1 npx vitest run tests/unit/capture-sanitize-html.test.ts
//
// Mechanics: the legacy module imports '/js/utils/escape.js' site-root-absolute,
// which resolves nowhere outside the raw-served site. The capture copies the
// legacy source into web/tests/.capture-tmp/ with ONLY that specifier rewritten
// to the equivalent relative path (same file, same bytes otherwise) and
// dynamically imports the copy — the real legacy escape.js is loaded from the
// repo. The port itself is NEVER imported here.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const CAPTURE = process.env.CAPTURE === '1';

type LegacySanitize = {
  sanitizeHtml: (dirty: unknown) => string;
  renderRichText: (value: unknown) => string;
  richToPlain: (value: unknown) => string;
  htmlIsEmpty: (value: unknown) => boolean;
};

// ---------------------------------------------------------------------------
// XSS corpus + behavior corpus. Inputs only — expected values are whatever the
// LEGACY sanitizer returns at capture time. Never hand-edit the fixture.
const SANITIZE_VECTORS: { input: string | number | null; note: string }[] = [
  // script injection
  { input: '<script>alert(1)</script>', note: 'script tag dropped with content' },
  {
    input: '<script src="https://evil.com/x.js"></script>hola',
    note: 'external script dropped, text kept',
  },
  { input: 'a<script>b</script>c', note: 'script between text nodes' },
  { input: '<SCRIPT>alert(1)</SCRIPT>', note: 'uppercase script' },
  { input: '<scr<script>ipt>alert(1)</script>', note: 'nested-tag obfuscation' },
  // event handlers
  { input: '<p onclick="alert(1)">hola</p>', note: 'onclick stripped, tag kept' },
  { input: '<span onmouseover=alert(1)>s</span>', note: 'unquoted handler stripped' },
  { input: '<b ONFOCUS="x" autofocus>t</b>', note: 'uppercase handler + autofocus stripped' },
  { input: '<div style="color:red" onload="x">d</div>', note: 'handler stripped, safe style kept' },
  // dangerous URLs
  { input: '<a href="javascript:alert(1)">x</a>', note: 'javascript: href dropped' },
  { input: '<a href="JaVaScRiPt:alert(1)">x</a>', note: 'mixed-case javascript: dropped' },
  {
    input: '<a href="\tjavascript:alert(1)">x</a>',
    note: 'leading tab trimmed then scheme rejected',
  },
  {
    input: '<a href="java\nscript:alert(1)">x</a>',
    note: 'LANDMINE: newline inside scheme — legacy keeps it (browsers strip \\n → javascript:)',
  },
  { input: '<a href="data:text/html,<script>alert(1)</script>">x</a>', note: 'data: URL dropped' },
  { input: '<a href="vbscript:msgbox(1)">x</a>', note: 'vbscript: dropped' },
  { input: '<a href="https://example.com">ok</a>', note: 'https link kept + rel + target' },
  { input: '<a href="http://example.com">ok</a>', note: 'http link kept + rel + target' },
  { input: '<a href="mailto:info@irdlex.org">correo</a>', note: 'mailto kept, no target' },
  { input: '<a href="tel:+19155550123">tel</a>', note: 'tel kept, no target' },
  { input: '<a href="/eventos/">rel</a>', note: 'site-relative kept' },
  { input: '<a href="#seccion">ancla</a>', note: 'anchor kept' },
  { input: '<a href="pagina.html">bare</a>', note: 'bare relative path kept' },
  { input: '<a href="  https://example.com  ">trim</a>', note: 'href whitespace trimmed' },
  { input: '<A HREF="HTTPS://EXAMPLE.COM/X">caps</A>', note: 'uppercase tag + scheme' },
  // embedded content / containers dropped with content
  { input: '<iframe src="https://evil.com"></iframe>after', note: 'iframe dropped' },
  { input: '<object data="x">fallback</object>', note: 'object dropped with content' },
  { input: '<embed src="x">tail', note: 'embed dropped' },
  { input: '<img src=x onerror=alert(1)>', note: 'img dropped entirely' },
  { input: '<img src="data:image/png;base64,AAAA">', note: 'data-URI img dropped' },
  { input: '<svg onload=alert(1)><circle/></svg>', note: 'svg dropped with content' },
  { input: '<svg><script>alert(1)</script></svg>', note: 'script inside svg dropped' },
  { input: '<video src=x onerror=alert(1)></video>', note: 'video dropped' },
  {
    input: '<form action="/steal"><input value="y">campo</form>',
    note: 'form dropped with content',
  },
  {
    input: '<style>*{background:url(javascript:alert(1))}</style>hola',
    note: 'style element dropped',
  },
  { input: '<template><script>alert(1)</script></template>ok', note: 'template dropped' },
  {
    input: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">mx</noscript>',
    note: 'mXSS via noscript — dropped with content',
  },
  { input: '<link rel="stylesheet" href="evil.css">x', note: 'link dropped' },
  {
    input: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">x',
    note: 'meta dropped',
  },
  // unknown tags unwrap, keeping children
  { input: '<h1>título</h1>', note: 'h1 not allowlisted → unwrapped to text' },
  {
    input: '<math><mtext><script>alert(1)</script>mx</mtext></math>',
    note: 'math/mtext unwrap, script dropped',
  },
  { input: '<table><tr><td>celda</td></tr></table>', note: 'table structure unwrapped to text' },
  {
    input: '<details open ontoggle=alert(1)><summary>s</summary>d</details>',
    note: 'details/summary unwrapped, handler gone',
  },
  // style laundering
  {
    input: '<div style="color: red; background-image: url(evil)">x</div>',
    note: 'bg-image not allowlisted → dropped, color kept',
  },
  {
    input: '<div style="color:red;position:fixed;top:0">x</div>',
    note: 'position/top filtered out',
  },
  { input: '<div style="color:expression(alert(1))">x</div>', note: 'expression() filtered' },
  { input: '<div style="color:url(x)">x</div>', note: 'url() in value filtered' },
  {
    input: '<div style="background-color:#ff0;color:rgb(0, 0, 0)">x</div>',
    note: 'hex + rgb() values kept',
  },
  { input: '<div style="COLOR: RED">x</div>', note: 'property lowercased, value kept' },
  { input: `<div style="color:'red'">x</div>`, note: 'quotes in value rejected' },
  { input: '<span style="font-weight:bold">b</span>', note: 'font-weight kept' },
  { input: '<p style="text-align:center">c</p>', note: 'text-align kept' },
  { input: '<li style="text-decoration:underline">u</li>', note: 'li style kept' },
  {
    input: '<span style="color:red">a</span><span style="color:blue">b</span>',
    note: 'sibling styled spans',
  },
  // font color attribute
  { input: '<font color="red">f</font>', note: 'font color kept' },
  { input: '<font color="expression(alert(1))">f</font>', note: 'font color expression dropped' },
  // allowed passthrough + structure
  {
    input: '<b>negrita</b> y <i>cursiva</i> y <u>subrayado</u>',
    note: 'inline emphasis passthrough',
  },
  {
    input: '<strong>s</strong><em>e</em><s>t</s><strike>k</strike>',
    note: 'emphasis aliases passthrough',
  },
  { input: '<ul><li style="color:blue">uno</li><li>dos</li></ul>', note: 'list passthrough' },
  { input: '<ol><li>1</li><li>2</li></ol>', note: 'ordered list passthrough' },
  { input: '<h3 style="text-align:right">t</h3><h4>s</h4>', note: 'h3/h4 passthrough' },
  { input: '<blockquote>cita</blockquote>', note: 'blockquote passthrough' },
  { input: 'línea1<br>línea2', note: 'br passthrough' },
  {
    input: '<div><div><span style="color:red">profundo</span></div></div>',
    note: 'nested allowed structure',
  },
  // text/entity handling
  {
    input: '<b>bold</b> & <i>it</i> "quotes" <escaped',
    note: 'loose & + quotes + stray < re-serialized',
  },
  {
    input: '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    note: 'pre-escaped entities stay escaped',
  },
  { input: '<p>ñandú á é í ó ú ¿qué? ¡sí!</p>', note: 'Spanish accents preserved' },
  // malformed HTML
  { input: '<p><b>sin cerrar', note: 'unclosed tags — parser recovers' },
  {
    input: '<p attr="unclosed>texto',
    note: 'attribute-breaking quote swallows text (parser behavior)',
  },
  { input: '<div style="color:red">a<p>b</div>c', note: 'misnested block elements' },
  { input: '<!-- comentario --><p>x</p>', note: 'comment dropped' },
  // non-string / empty inputs
  { input: '', note: 'empty string → empty' },
  { input: null, note: 'null → empty' },
  { input: 123, note: 'number → empty (typeof guard)' },
];

const RENDER_VECTORS: { input: string | null; note: string }[] = [
  { input: 'hola mundo', note: 'plain text → one paragraph' },
  { input: 'línea1\nlínea2', note: 'single newline → <br>' },
  { input: 'párrafo uno\n\npárrafo dos', note: 'blank line → two paragraphs' },
  { input: 'a & b < c > d "q"', note: 'plain path escapes metachars' },
  { input: 'texto con 5 < 6 comparación', note: '< not followed by tag char → plain path' },
  { input: '  \n\n  \n\nreal', note: 'whitespace-only paragraphs filtered' },
  { input: '<b>rico</b>', note: 'HTML-looking → sanitize path' },
  { input: '<script>alert(1)</script>', note: 'HTML-looking hostile → sanitized away' },
  { input: '<p style="text-align:center">centrado</p>', note: 'rich value passes allowlist' },
  { input: '', note: 'empty → empty' },
  { input: null, note: 'null → empty' },
];

const PLAIN_VECTORS: { input: string | null; note: string }[] = [
  { input: '<p>hola <b>mundo</b></p>', note: 'tags flattened to text' },
  { input: '<ul><li>a</li><li>b</li></ul>', note: 'list items concatenated' },
  { input: 'multi   espacio\n\ntexto', note: 'whitespace collapsed (plain path)' },
  { input: '<div>uno</div><div>dos</div>', note: 'block boundaries collapse (no space inserted)' },
  {
    input: '<script>alert(1)</script>visible',
    note: 'leading script parses into <head>, body text only',
  },
  { input: 'sencillo', note: 'plain passthrough' },
  { input: '', note: 'empty → empty' },
  { input: null, note: 'null → empty' },
];

const EMPTY_VECTORS: { input: string | null; note: string }[] = [
  { input: '', note: 'empty → true' },
  { input: null, note: 'null → true' },
  { input: '<p><br></p>', note: 'markup without text → true' },
  { input: '<p>   </p>', note: 'whitespace only → true' },
  { input: '<p>x</p>', note: 'has text → false' },
  { input: 'texto', note: 'plain text → false' },
  { input: '<img src=x>', note: 'img only, no text → true' },
];

describe.runIf(CAPTURE)('CAPTURE: sanitize-html golden from LEGACY (D-012)', () => {
  it('runs the legacy sanitizer over the corpus and writes the fixture', async () => {
    const HERE = path.dirname(fileURLToPath(import.meta.url)); // web/tests/unit
    const TESTS = path.resolve(HERE, '..'); // web/tests
    // Legacy checkout root: web/ normally sits inside it; set LEGACY_ROOT when
    // running from a worktree/scratch tree that lives elsewhere.
    const REPO = process.env.LEGACY_ROOT || path.resolve(HERE, '../../..');
    const src = readFileSync(path.join(REPO, 'js', 'lib', 'sanitize-html.js'), 'utf8');

    const tmpDir = path.join(TESTS, '.capture-tmp');

    // The ONLY edit: make the site-root-absolute import resolvable from the
    // temp copy (normally '../../../js/utils/escape.js').
    const escapeSpec = path
      .relative(tmpDir, path.join(REPO, 'js', 'utils', 'escape.js'))
      .replace(/\\/g, '/');
    const rewritten = src.replace(
      "'/js/utils/escape.js'",
      `'${escapeSpec.startsWith('.') ? escapeSpec : `./${escapeSpec}`}'`,
    );
    expect(rewritten).not.toBe(src); // specifier must exist, else wrong source

    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'sanitize-html.legacy.mjs');
    writeFileSync(tmpFile, rewritten);

    try {
      const legacy = (await import(
        /* @vite-ignore */ pathToFileURL(tmpFile).href
      )) as LegacySanitize;

      const fixture = {
        sanitizeHtml: SANITIZE_VECTORS.map(({ input, note }) => ({
          input,
          expected: legacy.sanitizeHtml(input),
          note,
        })),
        renderRichText: RENDER_VECTORS.map(({ input, note }) => ({
          input,
          expected: legacy.renderRichText(input),
          note,
        })),
        richToPlain: PLAIN_VECTORS.map(({ input, note }) => ({
          input,
          expected: legacy.richToPlain(input),
          note,
        })),
        htmlIsEmpty: EMPTY_VECTORS.map(({ input, note }) => ({
          input,
          expected: legacy.htmlIsEmpty(input),
          note,
        })),
      };

      // Capture-time smoke on the LEGACY output (catches a broken capture, not
      // the port): no executable vector may survive in any expected value.
      for (const v of fixture.sanitizeHtml) {
        expect(typeof v.expected).toBe('string');
        expect(v.expected.toLowerCase()).not.toContain('<script');
        expect(v.expected.toLowerCase()).not.toMatch(/\son[a-z]+=/);
      }

      const outPath = path.join(TESTS, 'fixtures', 'sanitize-html.json');
      writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
      console.warn(
        `[capture-sanitize-html] wrote ${outPath}: sanitizeHtml ${fixture.sanitizeHtml.length}, ` +
          `renderRichText ${fixture.renderRichText.length}, richToPlain ${fixture.richToPlain.length}, ` +
          `htmlIsEmpty ${fixture.htmlIsEmpty.length}`,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe.runIf(!CAPTURE)('capture-sanitize-html (disabled)', () => {
  it.skip('set CAPTURE=1 to (re)generate the sanitize-html golden fixture from legacy', () => {
    /* intentionally skipped in normal runs */
  });
});
