# Dual-fix backlog — critical fixes that land in the LIVE legacy codebase

> **The register required by [`DUAL-MAINTENANCE.md`](DUAL-MAINTENANCE.md) §"Where a critical fix lands".**
> Every issue raised during the redesign-vs-migration reconciliation was adjudicated against the
> dual-maintenance bar. This file is the audit trail: what qualifies to be patched in the frozen
> live admin, and — the load-bearing half — what was **rejected** so nobody can later claim a
> redesign was smuggled into legacy under a "fix" label.
>
> The migration GOVERNS. `.claude/REDESIGN-ADMIN.md` is **requirements input to the port**, not a
> work order against legacy. A qualifying fix here is the narrow exception; everything else waits
> for the new site and is filed in `PORT-DEBT.md`.
>
> Last updated: 2026-07-14 · by: dual-fix-triage · Scope: `/admin` (frozen — VBS/registration season)
> DF-001 landed in legacy 2026-07-14; S51 port mirror still open.
> DF-002 landed in legacy AND in the port 2026-08-24 (one PR; golden fixture re-captured).

---

## The rule (verbatim, from `DUAL-MAINTENANCE.md`)

> A change lands in the **legacy** (live) codebase **only if** it is one of:
> 1. a **security / PII** fix,
> 2. a **legal** fix (waiver wording, privacy policy), or
> 3. a **production-down** bug.
>
> Everything else — features, redesigns, nice-to-haves — **waits for the new site** and is filed as
> a `post-migration` issue. **No new features in the legacy codebase.**

**The bar for this file, restated: security / PII / legal / production-down ONLY.** Nothing else
qualifies — not a token cleanup, not a missing loading state, not a nicer confirmation dialog, not
an unescaped sink that no untrusted actor can reach. "Minimal patch" does not rescue a
non-qualifying finding; the category gate is what decides.

**Where a qualifying fix lands** (also verbatim):
- **Surface not yet cut over:** fix the legacy (live) code, *and* immediately mirror the fix into
  the new port — in the port branch if it exists, or as an issue tagged `dual-fix` so the porting
  session applies it.
- **Surface already cut over:** fix the new code only.
- A critical fix always ships **with a test that reproduces it.** (See **TEST DEBT** below — legacy
  has no harness; this is a known contradiction with a proposed resolution.)

All `/admin` surfaces are **not yet cut over** and are under the active **VBS/registration freeze**,
which explicitly permits *legacy-only critical fixes during the freeze*. So every qualifying item
here is "fix legacy now **and** mirror into the port as `dual-fix`".

---

## Board

| ID | Title | Category | Severity | Qualifies | Mirror | Landed |
|---|---|---|---|---|---|---|
| DF-001 | Unescaped visitor free-text → admin `.innerHTML` in Interesados | security / PII | major | ✅ yes | S51 `dual-fix` | ☑ |
| DF-002 | `safeHref` scheme check defeated by embedded newline (`java\nscript:`) | security | major | ✅ yes | landed with the fix (port patched in the same PR) | ☑ |
| — | project-treasury renders `$0.00` on failed fetch | missing-error-state | — | ❌ no → PORT-DEBT (S56) | — | — |
| — | calendar `filters.js` unescaped ministry name/color | admin-self-XSS | — | ❌ no → PORT-DEBT (S48/S49) | — | — |
| — | `filters.js` + `ministries.js` unescaped ministry name/color | admin-self-XSS | — | ❌ no → PORT-DEBT (S44/S48/S49) | — | — |
| — | Maintenance toggle has no confirmation | UX safety | — | ❌ no → PORT-DEBT (S42) | — | — |

---

## CONFIRMED — land in legacy, mirror into the port

### DF-002 — Sanitizer `safeHref` scheme check defeated by an embedded newline

- **id:** `sanitize-safehref-newline-scheme-bypass`
- **Category:** security — allowlist bypass in the sanitizer that is the D-005 security contract.
  Found 2026-08-24 while capturing the S07 golden corpus from the legacy module.
- **Severity:** major (not blocker — authoring rich text requires a staff session today, but the
  sanitizer is also the defense-in-depth layer for ALL stored HTML, and this voids it for `href`).
