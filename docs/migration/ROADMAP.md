# Migration Roadmap — full session backlog

The complete, dependency-ordered plan to rewrite the site as SvelteKit + `adapter-static` (Svelte 5 runes, TS), keeping the Supabase backend and edge functions unchanged. ~65 sessions in 7 phases. Read [`../../MIGRATION.md`](../../MIGRATION.md) and [`README.md`](README.md) first.

**How to read a row:** each session (`Sxx`) is ~0.5–1.5 focused days, one branch, one PR, independently shippable behind the `/app` staging path. "Prereqs" are the sessions that must be ✅ first. Sessions with no shared prereq can run in parallel across different sittings.

**Legend for the "cutover" column:** 🟢 pure staging (no live URL changes) · 🔴 changes a live URL (needs a freeze check + SW cache bump + revert plan).

---

## Phase 0 — Pre-flight & scaffolding · S01–S05
*Nothing ports until these land. S01 gates every typed session.*

| # | Session | Prereqs | Key files / output | Done when |
|---|---|---|---|---|
| S01 | **RLS audit + committed schema baseline** | — | run `supabase/rls-audit.sql`; `supabase init`+`link`; write `supabase/migrations/00000000000000_baseline.sql` from `supabase db dump` | `supabase db reset` applies baseline + the 16 existing migrations clean; `is_admin()`/`my_ministry_id()` present; audit confirms `event_registrations`/`discipleship_interests` are anon-INSERT-only, no anon SELECT (G-004 closed) |
| S02 | **SvelteKit + adapter-static scaffold in `web/`** | — | `web/{package.json,svelte.config.js,tsconfig.json,vite.config.ts,src/app.html}`; hello route; `static/.nojekyll` | `cd web && BASE_PATH=/app npm run build` emits `web/build/` under `/app`; `npm run check` clean under strict |
| S03 | **Merged deploy: legacy + `/app` in one artifact** | S02 | `.github/workflows/deploy.yml` (add SvelteKit build stage → copy `web/build/*` → `./app/`; keep legacy pipeline + `CNAME`) | `workflow_dispatch` artifact contains both root `index.html` (legacy, unchanged) and `app/index.html`; assets resolve under `/app` |
| S04 | **Config/secrets → `$env` `PUBLIC_*`** | S02 | `web/src/lib/config.ts` (`$env/static/public`); `web/.env`; secret→`PUBLIC_*` env block in deploy | missing a required `PUBLIC_` var **fails the build** (no more silent nullable client) |
| S05 | **Test harness + governance bootstrap** | S02 | Vitest (+`jsdom`, coverage-v8), Playwright, `tests/fixtures/`, golden-master helper; CI gate (`check`+`lint`+`test`+`build`); a CI check that PRs labeled `migration` touch `MIGRATION.md` | `npm run test` + `npm run check` + `npm run build` all green in CI on a scratch PR |

## Phase 1 — Shared foundations · S06–S22
*Libs, the typed client, and the whole component library. Build these before any UI consumes them. Design-system sessions (S11–S21) can run in parallel with the lib sessions (S06–S10).*

