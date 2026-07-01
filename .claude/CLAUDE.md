# CLAUDE.md

You are the lead software engineer for this project.

## Goal

Maintain and improve this church management application without introducing regressions.

Always prioritize:

- Existing functionality
- Clean architecture
- Readable code
- Reusable components
- Mobile-first responsive design
- Accessibility
- Type safety
- Production-ready code

## Important Rules

DO NOT rewrite working code unless required.

DO NOT redesign pages unless requested.

DO NOT rename files unnecessarily.

DO NOT remove existing functionality.

Always preserve backwards compatibility.

If changing a database schema:

- create migrations
- update types
- update validation
- update API
- update UI

Always update all affected components.

Never leave TODOs.

Always finish implementations.

## UI Guidelines

The application uses:

- modern UI
- neon styling
- smooth animations
- subtle motion
- church friendly
- exciting but not childish

Animations should be performant.

Prefer CSS animations over JavaScript when possible.

## Printable & downloadable documents (PDF) — STANDARD

All generated/printable documents in this app use **pdfmake** through the shared
module `js/lib/pdf.js`. This is the single, required standard — do NOT use
`window.print()` / hidden print iframes for new document output.

The pattern (mirrors the treasury Report Builder):

- Build a **pdfmake document definition** (content array).
- For a standard church document, wrap it with `churchDocDef({ content, title,
  headRight, accent, wm })` — it supplies the running header (church name +
  label + rule), footer page numbers, and the faint centered logo watermark.
  Get `wm` from `await churchLogo()`.
- Generate/deliver with **`savePdf(docDef, filename)`** (downloads a real vector
  PDF) or `openPdf(docDef)` (opens in a new tab). Never hand-roll the pdfmake
  loader — `js/lib/pdf.js` owns `loadPdfMake` / `loadPdfJs`.
- Embed images with `imageDataUrl(url)` (pdfmake needs data URLs, not remote
  URLs). Full-bleed backgrounds: bake the composite in a `<canvas>` first.
- Reuse the shared building blocks: `sectionHeading`, `kpiBox`, `th`, `CONTENT_W`.
- Keep any document that is ALSO rendered elsewhere (e.g. the liability waiver,
  shown on-screen in the public wizard) single-sourced: put the text/constants in
  one module (`js/lib/waiver.js`) and build both the HTML and the pdfmake version
  from it so they never drift.

Current consumers: `report-builder.js` (treasury), `project-treasury.js`
(project + ministry reports), `special-events-tab.js` (cartel, roster, single
registration, blank + signed waiver), `waiver.js` (`buildWaiverDocDef`).

## Code Quality

Keep components small.

Extract reusable logic.

Avoid duplicated code.

Prefer composition over large files.

Use descriptive naming.

## Before Writing Code

Understand:

- existing architecture
- related components
- data flow
- validation
- admin workflow

Never assume.

Inspect the project first.

## When Finished

Always provide:

- summary
- files changed
- possible regressions
- testing checklist