- **Surface:** every `sanitizeHtml`/`renderRichText` render — public site and admin. Security fix →
  **legacy fix permitted** under the freeze.
- **Sink:** `js/lib/sanitize-html.js` `safeHref` — the scheme-reject regex does not survive
  whitespace/control characters inside the scheme. Browsers strip `\n`/`\t` when canonicalizing a
  URL, so `href="java\nscript:alert(1)"` passes the regex and executes on click.
- **Reproduction (D-012a):** `sanitizeHtml('<a href="java\nscript:alert(1)">x</a>')` keeps the
  `href` today — the S07 fixture `web/tests/fixtures/sanitize-html.json` pins this exact wrong
  output (the corpus contains the vector). After the fix the `href` must be dropped.
- **Minimal fix (no allowlist change):** strip ASCII control/whitespace chars from the candidate before
  the scheme test — `href.replace(/[\u0000-\u0020]/g, '')` — mirroring browser URL canonicalization.
- **Mirror:** the S07 port carries the hole **byte-identically on purpose** (golden parity first).
  The dual-fix PR patches legacy `js/lib/sanitize-html.js` AND `web/src/lib/sanitize-html.ts` in
  the same change, regenerates the fixture (`CAPTURE=1` test), and keeps the vector as a
  now-correct assertion (D-012b satisfied — the harness exists since S05).
- **Landed:** ☑ 2026-08-24 — legacy `js/lib/sanitize-html.js` and the port `web/src/lib/sanitize-html.ts` patched in ONE PR: the candidate is canonicalized (all C0 controls + DEL stripped, spaces preserved so `mailto:?subject=a b` survives) BEFORE the scheme tests. The golden fixture was re-captured from the fixed legacy module: **exactly one of the 99 vectors changed** — the attack payload now yields `<a>x</a>` instead of keeping the href — so the corpus itself is the regression test (D-012b satisfied, no separate test owed).

### DF-001 — Unescaped visitor free-text interpolated into admin `.innerHTML` (Interesados list)

- **id:** `dscp-interests-unescaped-innerhtml`
- **Category:** security / PII — stored XSS in a privileged (admin/pastor) session over a visitors'
  PII table.
- **Severity:** major (not blocker — no in-app form populates the fields today; exploitation needs
  a direct anon PostgREST `POST` or a pre-existing crafted row).
- **Surface:** Discipulado → Interesados. Not yet cut over; under the freeze → **legacy fix
  permitted**.
- **Sink:** [`js/pages/admin/discipleship-tab.js:678-681`](../../js/pages/admin/discipleship-tab.js)
  (`experience_level`, `preferred_day`, `preferred_time` interpolated raw), joined into the string
  assigned to `list.innerHTML` at `:636` (flat) / `:623`,`:631` (grouped). `escapeHtml` is already
  imported at `:1` and used on ~15 sibling fields in the same function (`full_name`, `email`,
  `message`, `home_address`, `bringing_family`, …) — the three raw ones are an oversight, not a
  design choice.

- **What actually goes wrong for a real user:** `discipleship_interests` is an anon **INSERT-only /
  no-SELECT** table (a visitor-PII table; confirmed by `20260630_page_permission_rls.sql` and
  `supabase/README.md`). The anon key is public, so an attacker can `POST` a row directly to
  PostgREST, bypassing the client-side coercion in `discipleship.js` `submitInterest` (which
  CLAUDE.md itself says is UX-only, never the boundary). `preferred_day` / `preferred_time` are
  unconstrained free-text columns. A payload like `<img src=x onerror=…>` stored there **executes
  inside the authenticated admin/pastor session** the moment staff open the Interesados tab —
  session hijack / exfiltration of the minors'/visitors' contact PII in that very table. This is the
  exact pattern CLAUDE.md §5 names as the #1 rule ("Never interpolate a DB/user value into
  `.innerHTML` unescaped").

