/* ============================================================================
 * web/src/lib/pdf.ts — pdfmake document standard (port of js/lib/pdf.js, S09)
 * ----------------------------------------------------------------------------
 * THE standard for generating printable / downloadable documents in this app.
 *
 * Every generated document — treasury report, ministry & project reports, event
 * roster + single registration, QR cartel, liability waiver — builds a pdfmake
 * document definition and hands it to savePdf()/openPdf() here. One module
 * loads pdfmake, embeds images, draws the shared church header/footer/
 * watermark, and produces a real vector PDF. This replaces window.print(), so
 * output is identical everywhere and never depends on the browser's print
 * dialog.
 *
 * Preserved nearly VERBATIM from legacy (MIGRATION.md D-009): pdfmake still
 * arrives via CDN <script> tags memoized on window.pdfMake.vfs (G-007) — do
 * NOT convert to an npm import. Only types and import-safety guards were
 * added: the module can be imported under node/jsdom; browser-only work runs
 * only when a function is called.
 *
 * Usage:
 *   import { loadPdfMake, churchDocDef, savePdf, imageDataUrl } from '$lib/pdf';
 *   const def = churchDocDef({ title: 'Roster', headRight: 'EBV 2026', content: [...] });
 *   await savePdf(def, 'roster.pdf');
 *
 * For fully custom layouts (e.g. the full-bleed cartel) build your own docDef
 * and still call savePdf()/openPdf() so loading + delivery stay centralized.
 * ========================================================================== */

// ── Minimal local types (deliberately NOT the npm pdfmake typings — G-007) ───
// A pdfmake content node. Kept open: docdefs are asserted structurally in
// tests, never against exact pdfmake bytes (VERIFICATION.md).
export type PdfContent = unknown;

export interface PageSizeInfo {
  width: number;
  height: number;
}

/** churchLogo() result: data-URL + aspect ratio for the watermark. */
export interface Watermark {
  url: string;
  ratio: number;
}

export interface ChurchDocDefOpts {
  content?: PdfContent;
  title?: string;
  headRight?: string;
  accent?: string;
  wm?: Watermark | null;
  pageSize?: string;
  orientation?: 'portrait' | 'landscape';
  margins?: [number, number, number, number];
}

/** The docDef shape churchDocDef() returns (minimal TDocumentDefinitions-ish). */
export interface ChurchDocDef {
  pageSize: string;
  pageOrientation: 'portrait' | 'landscape';
  pageMargins: [number, number, number, number];
  info: { title: string };
  header: () => PdfContent;
  footer: (currentPage: number, pageCount: number) => PdfContent;
  content: PdfContent;
  defaultStyle: { fontSize: number; color: string; lineHeight: number };
  background?: (currentPage: number, pageSize: PageSizeInfo) => PdfContent;
}

// The CDN globals (G-007). Typed casts only — never an npm import.
interface PdfMakeStatic {
  vfs?: unknown;
  createPdf: (docDef: object) => { download: (filename: string) => void; open: () => void };
}
interface PdfJsStatic {
  GlobalWorkerOptions: { workerSrc: string };
}
type CdnWindow = Window & { pdfMake?: PdfMakeStatic; pdfjsLib?: PdfJsStatic };
const cdnWindow = (): CdnWindow => window as unknown as CdnWindow;

// Import-safety: SvelteKit prerenders under node — only ever touch
// window/document inside a called function, behind this guard.
const inBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

export const CHURCH = 'Iglesia Restauración Divina';
export const CHURCH_ADDRESS = '2601 Clays Mill Rd, Lexington, KY 40503';
// Same-origin so it embeds cleanly (no CORS taint) in the PDF + live preview.
const LOGO = '/resources/report-logo.png';

// Content width in points for Letter portrait (612pt − 2×40pt side margins).
export const CONTENT_W = 515;

// ── Engine loaders (CDN, loaded once, warmed on first use) ────────────────────
let _pm: Promise<void> | null = null;
export function loadPdfMake(): Promise<void> {
  if (!inBrowser()) return Promise.reject(new Error('No se pudo cargar el generador de PDF.'));
  const w = cdnWindow();
  if (w.pdfMake && w.pdfMake.vfs) return Promise.resolve();
  if (_pm) return _pm;
  const load = (src: string) =>
    new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error('No se pudo cargar el generador de PDF.'));
      document.head.appendChild(s);
    });
  _pm = load('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js').then(() =>
    load('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js'),
  );
  return _pm;
}

// pdf.js — used only to rasterize a document into a live on-screen preview.
let _pjs: Promise<void> | null = null;
export function loadPdfJs(): Promise<void> {
  if (!inBrowser()) return Promise.reject(new Error('No se pudo cargar el visor de PDF.'));
  if (cdnWindow().pdfjsLib) return Promise.resolve();
  if (_pjs) return _pjs;
  const V = '3.11.174';
  _pjs = new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.min.js`;
    s.onload = () => {
      try {
        cdnWindow().pdfjsLib!.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.worker.min.js`;
      } catch {
        /* worker optional */
      }
      res();
    };
    s.onerror = () => rej(new Error('No se pudo cargar el visor de PDF.'));
    document.head.appendChild(s);
  });
  return _pjs;
}

