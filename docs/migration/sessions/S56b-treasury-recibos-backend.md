# Session S56b (backend half) — Treasury Recibos: DB, storage, RLS, retention

> Target path in the repo: `docs/migration/sessions/S56b-treasury-recibos.md`
> (this file records the **backend half** of that session; the Svelte UI half is
> still ⬜ and lands once the design system S14–S21 is done).

**Stream:** admin / hard-subsystem
**Depends on:** S01 (baseline schema in git), S22 (repo conventions + mock-client). The UI half additionally needs S53, S56, S20, S46.
**PR:** <#___>   **Branch:** `migrate/S56b-treasury-recibos-db`
**Status:** 🟦 PR open

## Goal (one sentence)
Land everything in `docs/migration/sessions/S56b-treasury-recibos.md` that is
frontend-agnostic — the `fin_receipts` table, the **private** `receipts` bucket
and its storage policies, the D-019 ministry-shared RLS widening, the D-018
retention worker + annual cron, and the typed `repos/receipts.ts` the UI will
consume — so the Recibos UI session has nothing left to design.

## In scope
- `supabase/migrations/20260824120000_fin_receipts.sql` — table + indexes + RLS
  (3 policies) + the private `receipts` bucket + 3 `storage.objects` policies
  (select / insert / delete; **no update**).
- `supabase/migrations/20260824120100_fin_ministry_shared.sql` — the D-019
  additive widening (`pp_fin_projects_ministry_read`, `pp_fin_income_ministry`,
  `pp_fin_expenses_ministry`).
- `supabase/migrations/20260824120200_receipts_cleanup_cron.sql` — the annual
  `'0 5 1 2 *'` pg_cron job (Vault do-block cloned from the newsletter cron).
- `supabase/functions/receipts-cleanup/index.ts` — the retention worker.
- `supabase/README.md` — a "Recibos de tesorería" section (setup + safe no-op curl).
- `web/src/lib/repos/receipts.ts` + `web/tests/unit/repos/receipts.test.ts`.

## Out of scope (do NOT touch)
- **Every Svelte component of the Recibos UI** — `ReceiptsView`, `ReceiptMonthGrid`,
  `ReceiptMonthCard`, `ReceiptViewerModal`, the uploader, `$lib/zip.ts` (fflate),
  `$lib/save-file.ts`. They wait for the design system (S14–S21) and S53/S56.
- Any legacy file (`js/`, `css/`, `admin/`) — DUAL-MAINTENANCE. This feature
  exists ONLY under `/app`.
- Existing migrations — never edited; only added.
- S56c (bulk entry), S55 (reports), the S64 duplicate-project consolidation.
- Making any bucket public, ever (D-018).

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` §0/§2 (D-002, D-003, D-010, **D-018, D-019**) and §3
      (G-006, **G-014**, G-015, **G-016**, **G-024**, G-025), and `CLAUDE.md` §7.
- [x] Read the authoritative spec `docs/migration/sessions/S56b-treasury-recibos.md`
      and implemented it as written (deviations are listed in NOTES.md §5).
- [x] **Every table, column, function and policy name verified against
      `00000000000000_baseline.sql` + `00000000000001_baseline_storage.sql`** —
      evidence with line numbers in NOTES.md §1/§2.
- [x] Templates: `20260703000001_profile_avatar.sql` (bucket + storage policies),
      `20260706000001_newsletter_cron.sql` (Vault do-block),
      `supabase/functions/newsletter-broadcast/index.ts` (+ the CORS const from
      `newsletter-subscribe/index.ts`).
- [x] Fixture / golden: **none — new functionality, no legacy oracle. Gate box #5
      is N/A** (recorded here per the spec). Substitute: Vitest on the pure
      helpers (path builder, D-018 cutoff arithmetic) + the staging RLS checks a
      human must still run.

## Steps
1. Verified every referenced object against the two baseline files (NOTES.md §1).
2. Wrote `20260824120000_fin_receipts.sql`: the table exactly as specced, the two
   indexes, RLS, the three scope policies with `public.is_aal2()` resolved (G-016),
   the `public = false` bucket with a `image/webp` allowlist + 10 MB cap, and the
   select/insert/delete storage policies (insert enforcing the path shape).
3. Wrote `20260824120100_fin_ministry_shared.sql` — additive only; cross-checked
   that none of the three names exists in the baseline or any migration.
4. Wrote `supabase/functions/receipts-cleanup/index.ts` on the newsletter
   conventions; extracted the cutoff into an exported `retentionCutoffYear()`.
5. Wrote `20260824120200_receipts_cleanup_cron.sql` and re-derived the retention
   arithmetic against D-018; the worked example is in its header comment.
6. Added the "Recibos de tesorería" section to `supabase/README.md`.
7. Built `web/src/lib/repos/receipts.ts` on the S22 conventions with a local
   `FinReceipt` row type mirroring the migration, and unit-tested it with the S22
   mock-client recorder.
8. Ran the `web/` gate in a scratch harness.

## Acceptance criteria
- [x] `fin_receipts` matches the spec column for column, including the
      `fin_receipts_scope_ids` CHECK, `storage_path` UNIQUE and the two indexes.
- [x] Three table policies: church → finance; ministry → finance **or**
      `ministry_id = any(my_ministry_ids())` (D-019); project → owner only,
      invisible even to finance. All three call `public.is_aal2()`.
- [x] Bucket created with `public = false`, `allowed_mime_types {image/webp}`,
      `file_size_limit 10485760`; the `on conflict` branch re-asserts `public = false`.
- [x] Storage: SELECT / INSERT / DELETE only. INSERT additionally pins folder
      depth (2 for church, 3 for ministry/project) and a `^\d{4}$` year, so the
      `::uuid` casts elsewhere can never meet a malformed name. **No UPDATE policy.**
- [x] D-019 widening is additive — `pp_fin_income_owner` / `pp_fin_expenses_owner`
      / `pp_fin_projects` are untouched, and the three new names collide with nothing.
- [x] The worker: POST-only, `x-cron-secret` gate, service-role client, Spanish
      `{error}` / `{ok:true,…}`, 500-row pages, `remove()` chunked at 100, orphan
      sweep of year folders under all three scope prefixes, failures collected
      without aborting.
- [x] Retention arithmetic re-derived and unit-tested against the D-018 worked
      example (Feb 1 2028 → deletes ≤ 2026, keeps 2027 + 2028) — and against the
      self-healing case (a missed 2028 run is cleared by 2029).
- [x] `repos/receipts.ts`: reads never throw (`[receipts]` warn + safe empty),
      writes return `WriteResult`, upload rolls back **both** objects when the row
      insert fails, no `getPublicUrl` / no signed URL anywhere (private bucket).
- [ ] **Migrations applied** — NOT possible in this session (see below).
- [ ] **Staging RLS negative checks** — owed by a human (see below).

## Verification gate

### ⚠️ Docker is unavailable in this session, so the migrations CANNOT be applied or reset here.
`supabase start` / `supabase db reset` need the local stack. **Nothing in
`supabase/` has been executed against any database — not local, not staging, not
prod.** Everything below is static verification plus the `web/` gate. Two things
a human must do before this is real:

1. **Apply the three migrations by hand in the SQL Editor**, in filename order
   (`…120000_fin_receipts` → `…120100_fin_ministry_shared` → `…120200_receipts_cleanup_cron`),
   and deploy the function: `supabase functions deploy receipts-cleanup --no-verify-jwt`.
   Then run `supabase db reset` twice on a machine with Docker to prove
   idempotence over the baseline. Setup steps and the post-apply checks are in
   the new `supabase/README.md` section.
2. **Run the staging RLS negative checks** the spec's acceptance criteria list
   (leader A sees leader B's ministry receipts; a non-member gets zero rows and a
   storage `download()` 4xx; a non-finance leader gets zero `church` rows;
   **finance gets zero `project` rows**; anon gets nothing) and paste the
   transcript into the PR. Unit tests cannot substitute for this — VERIFICATION.md
   is explicit that RLS is covered on staging, never in Vitest.

### `web/` gate — run in a scratch harness
Harness = `git -c core.autocrlf=false -c core.eol=lf archive migrate/S22-repos web`
(see NOTES.md §6 — the `core.eol` half is new, G-025 only documents `autocrlf`),
`npm ci`, `web/.env` stubbed with `PUBLIC_SUPABASE_URL=https://example.supabase.co`
+ `PUBLIC_SUPABASE_ANON_KEY=stub`, then these two files copied in.

