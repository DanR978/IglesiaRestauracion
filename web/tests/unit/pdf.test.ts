/* ============================================================================
 * web/tests/unit/pdf.test.ts — S09 structural tests for the pure pdf builders
 * ----------------------------------------------------------------------------
 * Asserts the shapes the LEGACY source defines (citations are js/lib/pdf.js
 * line numbers as of branch chore/cleanup, 2026-08-24). Complements the
 * golden suite (tests/golden/pdf.test.ts) with intent-level checks: wiring,
 * defaults, import-safety. Never asserts pdfmake BYTES (VERIFICATION.md) —
 * the interactive "download + rasterize" check is a deferred manual step.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import {
  CHURCH,
  CHURCH_ADDRESS,
  CONTENT_W,
  churchDocDef,
  churchLogo,
  imageDataUrl,
  kpiBox,
  loadPdfJs,
  loadPdfMake,
  openPdf,
  savePdf,
  sectionHeading,
  th,
  type Watermark,
} from '$lib/pdf';

// Minimal structural views used to reach into PdfContent (unknown) results.
interface TextNode {
  text: string;
  color?: string;
  bold?: boolean;
  fontSize?: number;
  alignment?: string;
  fillColor?: string;
}
interface CanvasLine {
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
  lineColor: string;
}
interface StackNode {
  stack: [TextNode, { canvas: CanvasLine[] }];
  margin: number[];
}
interface KpiShape {
  table: { widths: string[]; body: [[{ margin: number[]; stack: [TextNode, TextNode] }]] };
  layout: {
    hLineWidth: () => number;
    vLineWidth: (i: number) => number;
    hLineColor: () => string;
    vLineColor: (i: number) => string;
    paddingLeft: () => number;
    paddingRight: () => number;
    paddingTop: () => number;
    paddingBottom: () => number;
  };
}
interface HeaderShape {
  margin: number[];
  stack: [{ columns: [TextNode, TextNode] }, { canvas: CanvasLine[] }];
}
interface FooterShape {
  margin: number[];
  text: string;
  alignment: string;
  fontSize: number;
  color: string;
}
interface BackgroundShape {
  image: string;
  width: number;
  opacity: number;
  absolutePosition: { x: number; y: number };
}

describe('constants', () => {
  it('CONTENT_W is 515pt — Letter portrait 612 − 2×40 margins (pdf.js:27)', () => {
    expect(CONTENT_W).toBe(515);
  });

  it('church identity strings stay byte-identical (pdf.js:21-22)', () => {
    expect(CHURCH).toBe('Iglesia Restauración Divina');
    expect(CHURCH_ADDRESS).toBe('2601 Clays Mill Rd, Lexington, KY 40503');
  });
});

describe('sectionHeading (pdf.js:103-108)', () => {
  it('uppercases the label, defaults accent #394548, underlines at CONTENT_W', () => {
    const s = sectionHeading('Resumen') as StackNode;
    expect(s.stack[0]).toEqual({
      text: 'RESUMEN',
      color: '#394548',
      bold: true,
      fontSize: 11,
      characterSpacing: 0.4,
    });
    expect(s.stack[1].canvas[0]).toEqual({
      type: 'line',
      x1: 0,
      y1: 3,
      x2: CONTENT_W,
      y2: 3,
      lineWidth: 1,
      lineColor: '#ccd4d5',
    });
    expect(s.margin).toEqual([0, 6, 0, 8]);
  });

  it('honors a custom accent and rule width', () => {
    const s = sectionHeading('detalle', '#1e6b61', 300) as StackNode;
    expect(s.stack[0].color).toBe('#1e6b61');
    expect(s.stack[1].canvas[0].x2).toBe(300);
  });
});

describe('kpiBox (pdf.js:111-120)', () => {
  it('big value over small caps label inside a single-cell table', () => {
    const k = kpiBox('Ingresos', '$1,234.56') as unknown as KpiShape;
    expect(k.table.widths).toEqual(['*']);
    const cell = k.table.body[0][0];
    expect(cell.margin).toEqual([10, 8, 10, 8]);
    expect(cell.stack[0]).toEqual({
      text: '$1,234.56',
      fontSize: 15,
      bold: true,
      color: '#1f2a2e',
    });
    expect(cell.stack[1].text).toBe('INGRESOS');
  });

  it('layout draws the 3pt accent stripe only on the left edge (i === 0)', () => {
    const k = kpiBox('Balance', '-$50.00', '#b02030', '#1e6b61') as unknown as KpiShape;
    expect(k.layout.vLineWidth(0)).toBe(3);
    expect(k.layout.vLineWidth(1)).toBe(1);
    expect(k.layout.vLineColor(0)).toBe('#1e6b61'); // the accent
    expect(k.layout.vLineColor(1)).toBe('#e4e9ea');
    expect(k.layout.hLineWidth()).toBe(1);
    expect(k.layout.hLineColor()).toBe('#e4e9ea');
    expect(k.layout.paddingLeft()).toBe(0);
    expect(k.layout.paddingRight()).toBe(0);
    expect(k.layout.paddingTop()).toBe(0);
    expect(k.layout.paddingBottom()).toBe(0);
  });
});

describe('th (pdf.js:123-126)', () => {
  it('grey-filled small caps, left by default', () => {
    expect(th('Fecha')).toEqual({
      text: 'FECHA',
      bold: true,
      fontSize: 7.5,
      color: '#5f6c71',
      alignment: 'left',
      fillColor: '#f2f5f5',
    });
  });

  it('right-aligns for money columns', () => {
    expect((th('Monto', true) as TextNode).alignment).toBe('right');
  });
});

describe('churchDocDef (pdf.js:132-157)', () => {
  it('defaults: LETTER portrait, margins [40,58,40,44], title = CHURCH', () => {
    const d = churchDocDef({ content: [] });
    expect(d.pageSize).toBe('LETTER');
    expect(d.pageOrientation).toBe('portrait');
    expect(d.pageMargins).toEqual([40, 58, 40, 44]);
    expect(d.info).toEqual({ title: CHURCH });
    expect(d.defaultStyle).toEqual({ fontSize: 10, color: '#1f2a2e', lineHeight: 1.2 });
  });

  it('header(): church name left, headRight in accent right, rule at CONTENT_W (pdf.js:139-145)', () => {
    const d = churchDocDef({ content: [], headRight: 'EBV 2026', accent: '#1e6b61' });
    const h = d.header() as HeaderShape;
    expect(h.margin).toEqual([40, 22, 40, 0]); // [margins[0], 22, margins[2], 0]
    expect(h.stack[0].columns[0]).toEqual({
      text: CHURCH,
      fontSize: 8,
      color: '#7a868b',
      bold: true,
    });
    expect(h.stack[0].columns[1]).toEqual({
      text: 'EBV 2026',
      fontSize: 8,
      color: '#1e6b61',
      bold: true,
      alignment: 'right',
    });
    expect(h.stack[1].canvas[0].x2).toBe(CONTENT_W);
  });

  it('footer(cp, pc) renders "cp / pc" right-aligned (pdf.js:146-147)', () => {
    const f = churchDocDef({ content: [] }).footer(1, 3) as FooterShape;
    expect(f).toEqual({
      margin: [40, 4, 40, 0],
      text: '1 / 3',
      alignment: 'right',
      fontSize: 8,
      color: '#9aa6a8',
    });
  });

  it('custom margins flow into both header and footer margins', () => {
    const d = churchDocDef({ content: [], margins: [30, 50, 30, 40] });
    expect((d.header() as HeaderShape).margin).toEqual([30, 22, 30, 0]);
    expect((d.footer(2, 2) as FooterShape).margin).toEqual([30, 4, 30, 0]);
  });

  it('no wm → no background function (pdf.js:151)', () => {
    expect(churchDocDef({ content: [] }).background).toBeUndefined();
  });

  it('wm → faint centered watermark at 46% page width (pdf.js:151-155)', () => {
    const wm: Watermark = { url: 'data:image/png;base64,iVBORw0KGgo=', ratio: 0.5 };
    const d = churchDocDef({ content: [], wm });
    expect(typeof d.background).toBe('function');
    const b = d.background!(1, { width: 612, height: 792 }) as BackgroundShape;
    const w = 612 * 0.46;
    expect(b.image).toBe(wm.url);
    expect(b.width).toBe(w);
    expect(b.opacity).toBe(0.05);
    expect(b.absolutePosition.x).toBe((612 - w) / 2); // horizontally centered
    expect(b.absolutePosition.y).toBe((792 - w * wm.ratio) / 2); // vertically centered
  });
});

describe('import-safety (G-007 loaders untouched, jsdom-importable)', () => {
  it('exports the loaders + delivery + image helpers as functions', () => {
    for (const fn of [loadPdfMake, loadPdfJs, savePdf, openPdf, imageDataUrl, churchLogo]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('importing the module injected no CDN <script> tags (loading is lazy)', () => {
    expect(document.querySelectorAll('script[src*="pdfmake"], script[src*="pdf.js"]').length).toBe(
      0,
    );
  });
});
