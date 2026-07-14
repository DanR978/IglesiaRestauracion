# CLAUDE.md

Rules for working in this repo. Derived from the code as it actually is.
Where the codebase is inconsistent, the better existing pattern is named as the rule.

---

## 1. Stack & the non-obvious bits

- **Vanilla ES modules. No framework, no TypeScript, no bundler in production.**
- Backend: **Supabase** (Postgres + Auth + Storage + Realtime + Deno Edge Functions).
- Vite exists but is **dev-server only** (`npm run dev`).
- Hosting: **GitHub Pages**, custom domain `www.irdlex.org` (`CNAME`).

**The load-bearing fact:** `deploy.yml` never runs `vite build`. It checks out the repo, runs the
generator scripts in place, prunes tooling, and publishes **the repo root itself**. Production
serves your raw, hand-written `.js` / `.css` / `.html` files.

Consequences you must respect:

- **No bare import specifiers.** `import x from 'qrcode'` will 404 in prod. Third-party code is
  imported as a full CDN ESM URL: `import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm'`
  ([qr.js](js/lib/qr.js), [supabase.js](js/lib/supabase.js)). Pin the version.
- **`import.meta.env` is `undefined` in the browser in prod.** Always optional-chain + fall back:
  `import.meta.env?.VITE_X || 'https://…'` ([live-embed.js:5](js/components/live-embed.js#L5)).
- `dist/` is dev output. It is gitignored and ships nowhere. Don't reason about it.
- Don't add a Vite alias. It would resolve in dev and break in prod.

**Security model: Postgres RLS is the boundary.** The client only ever holds the public anon key.
Client-side role checks are **UX only** — never the guard. Every table needs RLS policies.

---

## 2. Directory map

| Path | What belongs there |
|---|---|
| `js/utils/` | Zero-dependency, domain-free primitives. Must not import Supabase. |
| `js/lib/` | App-domain services: knows the DB, the church, the CDN engines. |
| `js/components/` | Reusable UI widgets. |
| `js/app/` | Public-site chrome only, consumed by `js/main.js`. |
| `js/pages/<page>/` | Page entry modules. One HTML page ⇄ one entry script. |
| `js/pages/admin/` | The admin SPA — the only part that's a real "app". |
| `css/tokens/` | `:root` custom properties **only**. |
| `css/base/` | Element resets/global element styles. **No classes.** |
| `css/layout/` | Page-agnostic structural scaffolds. |
| `css/components/` | Site-wide reusable widgets. |
| `css/sections/` | Named page bands (homepage + site chrome). |
| `css/pages/` | Route-specific. Subfolder when a route needs several files. |
| `css/utilities/` | Single-purpose helpers + `@keyframes`. Last in the cascade. |
| `src/` | **Source** HTML partials (`header.html`, `footer.html`, `contact-form.html`). |
| `supabase/migrations/` | `YYYYMMDD_snake_case.sql`, idempotent, applied **manually**. |
| `scripts/` | Build generators. |

---

## 3. NEVER hand-edit (generated)

| File / region | Owner |
|---|---|
| `css/style.css` | `scripts/build.sh` (+ CI) — edit the source file under `css/*/` |
| `sitemap.xml` | `scripts/build-sitemap.mjs` |
| `<!-- BUILD-HEAD -->` … `<!-- /BUILD-HEAD -->` in any page | `scripts/build-heads.mjs` |
| `<!-- BUILD-INLINE:x -->` … `<!-- /BUILD-INLINE:x -->` | `scripts/inline-includes.mjs` (source: `src/*.html`) |
| `js/lib/config.js` | gitignored; CI writes it from GitHub secrets |
| `dist/` | `vite build` |

`css/admin.css` is a **dead, orphaned artifact** — tracked in git, built by nothing, linked by
nothing. Never edit it, never link it. (See open questions.)

---

## 4. CSS

**Build:** plain `cat` concatenation, auto-discovered, **no `@import`, no preprocessor**.
Cascade order *is* folder order: `tokens → base → layout → components → sections → pages → utilities`.
Put a rule in the folder that gives it the right weight instead of reaching for `!important`.
New file → drop it in the right folder, it's picked up automatically.

**Admin CSS is deliberately NOT bundled.** `css/pages/admin/*.css` is excluded from `style.css` so
public visitors don't download it. A new admin CSS file **must be added as a `<link>` in
[admin/index.html](admin/index.html)** — order matters (it is the cascade).

### Tokens — use them, don't retype their values

- **Color:** `var(--color-*)`, `var(--cat-*)`, `var(--gray-*)`. House style keeps a literal fallback:
  `background: var(--color-dark, #394548)`.
  - `--color-primary` **does not exist and is intentionally removed** — use `--color-dark`.
  - `--gold-bright` is **decorative only** (fails contrast for text). For gold text use `--color-secondary`.
  - `--color-text` auto-reverses for dark mode. Use it for body/heading text.
- **Spacing:** `--pd-*` (padding), `--mg-*` (margin), `--gap-*` (gap). These are **fluid**
  (`calc()`/`clamp()` with `vw`), not a linear px scale — that's why little of the site needs
  media queries. Reach for a token before a breakpoint.
- **Type:** `var(--fs-*)`. **Never set `font-size` in px.**
- **Radius:** `var(--radius-*)`. **Z-index:** `var(--z-*)`. **Shadows:** define only in `shadows.css`.
- **There are no breakpoint tokens and no motion tokens.** `var()` is illegal in a media query —
  don't try (there's already a dead block doing this at
  [container.css:108](css/layout/container.css#L108)).
- House easing is `cubic-bezier(0.22, 1, 0.36, 1)` (used ~100×). Match it.

### Dark mode — one mechanism only

Dark mode is a **token override in [`css/tokens/colors.css`](css/tokens/colors.css)**, which is the
only file that mentions `data-theme`. Everything else consumes `var(--color-*)` and reverses for free.

**Never add `@media (prefers-color-scheme: dark)` to a component/section/page file.** It silently
breaks the admin's forced-theme override (`<html data-theme="dark">`). ~27 such blocks already exist
and are bugs, not precedent.

### Naming & responsive

- **BEM:** `.block__element`, `.block--modifier` (865 / 117 uses — unambiguous).
- Admin files use a short per-feature namespace (`trez-`, `dscp-`, `se-`, `wiz-`, `acct-`…). That
  namespace is what keeps 24 unbundled files from colliding. Keep it.
- Global button component is the one `ird-` family: `.ird-btn`, `.ird-btn--teal`.
- The CSS is **desktop-first** (`max-width`, 73×) despite docs claiming otherwise. Don't invent new
  breakpoints — reuse the canonical set: **768 / 640 / 600 / 480**.
- **Every animation gets a `@media (prefers-reduced-motion: reduce)` guard.**
- Admin UI/UX rules (collapsible panels, no horizontal scroll, contrast, ≥16px inputs) live in
  [docs/admin-ux.md](docs/admin-ux.md) — follow it for any admin work.

---

## 5. JavaScript

### Imports & exports

- **Root-absolute `/js/…` for cross-directory:** `import { sb } from '/js/lib/supabase.js'`
- **Relative `./x.js` for same-directory siblings:** `import { toast } from './ui.js'`
- **Always include the `.js` extension.**
- **Named exports.** Only 5 `export default` exist, all legacy compat shims. Don't add more.

### Files & naming

- Files: **kebab-case**. (`CalendarGrid.js` / `missionSlideShow.js` are pre-existing exceptions —
  don't rename them, don't imitate them.)
- Functions: camelCase, verb-first, by role — `init*` (entry points), `fetch*` (repo reads),
  `load*` (UI loaders), `render*`, `build*`, `mount*`, `create*`, `show*`.
- Module-private singletons and class-private methods: `_`-prefixed.
- Module constants: `SCREAMING_SNAKE` at the top of the file.
- **User-facing strings are Spanish. Code, comments, and identifiers are English.**
- Shared modules open with a boxed header comment (path + purpose + `Usage:`). It's the most
  consistent convention in the repo — match it for any new shared module.

### Rendering & escaping — the #1 rule

All UI is built as HTML strings assigned to `.innerHTML`, so **escaping is the whole XSS defense.**

**For new render code, use the auto-escaping tagged template** from
[`js/utils/escape.js`](js/utils/escape.js) — interpolations are escaped by default and you opt out
explicitly:

```js
import { html, raw } from '/js/utils/escape.js';
import { render } from '/js/utils/render.js';

render(listEl, html`<h3>${title}</h3>`);           // title auto-escaped
render(listEl, html`<div>${raw(trustedSvg)}</div>`); // explicit opt-out
```

`render(container, content)` skips the DOM write when the markup is unchanged (preserving scroll
position and not re-running entry animations) and returns whether it updated.

The older pattern — a plain template string with manual `esc()` on every interpolation — is what most
files still do (44 import `escape.js`). It is **correct but fragile**: it only works if you remember
every value. When editing existing code, keep using `esc()` rather than rewriting the file; for new
code, prefer `html`` `. **Never interpolate a DB/user value into `.innerHTML` unescaped.** Never
hand-roll a local `esc`/`escapeHtml` — import it.

Rich text from the DB goes through [`sanitizeHtml`/`renderRichText`](js/lib/sanitize-html.js) — on
save *and* on render (defense in depth; never trust stored HTML, even admin-authored).

### Data fetching

`sb` from [`js/lib/supabase.js`](js/lib/supabase.js) is a **nullable singleton** — guard it:
`if (!sb) return [];`

**Prefer a repository module.** [`js/lib/discipleship.js`](js/lib/discipleship.js) and
[`js/lib/gallery.js`](js/lib/gallery.js) are the model: all queries for a feature in one `js/lib/<feature>.js`,
UI never touches `sb.from()`. New features should follow this. (30+ admin files still inline
`sb.from()` — that's the legacy shape; don't extend it, and don't mass-migrate it either.)

Repo-layer contract:

```js
// reads: never throw — log with a [module] tag, return a safe empty
if (error) { console.warn('[gallery] fetchAlbums:', error.message); return []; }
return data ?? [];

// writes: return a result object, don't throw
if (error) return { error: error.message };
return { ok: true };
```

UI-layer contract:

- **Read errors** → render an error box into the container.
- **Write errors** → `toast(error.message, 'error')`. Success → `toast('Guardado', 'success')`.
- Parallel reads → `Promise.all`. Counts → `.select('id', { count: 'exact', head: true })`.
- Privileged operations go through `callAdmin(action, payload)`
  ([admin-fn.js](js/pages/admin/admin-fn.js)) → the `admin-invite` Edge Function. This one throws.

### Loading / error / empty states are mandatory

Every async view renders all three. There is no shared helper yet, so match these exact class names
(the CSS already exists):

```js
'<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>'
'<div class="empty-state"><i class="fas fa-calendar-check"></i><p>No hay eventos próximos.</p></div>'
'<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>…</p></div>'
```

### Two toast systems — not interchangeable

- **Admin:** `import { toast, confirm } from './ui.js'` → `toast(msg, 'success'|'error'|'info')`
- **Public site:** `import { showToast } from '/js/lib/toast.js'` → `showToast(msg, { ok })`

### State

No framework, no store. Module-scoped `let` + explicit setters, centralized per area — see
[`js/pages/admin/state.js`](js/pages/admin/state.js) (`currentProfile`, `setCurrentUser`, `isAdmin()`,
`isStaff()`, plus shared `pad2`/`todayISO`/`ymd`). **Import those helpers; don't redeclare `pad`/`ymd`/`$`
locally** (already duplicated across 5+ files).

### Logging

**No `console.log` — there are zero in the repo, keep it that way.** Use `console.warn` / `console.error`
with a bracketed module tag: `console.warn('[discipulado] fetchAllGroups:', error.message)`.

---

## 6. Documents / PDFs — the standard

All printable/downloadable documents use **pdfmake via [`js/lib/pdf.js`](js/lib/pdf.js)**.
**Never `window.print()` or a hidden print iframe for new output.**

- Build a pdfmake docDef; wrap with `churchDocDef({ content, title, headRight, accent, wm })`
  (`wm` from `await churchLogo()`) for the standard header/footer/watermark.
- Deliver with `savePdf(docDef, filename)` or `openPdf(docDef)`.
- Images must be data URLs — use `imageDataUrl(url)`.
- Reuse `sectionHeading`, `kpiBox`, `th`, `CONTENT_W`.
- A document also shown on-screen (e.g. the waiver) is **single-sourced**: text/constants in one
  module ([`js/lib/waiver.js`](js/lib/waiver.js)), with both the HTML and pdfmake versions built from it.
  Bump `WAIVER_VERSION` when legal wording changes.

---

## 7. Supabase

- **Migrations:** `supabase/migrations/YYYYMMDD_snake_case.sql`. Idempotent
  (`create … if not exists`, `create or replace`, `drop policy if exists` before `create policy`).
  Applied **manually in the SQL Editor** — CI never touches the DB. State ordering in a header
  comment when same-day order matters.
- **RLS on every table.** Helpers are `language sql stable security definer set search_path = public`
  with an explicit `grant execute … to authenticated`.
- **Edge Functions (Deno):** pinned URL imports (`https://deno.land/std@0.177.0/http/server.ts`,
  `https://esm.sh/@supabase/supabase-js@2`); a module-level `CORS` const with an early `OPTIONS`
  short-circuit; secrets via `Deno.env.get(...)`, never inlined; error shape
  `{ error: "<Spanish user-facing message>" }` + HTTP status; success `{ ok: true, … }`.
  Deployed manually with `supabase functions deploy <name>`.
- Schema change ⇒ migration **and** update the validation, the queries, and the UI. No half-applied schemas.

---

## 8. Adding a page / shipping

- **New public page ⇒ update four places:** `vite.config.js` `pageDirs`, `build-heads.mjs` `PAGES` +
  `CRUMB`, `build-sitemap.mjs` `PAGES`. (Six existing pages already violate this — see open questions.)
- **Changed anything in the SW app shell? Bump `CACHE_VERSION` in [sw.js:14](sw.js#L14).**

### Commands

```bash
npm run dev          # Vite dev server (NEVER use VS Code Live Server — import.meta.env crashes)
npm run build:css    # rebuild css/style.css after editing any css/ source
npm run build:site   # css + heads + sitemap + inline includes
```

### What must pass before "done"

**Be honest: there is no lint, no test suite, no type checker, and no CI gate.** The only automated
checks are "`build.sh` succeeds" and "Pages deploys". So:

1. If you touched `css/`, run `npm run build:css` and commit the regenerated `css/style.css`
   (CI would otherwise do it in a follow-up `chore: rebuild style.css [skip ci]` commit).
2. Verify in the browser via `npm run dev` — this is the real gate. Check the flow you changed,
   at ~360px wide, and in both light and dark.
3. Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `feat(treasury):`) — the recent convention.

---

## 9. DO

- **Match the existing pattern in the file you're editing** — its escaping style, its naming, its
  comment density.
- **Keep changes minimal and scoped.** Touch only what the task needs.
- **Add loading, error, and empty states** to every async view. All three, every time.
- **Keep components focused**; extract shared logic into `js/lib/` (domain) or `js/utils/` (primitive).
- **Escape every interpolated value.** Prefer `` html`` `` for new code.
- **Use tokens** for color, spacing, type, radius, z-index, shadow.
- **Guard `sb` for null** and guard every animation with `prefers-reduced-motion`.
- **Preserve backwards compatibility.** Finish implementations — never leave a TODO.

## 10. DON'T

- **Don't add decorative flourishes or template-dashboard aesthetics.** No gratuitous gradients,
  glows, or stat-card chrome. (The old instructions claimed "neon styling" — that is not this
  codebase. It's a restrained teal/gold church palette with AA-contrast-tuned tokens.)
- **Don't leave `console.log`, dead code, or redundant comments.** Comment only what the code can't
  say — a constraint or a why, not a narration of the next line.
- **Don't reformat or re-indent files you didn't otherwise change.**
- **Don't add an abstraction with a single caller.**
- **Don't use `any`** — and more to the point, don't add TypeScript, a type checker, or a new build
  step without asking. There is none today.
- **Don't add a library when one in the repo already does the job** — pdfmake (`js/lib/pdf.js`),
  QR (`js/lib/qr.js`), Fabric (`js/lib/fabric.js`), sanitizer, validators, toast, signature pad,
  image optimizer all already exist.
- **Don't use bare import specifiers** or add a Vite alias — both break the raw-served production build.
- **Don't hand-edit generated files** (§3) or a `BUILD-HEAD` / `BUILD-INLINE` region.
- **Don't add `@media (prefers-color-scheme: dark)` outside `css/tokens/colors.css`.**
- **Don't trust a client-side role check as a security boundary** — RLS is the guard.
- **Don't rewrite working code, redesign pages, or rename files** unless asked.
- **Don't extend the `window.__*` + inline `onclick="…"` pattern.** It exists (19 globals) and is the
  riskiest code in the tree; use event delegation / `addEventListener` in new code.

---

## Open questions — flagging rather than inventing a convention

1. **Mobile-first vs desktop-first.** `.claude/CLAUDE.md`, `PROJECT_CONTEXT.md`, and `docs/admin-ux.md`
   all say "mobile-first"; the CSS is measurably **desktop-first** (73 `max-width` vs 26 `min-width`).
   Which governs *new* CSS? I documented reality; you may want the docs corrected or the CSS migrated.
2. **Escaping migration.** `` html``/render() `` is safer and documented as the successor, but lives in
   exactly one file ([dashboard.js](js/pages/admin/dashboard.js)) vs `esc()` in 44. I made `html`` ` the
   rule for new code and left existing code alone. Confirm — or authorize a migration.
3. **Repository modules.** Only `discipleship.js` / `gallery.js` follow it; 30+ admin files inline
   `sb.from()`. I made the repo pattern the rule for *new* features. Confirm scope.
4. **Dead code to delete?** `css/admin.css` (4,887 lines, orphaned); the dead `@media (max-width: var(--bp-xs))`
   block at [container.css:108](css/layout/container.css#L108); the vestigial `qrcode` npm dependency
   (it's loaded from CDN); the broken "Build CSS" task in `.vscode/tasks.json` (points at `build.sh`,
   file is at `scripts/build.sh`).
5. **Two type scales.** `--fs-*` (fluid) vs `--size-*` (static rem); `.ird-btn` uses `--size-base` while
   a `--fs-btn` exists. Also `--fs-2xl`'s max (2rem) is **smaller than** `--fs-xl`'s (2.1875rem) — the
   scale is non-monotonic. Which scale wins, and should the clamps be re-tuned?
6. **Duplicate shadow tokens** defined in both `colors.css` and `shadows.css`; `shadows.css` is
   effectively dead in dark mode. Consolidate?
7. **Six pages missing from the build config** (`calendario`, `contacto`, `doctrina`, `lideres`,
   `pastor`, `vision-valores`) — absent from `vite.config.js` `pageDirs`. Harmless in prod (raw deploy)
   but they're missing from `npm run build` output. Intentional?
8. **No tests, lint, or formatter.** Want ESLint/Prettier and a smoke-test setup, or deliberately staying
   zero-tooling?
9. **Stale docs.** `README.md` and `.claude/PROJECT_CONTEXT.md` both describe a `css/admin.css` bundle
   that no longer exists. Should I fix them?
10. **This file vs [.claude/CLAUDE.md](.claude/CLAUDE.md).** The existing one holds the real PDF standard
    (folded in above) plus generic prose that doesn't match the repo ("Type safety" with no type checker,
    "neon styling"). Recommend deleting it and keeping this one as the single source. Your call.
11. **Base DB schema isn't in git** — `supabase/README.md` notes the core tables/policies were created in
    the dashboard; migrations only cover 2026-05-26 onward. Worth backfilling a baseline migration?