```
[x]  1. Install clean     npm ci                        → 0 errors (272 packages;
                                                          4 pre-existing audit advisories, unchanged)
[x]  2. Typecheck         npm run check                 → 501 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint                  → prettier: all matched files pass · eslint: 0 problems
[x]  4. Unit tests        npm run test                  → 32 files passed | 1 skipped (33)
                                                          786 tests passed | 2 skipped (788)
                                                          baseline before S56b: 31 files / 763 → +1 file, +25 tests
                                                          re-run TZ=Asia/Tokyo and TZ=America/New_York: 25/25 both (G-002)
[ ]  5. Golden parity     N/A — new functionality, no legacy oracle (spec says gate #5 is N/A;
                                substitute = the pure-helper Vitest above + the staging RLS checks)
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build
                                                        → "✓ built in 2.29s", adapter-static wrote build/
[ ]  7. Preview smoke     N/A — no route or component in this session
[x]  8. Legacy untouched  only `supabase/**` (3 new migrations, 1 new function, README) and
                          `web/src/lib/repos/receipts.ts` + its test; no legacy file modified
[ ]  9. Parity walk       N/A (no UI)
[ ] 10. SEO diff          N/A
[ ] 11. SW cache bumped   N/A (not a cutover)
[x] 12. Secrets/PII clean no service-role key in `web/`; the function reads SUPABASE_SERVICE_ROLE_KEY /
                          CRON_SECRET from Deno.env only; no secret, key or PII in any migration or test
[ ] 13. Ledger updated    → to do in the PR: MIGRATION.md status board (S56b backend 🟦), Current state,
                          Next up; append the new G-xxx from NOTES.md §6 (git archive + `core.eol`)
```

## How to resume if interrupted
- Branch: `migrate/S56b-treasury-recibos-db`. Done so far: everything in
  "In scope"; the `web/` gate is green; NOTES.md written.
- Next concrete action: copy the deliverables onto the branch, run
  `cd web && npm run check && npm run lint && npm run test && MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build`,
  update `MIGRATION.md`, open the PR — then hand the two manual steps above to the human.
- Landmines (full list in NOTES.md §4): the bucket must stay `public = false` —
  re-check after every re-run of the migration; the `::uuid` casts in the storage
  predicates are safe ONLY because INSERT pins the path shape, so never loosen it;
  `is_aal2()` is still a `select true` stub (G-016) — these policies are NOT
  MFA-enforced until S39; the cutoff arithmetic exists twice (Deno + web) and must
  stay in step; `receipts-cleanup` must keep chunking `remove()` at ≤100.

## On completion
- [ ] Update `MIGRATION.md`: status board, Current state, Next up, new G-xxx.
- [ ] Open/refresh the PR; paste the gate block above **plus** the staging RLS
      transcript once a human has run it; link this file.
- [ ] Set this file's Status and PR number.