| # | Session | Prereqs | Key files / output | Done when |
|---|---|---|---|---|
| S06 | **Typed Supabase client** (non-nullable, browser-guarded) | S01, S04 | `web/src/lib/db/client.ts` + generated `database.types.ts` (`supabase gen types --local`); npm `@supabase/supabase-js` | typed `supabase.from('events')` compiles strict; prerender (Node) opens no socket |
| S07 | **Pure-logic libs port + golden tests** | S05 | `sanitize-html.ts`, `validators.ts`, `calendar.ts`, `escape.ts` → `src/lib/`; fixture vectors + golden snapshots | ported modules byte-identical to legacy goldens (`test:golden`); XSS corpus green (G-001) |
| S08 | **`money.ts` (integer cents) + golden** | S05 | `src/lib/money.ts` (`toCents/sumC/formatUSD/toNumeric`) | `formatUSD` matches legacy `fmt` for whole & fractional; `sumC` exact vs hand-computed (D-003) |
| S09 | **`pdf.ts` port (verbatim + types)** | — | `src/lib/pdf.ts` (`churchDocDef/savePdf/openPdf/loadPdfJs/imageDataUrl/sectionHeading/kpiBox/th`) | a scratch call downloads a churchDocDef PDF and rasterizes a page (G-007 preserved) |
| S10 | **`waiver.ts` port (single-sourced)** | S09 | `src/lib/waiver.ts` (constants + `WAIVER_CLAUSES` + HTML builder + `buildWaiverDocDef`) | `buildWaiverDocDef({blank:true})` matches legacy; HTML == PDF content (D-004) |
| S11 | **Design tokens + theme** | S02 | `src/lib/styles/tokens/*` → `app.css`; `theme.ts` (`data-theme` + no-FOUC inline script) | `var(--fs-lg)` resolves; light/dark/system toggle flips palette; no reload flash |
| S12 | **Global CSS baseline + a11y** | S11 | base/layout/utilities global; `prefers-reduced-motion` block; ≥16px mobile inputs; `reduced-motion.ts` | container/zigzag render; mobile inputs compute ≥16px; reduce-motion kills transitions |
| S13 | **Icon** (Font Awesome + SVG sprite) | S12 | `Icon.svelte`; sprite injected once (replaces `load-icons.js`) | `<Icon set="fas"/>` and `<Icon set="sprite"/>` render; `label` toggles `aria-label`/`aria-hidden` |
| S14 | **Button + Card** | S13 | `Button.svelte`, `Card.svelte` (keep `.ird-btn` classes for coexistence) | all variants render; `href`→`<a>` else `<button>`; focus-visible ring |
| S15 | **Unified Toast** | S13 | `toast` store + `<ToastHost>` (retires BOTH legacy toast systems) | success/error/info, auto-dismiss + manual close; error = `role=alert` |
| S16 | **Modal + ConfirmDialog** | S15, S14 | `Modal.svelte`; `confirm` singleton store + `<ConfirmHost>` | `bind:open`; Escape/backdrop close; scroll-lock+restore; `await confirm()` resolves; confirm stacks above modal |
| S17 | **ActionSheet** | S13 | `ActionSheet.svelte` | desktop popover anchors + repositions; mobile bottom sheet ≤640px; `role=menu` |
| S18 | **RichTextEditor + `{@html}` rule** | S13, S14 | `RichTextEditor.svelte` (reuses `sanitize-html.ts`); CI lint rule for `{@html}` | sanitized on save+render; no cursor jump; raw `{@html}` blocked by lint (D-005) |
| S19 | **SignaturePad component** | S12 | `SignaturePad.svelte` wrapping the ported canvas controller | draws hi-DPI; `toDataURL()` trimmed PNG; `clear/loadDataURL/isEmpty` exposed |
| S20 | **Lightbox** | S15, S13 | `Lightbox.svelte` + store (no id-coupled markup) | `openLightbox(photos,i)`; keys/swipe/fullscreen/share/download; scroll-lock+restore |
| S21 | **Disclosure + DataTable + FormWizard** | S12 | `Disclosure.svelte`, `DataTable.svelte` (card-collapse <1100px), `FormWizard.svelte` (shared step machine) | admin-ux conventions honored; table has no h-scroll at 360px; wizard drives the field-type contract |
| S22 | **Data-layer repos F1 (public-read)** | S06 | `repos/{events,gallery,discipleship,registrations}.ts` (port `discipleship.js`/`gallery.js`; extract inline queries) | every public `sb.from()` for these domains has a typed repo fn; "never throw to caller" preserved (G-006) |

## Phase 2 — Public site + cutover · S23–S36
*Build under `/app`, then cut over low-risk pages first. This is where SEO parity is proven.*