- **Minimal fix (no redesign, no markup/CSS/component change):** wrap the three interpolations in
  the already-imported `escapeHtml`:
  ```js
  const lvl = i.experience_level
    ? `<span class="dscp-int__level">Nivel deseado: ${escapeHtml(i.experience_level)}</span>` : '';
  const dayPref = i.preferred_day  ? `Día: ${escapeHtml(i.preferred_day)}`  : '';
  const timePref= i.preferred_time ? `Horario: ${escapeHtml(i.preferred_time)}` : '';
  ```
  The **load-bearing** wraps are `preferred_day` and `preferred_time` (free-text, anon-writable).
  `experience_level` is numeric-coerced on the normal path and almost certainly a numeric column, so
  a markup POST would fail the type cast — wrapping it is harmless consistency, not the fix.
  `js/lib/discipleship.js` needs **no** edit; it was cited only as evidence of the injection path.
  *(Column types can't be proven from the repo — the base schema is not in git, MIGRATION.md G-004 /
  open question 11. The app treats `preferred_day`/`preferred_time` as free-text throughout, so the
  wrap is correct regardless.)*

- **Reproduction (carried here in lieu of an automated test — see TEST DEBT):**
  *Precondition:* a **staging** Supabase project (never production; VERIFICATION.md PII rule — use
  no real PII in the fixture). You need only the project URL and the public **anon** key (both are
  already client-visible), proving the anon-writable injection path.
  1. Insert a crafted interest row **using the anon key**, exactly as a visitor's browser would,
     to show the sink is reachable without any privileged write. From a shell:
     ```bash
     curl -X POST "$SUPABASE_URL/rest/v1/discipleship_interests" \
       -H "apikey: $SUPABASE_ANON_KEY" \
       -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
       -H "Content-Type: application/json" \
       -d '{"full_name":"XSS Test","preferred_day":"<img src=x onerror=alert(document.cookie)>","preferred_time":"<img src=x onerror=alert(1)>"}'
     ```
     (`discipleship_interests` is anon INSERT-only / no-SELECT, so this succeeds and the row is not
     readable back over the anon key — matching the real threat model.)
  2. Log in as an admin/pastor, open **Discipulado → Interesados** (Pool view; if the row didn't
     pick a group it lands in the pool). The card for "XSS Test" comes from `renderInterestCard`.
  3. **Before fix (unescaped, lines 678-681):** the browser parses the injected `<img>` and its
     `onerror` fires → `alert` runs inside the authenticated admin session (proof of stored XSS /
     session-context script execution over the visitor-PII table).
     **After fix (`escapeHtml` wraps):** the card renders the payload as literal text
     ("Día: &lt;img src=x onerror=…&gt;"); no `<img>` element is created; `onerror` never fires;
     `alert` never runs. Confirm via DevTools that the `.dscp-int` card contains a text node, not an
     `<img>` element.

- **Mirror obligation:** **S51 — Discipleship interests** (`dual-fix`). The Svelte port's interest
  renderer must escape/sanitize these fields at the sink from the first line (D-005: no `{@html}` of
  untrusted values), and S51 converts the reproduction above into a real Vitest case under `jsdom`
  (G-001).

- **Status:** ☑ landed in legacy (2026-07-14, `discipleship-tab.js:678-681` wrapped in `escapeHtml`) · ☐ mirrored into S51

---

## REJECTED — do NOT land in legacy (filed as PORT-DEBT instead)

These were verified against the actual code and are **real diagnoses** — but none clears the
security / PII / legal / production-down bar, so under the dual-maintenance rule they **wait for the
new site**. Each is recorded in `PORT-DEBT.md` for the named port session. This section is the proof
that a redesign was not laundered into the frozen live admin.