// ── Images ────────────────────────────────────────────────────────────────────
// Fetch any image URL → data URL (pdfmake embeds data URLs, not remote URLs).
// Returns '' on failure so callers can treat the image as optional.
export async function imageDataUrl(url: string): Promise<string> {
  if (!url) return '';
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((r) => {
      const fr = new FileReader();
      fr.onload = () => r(String(fr.result));
      fr.onerror = () => r('');
      fr.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

// The church logo as { url (dataURL), ratio (h/w) }, cached. Used for the faint
// centered watermark. Resolves to null if the asset can't be read.
let _logo: Watermark | null | undefined;
export function churchLogo(): Promise<Watermark | null> {
  if (_logo !== undefined) return Promise.resolve(_logo);
  if (!inBrowser()) return Promise.resolve(null); // not memoized: retry in a browser
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        _logo = { url: c.toDataURL('image/png'), ratio: img.naturalHeight / img.naturalWidth };
      } catch {
        _logo = null;
      }
      res(_logo ?? null);
    };
    img.onerror = () => {
      _logo = null;
      res(null);
    };
    img.src = LOGO;
  });
}

// ── Shared building blocks ────────────────────────────────────────────────────
// Section heading: accent label + underline rule. Matches the treasury report.
export function sectionHeading(text: unknown, accent = '#394548', width = CONTENT_W): PdfContent {
  return {
    stack: [
      {
        text: String(text).toUpperCase(),
        color: accent,
        bold: true,
        fontSize: 11,
        characterSpacing: 0.4,
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 3, x2: width, y2: 3, lineWidth: 1, lineColor: '#ccd4d5' },
        ],
      },
    ],
    margin: [0, 6, 0, 8],
  };
}

// KPI box (accent left stripe): a big value over a small caps label.
export function kpiBox(
  label: unknown,
  val: string | number,
  valColor = '#1f2a2e',
  accent = '#394548',
): PdfContent {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            margin: [10, 8, 10, 8],
            stack: [
              { text: val, fontSize: 15, bold: true, color: valColor },
              {
                text: String(label).toUpperCase(),
                fontSize: 8,
                bold: true,
                color: '#6a767b',
                margin: [0, 2, 0, 0],
              },
            ],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: (i: number) => (i === 0 ? 3 : 1),
      hLineColor: () => '#e4e9ea',
      vLineColor: (i: number) => (i === 0 ? accent : '#e4e9ea'),
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

// A table header cell (grey fill, small caps). `right` right-aligns (for money).
export function th(text: unknown, right?: boolean): PdfContent {
  return {
    text: String(text).toUpperCase(),
    bold: true,
    fontSize: 7.5,
    color: '#5f6c71',
    alignment: right ? 'right' : 'left',
    fillColor: '#f2f5f5',
  };
}

// ── The standard church document frame ───────────────────────────────────────
// Returns a pdfmake docDef with the running header (church name left · label
// right + rule), footer page numbers, and a faint centered logo watermark.
// `content` is the pdfmake content array. Pass `wm` from await churchLogo().
export function churchDocDef({
  content,
  title = CHURCH,
  headRight = '',
  accent = '#394548',
  wm = null,
  pageSize = 'LETTER',
  orientation = 'portrait',
  margins = [40, 58, 40, 44],
}: ChurchDocDefOpts = {}): ChurchDocDef {
  const docDef: ChurchDocDef = {
    pageSize,
    pageOrientation: orientation,
    pageMargins: margins,
    info: { title },
    header: () => ({
      margin: [margins[0], 22, margins[2], 0],
      stack: [
        {
          columns: [
            { text: CHURCH, fontSize: 8, color: '#7a868b', bold: true },
            {
              text: String(headRight || ''),
              fontSize: 8,
              color: accent,
              bold: true,
              alignment: 'right',
            },
          ],
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 5,
              x2: CONTENT_W,
              y2: 5,
              lineWidth: 0.5,
              lineColor: '#dde3e4',
            },
          ],
        },
      ],
    }),
    footer: (cp, pc) => ({
      margin: [margins[0], 4, margins[2], 0],
      text: cp + ' / ' + pc,
      alignment: 'right',
      fontSize: 8,
      color: '#9aa6a8',
    }),
    content,
    defaultStyle: { fontSize: 10, color: '#1f2a2e', lineHeight: 1.2 },
  };
  if (wm)
    docDef.background = (cp, ps) => {
      const w = ps.width * 0.46,
        h = w * wm.ratio;
      return {
        image: wm.url,
        width: w,
        opacity: 0.05,
        absolutePosition: { x: (ps.width - w) / 2, y: (ps.height - h) / 2 },
      };
    };
  return docDef;
}

// ── Delivery ──────────────────────────────────────────────────────────────────
// Build + download a PDF. The standard entry point (matches the treasury report).
export async function savePdf(docDef: object, filename: string): Promise<void> {
  await loadPdfMake();
  cdnWindow().pdfMake!.createPdf(docDef).download(filename);
}

// Build + open a PDF in a new tab (viewable, printable, saveable). Handy for
// posters/forms the user prints immediately.
export async function openPdf(docDef: object): Promise<void> {
  await loadPdfMake();
  cdnWindow().pdfMake!.createPdf(docDef).open();
}
