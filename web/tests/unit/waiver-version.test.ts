// web/tests/unit/waiver-version.test.ts — the D-004 snapshot.
// WAIVER_VERSION changes ONLY via a reviewed decision in MIGRATION.md §2, and
// the clause text people legally agreed to is pinned byte-for-byte. If this
// test fails, do NOT regenerate the fixture — take the wording change to review
// first (stored registrations keep the version they actually signed).
import { describe, expect, it } from 'vitest';
import {
  WAIVER_ACK,
  WAIVER_ADDRESS,
  WAIVER_CHURCH,
  WAIVER_CLAUSES,
  WAIVER_CSS,
  WAIVER_PARTICIPANT_NOTE,
  WAIVER_TITLE,
  WAIVER_VERSION,
  buildWaiverDocDef,
  renderWaiverPrintDoc,
} from '$lib/waiver';
import snapshot from '../fixtures/waiver-constants.json';

describe('waiver constants snapshot (D-004)', () => {
  it('WAIVER_VERSION is unchanged', () => {
    expect(WAIVER_VERSION).toBe(snapshot.WAIVER_VERSION);
  });

  it('every clause is byte-identical to the signed legal text', () => {
    expect([...WAIVER_CLAUSES]).toEqual(snapshot.WAIVER_CLAUSES);
  });

  it('church identity, title, note and acknowledgement are byte-identical', () => {
    expect(WAIVER_CHURCH).toBe(snapshot.WAIVER_CHURCH);
    expect(WAIVER_ADDRESS).toBe(snapshot.WAIVER_ADDRESS);
    expect(WAIVER_TITLE).toBe(snapshot.WAIVER_TITLE);
    expect(WAIVER_PARTICIPANT_NOTE).toBe(snapshot.WAIVER_PARTICIPANT_NOTE);
    expect(WAIVER_ACK).toBe(snapshot.WAIVER_ACK);
  });

  it('print stylesheet is byte-identical', () => {
    expect(WAIVER_CSS).toBe(snapshot.WAIVER_CSS);
  });
});

describe('single-sourcing: HTML and PDF are built from the same constants (D-004)', () => {
  // The clause strings contain no HTML-escapable characters today, so they must
  // appear verbatim in the rendered HTML; if a future clause edit adds one, the
  // snapshot above fires first and the wording goes through review anyway.
  const html = renderWaiverPrintDoc({ blank: true });
  const pdfJson = JSON.stringify(buildWaiverDocDef({ blank: true }));

  it('every clause appears in the on-screen document', () => {
    for (const clause of WAIVER_CLAUSES) expect(html).toContain(clause);
  });

  it('every clause appears in the pdfmake docdef', () => {
    for (const clause of WAIVER_CLAUSES) expect(pdfJson).toContain(clause);
  });

  it('title and acknowledgement appear in both outputs', () => {
    expect(html).toContain(WAIVER_TITLE);
    expect(pdfJson).toContain(WAIVER_TITLE);
    expect(html).toContain(WAIVER_ACK);
    expect(pdfJson).toContain(WAIVER_ACK);
  });

  it('the blank form carries no Doc. version, the filled one does', () => {
    expect(html).not.toContain(`Doc. ${WAIVER_VERSION}`);
    expect(renderWaiverPrintDoc({})).toContain(`Doc. ${WAIVER_VERSION}`);
    expect(pdfJson).not.toContain(`Doc. ${WAIVER_VERSION}`);
    expect(JSON.stringify(buildWaiverDocDef({}))).toContain(`Doc. ${WAIVER_VERSION}`);
  });
});