| # | Session | Prereqs | Cutover | Done when |
|---|---|---|---|---|
| S23 | **Root layout + chrome** (Header/Footer/FloatingUI/Toast, `(chrome)`/`(bare)` groups) | S14–S17 | 🟢 | header/footer on every `(chrome)` route; burger/submenus/sticky/focus-trap; mobile bar + WhatsApp FAB; deletes `include.js` |
| S24 | **SEO system + analytics + PWA + maintenance** (`Seo`/`JsonLd`/`pages.ts`, sitemap endpoint) | S23 | 🟢 | view-source shows correct title/canonical/OG/JSON-LD (diff vs legacy `build-heads.mjs`); `/sitemap.xml` matches; GA4 fires; maintenance gate works |
| S25 | **Static content pages (11) + ContactForm + Newsletter** | S23, S24 | 🟢 | each page byte-close to prod; contact form → formsubmit + captcha; newsletter → edge fn; `/pastor/` & `/calendario/` redirects |
| S26 | **Homepage** (hero/verse/live/map/rail/islands/FAQ) | S25, S22 | 🟢 | visual parity; **prerendered HTML contains** event/gallery/sermon snapshots (SEO gain); hero lazy-loads with all guards |
| S27 | **Events hub + mini-calendar** (`CalendarGrid` public mode) | S26, S22 | 🟢 | 3 views via `?view=`; category filter; month grid + day-sheet; baked event list crawlable |
| S28 | **Event detail + special-event routes** | S27 | 🟢 | per-item prerender with real title/OG via `entries()`; add-to-calendar; slug-created-after-build falls back client-side; old `?id=`/`?e=` redirect |
| S29 | **Gallery index + album + Lightbox** | S26, S20, S22 | 🟢 | album list + year-wheel; per-album prerendered title/OG; masonry + webp; full lightbox |
| S30 | **Sermons** (build-time YouTube fetch hides key) | S26 | 🟢 | grid↔player; Shorts filtered; baked sermon list; **YT key NOT in client bundle** |
| S31 | **Discipulado hub + grupo + wizards** | S26, S21, S22 | 🟢 | levels/groups/schedule baked; interest + per-group signup insert as anon `return=minimal`; grupo is `noindex` |
| S32 | **Registration wizard shell + steps 1–3** | S21, S07 | 🟢 | multi-participant add/remove; per-step validation matches legacy; `same_emergency` as `$derived` |
| S33 | **Waiver step + Confirm + submit + security** | S32, S10, S19, S07 | 🟢 | inserts N rows w/ shared `registration_group_id`; **honeypot + captcha + signature size-cap** ride along (fixes SEC-09) |
| S34 | **Public registro route wire-up** | S33, S22 | 🟢 | `?e=slug`/`?id` loads; open/closed/past gate; back to event page |
| S35 | **Public service worker** (`$service-worker`) | S23–S34 | 🟢 | offline nav works; hash-aware precache (not legacy hard-coded paths, G-003) |
| S36 | **CUTOVER: public surfaces** (staged, per-URL) + Supabase→rebuild webhook | S35 | 🔴 | leaf pages → content pages → eventos → **home** → **registro** cut over one PR each; SEO diff passes; each revertible in one commit. **Freeze `registro` in VBS season.** |

## Phase 3 — Admin shell + auth · S37–S40

| # | Session | Prereqs | Done when |
|---|---|---|---|
| S37 | **Admin shell & routing skeleton** | S03, S11 | `(admin)` route group `ssr=false`+`fallback`; `/admin/gallery` deep-links & reloads on static host; nav renders |
| S38 | **State stores + UI primitive hosts** | S37, S15, S16 | `session`/`ministries`/`perms` rune stores; `perms.tabs` derives; confirm/toast callable from non-component code |
| S39 | **Auth flows + MFA enforcement + guards** (+ `aal2` RLS migration) | S38, S06 | login/invite/recovery/boot ported; a returning enrolled account cannot reach any `/admin/*` at `aal1`; **`aal2` enforced in RLS** (D-010); all Spanish error branches correct |
| S40 | **Data-layer repos F3 (admin-support)** | S06 | `repos/{profiles,ministries,settings,notifications,activity,newsletter,admin}.ts`; `admin-invite` edge-fn contract byte-compatible |

## Phase 4 — Admin CRUD tabs · S41–S51
*Simplest first. Each is one shippable PR. S44 (ministries) unblocks S48–S49 (events).*

| # | Session | Prereqs | Complexity |
|---|---|---|---|
| S41 | **Dashboard** | S39, S40 | S |
| S42 | **Activity + Settings** | S39, S40 | S |
| S43 | **Notifications bell** | S38, S40 | S–M |
| S44 | **Ministries** | S38, S40, S16, S17 | M |
| S45 | **Account + prefs** | S39, S19 | M–L |
| S46 | **Gallery** | S38, S21, S20, S22 | L |
| S47 | **Users + role presets** | S44, S40 | L |
| S48 | **Events A: CalendarGrid + calendar view** | S44, S22 | XL (split) |
| S49 | **Events B: upcoming + event form + wizard** | S48, S21 | XL (split) |
| S50 | **Discipleship groups** | S38, S21, S22 | XL (split) |
| S51 | **Discipleship interests** | S50 | L |

