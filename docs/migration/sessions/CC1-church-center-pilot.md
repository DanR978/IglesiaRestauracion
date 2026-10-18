# Session CC1 — Church Center feasibility pilot

> Spec written 2026-10-18 with the architecture docs (`docs/architecture/`). Track CC runs in
> parallel with the port phases; see `docs/architecture/migration-roadmap.md`.

**Stream:** testing/cutover (Track CC)
**Depends on:** none in code. Owner prerequisites below.   **PR:** <#___>   **Branch:** `migrate/CC1-church-center-pilot`
**Status:** ⬜ not started

## Goal (one sentence)
Measure how the Church Center app opens external links on iOS and Android, and what then works, so
each public surface can be marked link-ready or blocked before Church Center go-live (CC2).

## In scope
- `web/src/routes/diagnostico/+page.svelte` (+ a sibling `.ts` for the probes; under `(bare)/` if the
  S23 route groups have merged): a **`noindex`** page at `/app/diagnostico/`, not linked from anywhere
  and not in the sitemap.
- `web/src/app.html`: add `viewport-fit=cover` to the viewport meta, pulled forward from S12b, so
  safe-area readings are real.
- Filling the device matrix and results log in `docs/architecture/mobile-compatibility.md` §4–5.
- Logging Planning Center support answers in `docs/architecture/church-center-compatibility.md` §10.
- Appending "Findings" to `docs/architecture/architecture-decisions/ADR-0001-church-center-link-out.md`.

## Out of scope (do NOT touch)
- Any legacy file (DUAL-MAINTENANCE). The legacy site is tested as it is.
- Submitting registrations, discipleship interests, contact or newsletter forms in production.
- Supabase, RLS, Edge Functions, analytics payloads.

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2, §3, current state), `CLAUDE.md`, `docs/architecture/README.md`,
      `docs/architecture/church-center-compatibility.md` and `mobile-compatibility.md`.
- [ ] **Owner:** a Planning Center organization; Publishing Essential (free); a campus with "List in
      Church Center app search" on; the app activated by an organization admin.
- [ ] **Owner:** approval for a temporary, dated navigation item (or home-page button) on the real
      organization, labeled as a test and removed when the session closes.
- [ ] Devices: one current iPhone, the oldest available iOS device, one Android with Chrome as
      default, optionally one with a non-Chrome default browser.

## Steps
1. **Diagnostic page** — reports, with a "Copiar resultados" button:
   - user agent and `navigator.userAgentData` where present; `document.referrer`; display mode;
   - `navigator.serviceWorker.controller` presence; `navigator.storage.persisted()`;
   - persistence of **its own** key `ird.diag.firstSeen` (localStorage) and a first-party cookie
     `ird_diag` across reload, closing and reopening the in-app browser, and 7+ days later;
   - `visualViewport` size with and without the keyboard open (an input field on the page);
   - computed `env(safe-area-inset-*)` values.

   Never read, list or copy any other storage key: the Supabase session key holds a live refresh token.
2. **Church Center link:** add the temporary item pointing to
   `https://www.irdlex.org/app/diagnostico/?utm_source=churchcenter&utm_medium=nav`, plus items or
   home buttons for three live pages (`/eventos/`, `/eventos/registro.html?e=<a test or past event>`,
   `/galeria/`).
3. **Identify the context per platform:**
   - Android: `chrome://inspect` from a desktop shows a Custom Tab vs a WebView, with no code.
   - iOS: use the diagnostic page (Safari Web Inspector needs a Mac).
   - Also check the app's settings for a browser preference.
4. **Run flows F1–F14** (mobile-compatibility.md §4) on E2, E3 and E5 (E6 optional) in light and dark,
   with a VoiceOver/TalkBack spot check on F2 and F4. Stop every form before submit.
5. **Ask Planning Center support** the questions in church-center-compatibility.md §10. Log the answers
   with dates, without ticket numbers, emails or staff names.
6. **File every failure:** port surfaces → `PORT-DEBT.md`; qualifying legacy fixes →
   `DUAL-FIX-BACKLOG.md`; index them in `docs/architecture/implementation-backlog.md`.
7. Remove the temporary navigation item and record that in the configuration register.

## Acceptance criteria
- [ ] Every required matrix cell is pass / fail / N/A, with device, OS, Church Center app version and date.
- [ ] The link-open mechanism is identified for iOS and Android.
- [ ] Each public surface is marked link-ready or blocked (with reason) for CC2.
- [ ] Zero legacy files changed; zero real registrations, interests or messages submitted.
- [ ] The diagnostic page is `noindex`, absent from the sitemap, and reads only its own keys.
- [ ] The temporary Church Center item is removed and logged.

## Verification gate
- [ ] Ran `docs/migration/VERIFICATION.md` — all applicable boxes green; results pasted in the PR.

## How to resume if interrupted
- Branch: `migrate/CC1-church-center-pilot`. Last known-good commit: <sha / "see PR">.
- Done so far: <bullets, kept current>
- Next concrete action: <the very next step>
- Landmines: the temporary nav item is public — check whether it still exists; device results expire
  when the Church Center app updates, so record the app version on every row.

## On completion
- [ ] Update `MIGRATION.md`: status board (Track CC), Current state, new G-xxx if anything surprising.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