- **`project-treasury-renders-zero-on-failed-fetch`** — *REJECTED (not production-down; missing
  error-state).* `renderProject`/`renderResumen`/`projectTotals`/`ministryBudgets`
  (`project-treasury.js:60,132,168,237`) ignore `.error` and fall back to `$0.00`, so a failed
  ministry-budget fetch looks like "no money". Accurate, but a failed **read** writes nothing, leaks
  nothing, and does not block the user; it fires only on a transient outage, and RLS denials return
  empty data with **no** error. It's a quality gap, not an outage. → **PORT-DEBT.md, S56** (add
  loading/empty/**error+retry** to every async view; sweep in the milder siblings —
  `treasury-tab.js` `renderResumen` ignoring `pay.error`, `report-builder.js` `loadData` ignoring
  `inc/exp.error`).

- **`calendar-filters-unescaped-innerhtml`** — *REJECTED (admin-self-XSS; no trust boundary
  crossed).* `filters.js:22-30` interpolates `m.id/m.color/m.name` into `.innerHTML` with no
  `esc()` — a genuine deviation from CLAUDE.md §5. But `buildFilterChecks()` early-returns unless
  `isAdmin()`, and ministry names/colors are **admin-authored** church config (`m.color` comes from
  `<input type=color>`, `m.id` is a server UUID). Admin-authored data rendering in an admin-only
  view = self-XSS: no lower-privilege writer demonstrated, no PII/availability impact. → **PORT-DEBT.md,
  S48/S49** (the events port must escape these from the start).

- **`filters-ministry-unescaped-innerhtml`** — *REJECTED (same sink as above, raised by a second
  slice; admin-self-XSS).* Adds `ministries.js:39` (unescaped `m.color`). Same threat model: the
  only writer is admin-gated `saveMinistry` (Ministerios is a Desarrollador-only tab per
  `20260707_ministries_dev_tab.sql`); the color vector is structurally near-dead (`<input
  type=color>` yields only `#rrggbb`); victim audience is admins only. Defense-in-depth hardening,
  not a cross-trust exploit. The unknown base-schema `ministries` RLS (not in git) cuts **toward**
  rejection under reject-unless-certain, not for it. → **PORT-DEBT.md, S44/S48/S49** (escape
  `m.name`/`m.color` at every sink in the port).

- **`settings-maintenance-toggle-no-confirm`** — *REJECTED (no defect; UX safety enhancement).*
  `settings-tab.js:27,84,107` toggles `features.maintenance` instantly with no confirm, and
  `maintenance.js` overlays the whole public site. But the flag **works exactly as designed** —
  production is up, not down. The control is admin-gated (`app_settings` is admin-only via RLS),
  one-click **reversible** (it's a checkbox), non-blocking for staff (`maintenance.js:23-31` lets
  any profile bypass the overlay), and **already visually differentiated** as dangerous
  (`danger:true` → red `.settings-flag--danger`). Adding a confirmation step is net-new interaction
  code (an interaction redesign), not a corrected line — precisely the "nice-to-have" the rule says
  waits for the new site. → **PORT-DEBT.md, S42** ("destructive/consequential toggles must confirm"
  becomes a requirement of the settings port + the design-system Confirm/ActionSheet sessions).

---

## TEST DEBT — a known contradiction, with a proposed resolution

`DUAL-MAINTENANCE.md` §"Where a critical fix lands" says:

> A critical fix always ships **with a test that reproduces it**, added to whichever codebase(s) it
> touches.

**But the legacy codebase has no test harness.** CLAUDE.md §8 is explicit: "there is no lint, no
test suite, no type checker, and no CI gate." The roadmap only *creates* the harness in **S05**
(Vitest + `jsdom` + Playwright + the CI gate), and it lives under **`web/`** — the new app. There is
nowhere in the raw-served legacy tree to add a test that runs. A legacy fix therefore **cannot**
literally satisfy the rule as written.

**Proposed resolution (promote to a Decision in `MIGRATION.md §2`):**

> **D-012 — Dual-fix test obligation.** A qualifying legacy fix (`DUAL-FIX-BACKLOG.md`) satisfies the
> "ships with a test" rule in two parts: **(a)** it carries a **written, runnable reproduction** in
> this file (concrete inputs → observed wrong behavior → observed correct behavior after the fix),
> executed by hand against a **staging** Supabase project — never production, no real PII in fixtures
> (VERIFICATION.md PII rule); and **(b)** the mirroring port session (tagged `dual-fix`) **converts
> that reproduction into a real automated test in `web/`** (Vitest under `jsdom` per G-001, or
> Playwright for a flow) as part of porting the surface. The `dual-fix` item is not closeable until
> both the legacy patch and the ported test have landed.

This keeps the live fix un-blocked during the freeze (no harness needed to ship a one-line escape
today) while guaranteeing the regression is captured permanently where tests can actually run. Until
D-012 is ratified in `MIGRATION.md §2`, treat the reproduction block in each CONFIRMED entry as the
binding "test", and the mirror session's automated test as the debt it must repay.

**Applies now to:** DF-001 (reproduction recorded above; automated test owed by S51).
