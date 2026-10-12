// web/tests/golden/waiver.test.ts — S10 golden parity (D-004, D-012)
// Fixtures were captured by RUNNING the legacy js/lib/waiver.js in node
// (see docs/migration/sessions/S10 notes) — never regenerate them from the
// ported module. VERIFICATION.md: we pin docdef *structure/text*, not PDF bytes.
import { describe } from 'vitest';
import { itGolden, type GoldenVector } from '$lib/test/golden';
import { buildWaiverDocDef, renderWaiverPrintDoc, type WaiverOptions } from '$lib/waiver';
import htmlVectors from '../fixtures/waiver-html.json';
import docdefVectors from '../fixtures/waiver-docdef.json';

// Mirrors the capture script EXACTLY: the docdef embeds zero-arg deterministic
// layout callbacks (band-heading fillColor/hLineWidth/paddings) that JSON
// cannot hold, so each function is replaced by { __fn: <its return value> }.
function normalizeDocDef(value: unknown): unknown {
  if (typeof value === 'function') return { __fn: (value as () => unknown)() };
  if (Array.isArray(value)) return value.map(normalizeDocDef);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeDocDef(v);
    return out;
  }
  return value;
}

describe('waiver golden parity (S10)', () => {
  itGolden(
    'renderWaiverPrintDoc',
    htmlVectors as unknown as GoldenVector<WaiverOptions, string>[],
    (input) => renderWaiverPrintDoc(input),
  );

  itGolden(
    'buildWaiverDocDef',
    docdefVectors as unknown as GoldenVector<WaiverOptions, unknown>[],
    (input) => normalizeDocDef(buildWaiverDocDef(input)),
  );
});