## Phase 5 — Hard subsystems · S52–S63
*Treasury (+ cents fix), registrations admin, and the Fabric designer (wrapped). The riskiest ports — over-verify S55, S58, S62.*

| # | Session | Prereqs | Done when |
|---|---|---|---|
| S52 | **Data-layer F2: treasury repo** (range-pushdown) | S06, S08 | typed `fin_*` repo; date ranges pushed into queries (fixes PERF-07 over-fetch) |
| S53 | **Treasury shell + Resumen + Ingresos + Gastos** | S52, S21, S16 | month nav refetch; income/expense CRUD via wizard; allocation encode/decode preserved; **totals in cents, exact** |
| S54 | **Treasury Recurrentes + Por pagar + Notas + Config** | S53 | `materializeRecurring(month)` idempotent; `markPaid` mirror + delete; `auto:` notes hidden; funds/categories CRUD |
| S55 | **Treasury Reportes** (report builder + live preview) | S53, S09 | preview == download byte-for-byte (**over-verify**); period bucketing; consolidated pdf helpers; drops the dead `window.print()` path |
| S56 | **Ministry/project treasury + reports** | S53, S09 | budgeted-ministry auto-tab; church-allocated income read-only; project/ministry PDF matches; range-pushdown |
| S57 | **Admin Registraciones: list + form + age groups + images** | S40, S18, S17 | event CRUD; age-group JSON round-trips; slug uniqueness; status↔`registration_open` sync |
| S58 | **Admin Registraciones: detail + realtime + PDF/CSV exports** | S57, S10, S09 | realtime add/delete refresh; age-group buckets; CSV (UTF-8 BOM) + roster/cartel/single/waiver PDFs match; **signed waiver reproduced from frozen row** (**over-verify**, G-006) |
| S59 | **Designer A1: Fabric loader + engine** | S06, S09 | scratch route mounts engine, adds a rect, exports PNG; snapping + zoom (G-005) |
| S60 | **Designer A2: objects + templates + fonts + export** | S59 | each template builds; `exportDesign('pdf')` real vector PDF; QR round-trips |
| S61 | **Designer A3: panels + selection + history + toolbar** | S60 | select/multiselect edits; layer reorder; snapshot undo/redo; keyboard nudge |
| S62 | **Designer A4: collab + autosave + teardown** | S61, S40 | two sessions co-edit (LWW); leader persists; draft recovery; **leaving the route flushes + removes the channel** (**over-verify** — no leaked channel, G-003-adjacent) |
| S63 | **Designer A5: library shell + chooser + share** | S62 | create-from-template/blank/event-prefill; duplicate/delete/share; list live-updates |

## Phase 6 — Cutover & decommission · S64–S65

| # | Session | Prereqs | Done when |
|---|---|---|---|
| S64 | **CUTOVER: `/admin`** (off-season only) | S41–S63 | admin promoted from `/app/admin` to `/admin`; legacy admin deleted in the same PR; 2 weeks of clean error logs before proceeding. **Never during VBS season.** |
| S65 | **Legacy removal + collapse deploy** | S36, S64 | rebuild with `BASE_PATH=''`; delete legacy `js/`/`css/`/`src/` trees + `build.sh`/`build-heads`/`build-sitemap`/`inline-includes`; collapse `deploy.yml` to a single SvelteKit build; final security-hardening pass (CSP, SRI, pin) |

---

## Notes on parallelism & the critical path

- **Critical path:** S01 → S06 → S22 → S26 → S36 (public live), then S37 → S39 → S41… → S64 (admin live). Everything else hangs off these.
- **Parallelizable now:** the entire design-system set (S11–S21) is independent of the lib set (S06–S10) — different sittings can take either. Within Phase 4, tabs with disjoint prereqs (S41/S42/S43/S45) can be done in any order.
- **Backend migrations** (S01 baseline, S39 `aal2`) are the only DB changes and both are additive. Everything else is client-side.
- **Foundations to freeze early** (their contracts ripple everywhere): `money.ts` (S08), the `SignaturePad`/`Modal`/`ActionSheet`/`FormWizard` prop shapes (S16–S21), and the repo method signatures (S22/S40/S52).
