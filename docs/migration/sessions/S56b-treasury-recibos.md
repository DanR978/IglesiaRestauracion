# Session S56b — Treasury Recibos (receipt images, month grid, retention)

**Stream:** admin / hard-subsystem
**Depends on:** S53, S56, S20 (Lightbox); uses the image-optimizer ported in S46   **PR:** <#___>   **Branch:** `migrate/S56b-treasury-recibos`
**Status:** ⬜ not started

## Goal (one sentence)
Give treasury users receipt-image storage bucketed by month — a 4×3 twelve-month grid with upload / view / per-month ZIP / whole-year ZIP — for the church books (finance), for each ministry a person leads (shared across that ministry, D-019), and for personal projects (owner-private), on a **private** bucket with the D-018 retention cron.

## In scope
- `supabase/migrations/<date>_fin_receipts.sql` — table + RLS + private `receipts` bucket + storage policies (sketch below).
- `supabase/migrations/<date>_receipts_cleanup_cron.sql` — annual pg_cron → edge fn (pattern of `20260706_newsletter_cron.sql`).
- The **D-019 ministry-shared RLS widening** (additive policies on `fin_projects` / `fin_income` / `fin_expenses`, sketch below) — this is the session where the locked behavior change lands.
- `supabase/functions/receipts-cleanup/` edge fn + a "Recibos de tesorería" section in `supabase/README.md`.
- `web/src/lib/repos/receipts.ts`; `web/src/lib/zip.ts` (fflate); `web/src/lib/save-file.ts` (port of `special-events-tab.js:65`); Recibos UI components inside the S53/S56 treasury routes.
- Switch the S56 ministry view's entry queries from owner-scoped to ministry-scoped aggregation (D-019).

## Out of scope (do NOT touch)
- Any legacy file (`js/`, `css/`, `admin/`) — DUAL-MAINTENANCE. The feature exists ONLY under `/app`.
- Bulk entry (S56c). Reports (S55). Consolidating duplicate per-owner ministry projects (deferred to the S64 cutover PR — D-019).
- Existing migrations — never edit; only add.
- Making any bucket public, ever (D-018).

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2 — esp. D-002, D-003, D-008, D-010, D-016, D-017, **D-018, D-019** — §3, current state) and `CLAUDE.md`.
- [ ] Confirm S53, S56, S20, S39, S46 are ✅ on the status board. Locate the optimizer module S46 ported (expected `web/src/lib/images/optimizer.ts`); if S46 did not port it, port `js/lib/image-optimizer.js` here first (verbatim + types).
- [ ] Read the **aal2 enforcement pattern S39 established** (its RLS migration) — every new policy below must include the same aal2 predicate (D-010). The sketches mark the spot with `/* +aal2 */`.
- [ ] Legacy source of truth for patterns (NOT ported surfaces): `js/lib/gallery.js` (upload+rollback), `js/lib/image-optimizer.js`, `20260703_profile_avatar.sql` (storage policies), `20260706_newsletter_cron.sql` + `supabase/functions/newsletter-broadcast/index.ts` (cron + edge fn), `js/pages/admin/special-events-tab.js:65` (saveFile).
- [ ] Fixture/golden: **none — this is new functionality, no legacy oracle. Gate box #5 is N/A**; substitute: Vitest on pure helpers (path builder, retention cutoff math, zip naming) + the RLS negative checks below.

## Steps
1. Write + apply (manually, SQL editor — CI never touches the DB) the two migrations per the spec below. `supabase db reset` locally to prove idempotence + clean apply over the baseline.
2. Scaffold `supabase/functions/receipts-cleanup/` per the spec; deploy `--no-verify-jwt`; verify with a curl carrying `x-cron-secret` against a **staging** project first.
3. Regenerate `web/src/lib/db/database.types.ts` (`supabase gen types --local`) so `fin_receipts` is typed.
4. `npm i fflate` in `web/` (npm deps are bundled — the no-bare-imports rule is legacy-only).
5. Build `repos/receipts.ts`, then the UI (spec below): finance mount, leader mount, month grid, uploader, viewer, ZIPs.
6. Apply the D-019 query switch in the S56 ministry view (aggregate entries by `ministry_id` across all `fin_projects` rows with that ministry, not by `owner_id`).
7. RLS negative checks on staging (see acceptance criteria); Vitest for pure helpers; Playwright smoke for the grid happy path.

## Feature spec (authoritative for this session)

### DB — `fin_receipts`
```sql
create table if not exists public.fin_receipts (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('church','ministry','project')),
  ministry_id   uuid references public.ministries(id)   on delete cascade,
  project_id    uuid references public.fin_projects(id) on delete cascade,
  year          int  not null check (year between 2000 and 2100),
  month         int  not null check (month between 1 and 12),
  storage_path  text not null unique,     -- receipts bucket, main webp
  thumb_path    text not null,            -- receipts bucket, thumb webp
  file_size     int,
  original_name text,
  note          text,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint fin_receipts_scope_ids check (
    (scope = 'church'   and ministry_id is null     and project_id is null) or
    (scope = 'ministry' and ministry_id is not null and project_id is null) or
    (scope = 'project'  and project_id is not null  and ministry_id is null))
);
create index if not exists fin_receipts_lookup_idx
  on public.fin_receipts (scope, ministry_id, project_id, year, month);
create index if not exists fin_receipts_year_idx on public.fin_receipts (year);

alter table public.fin_receipts enable row level security;

-- church: finance only
drop policy if exists pp_fin_receipts_church on public.fin_receipts;
create policy pp_fin_receipts_church on public.fin_receipts for all to authenticated
  using      (scope = 'church' and public.is_finance() /* +aal2 */)
  with check (scope = 'church' and public.is_finance() /* +aal2 */);

-- ministry: every leader of that ministry, plus finance (D-019 — shared, not owner-private)
drop policy if exists pp_fin_receipts_ministry on public.fin_receipts;
create policy pp_fin_receipts_ministry on public.fin_receipts for all to authenticated
  using      (scope = 'ministry' and (public.is_finance() or ministry_id = any(public.my_ministry_ids())) /* +aal2 */)
  with check (scope = 'ministry' and (public.is_finance() or ministry_id = any(public.my_ministry_ids())) /* +aal2 */);

-- project: OWNER ONLY — invisible even to finance (matches pp_fin_income_owner today)
drop policy if exists pp_fin_receipts_project on public.fin_receipts;
create policy pp_fin_receipts_project on public.fin_receipts for all to authenticated
  using      (scope = 'project' and exists (select 1 from public.fin_projects fp
                where fp.id = project_id and fp.owner_id = auth.uid()) /* +aal2 */)
  with check (scope = 'project' and exists (select 1 from public.fin_projects fp
                where fp.id = project_id and fp.owner_id = auth.uid()) /* +aal2 */);
```

> Note: the finance helper is `is_finance()` as of the 20260630 migrations. If the S01 baseline
> dump defines a different canonical helper, prefer whichever the baseline actually defines.

### Private bucket + storage policies
Path scheme (year folder is what the retention job sweeps; **month lives in the row, not the path**):
- `church/<year>/<uuid>.webp` + `church/<year>/<uuid>-thumb.webp`
- `ministry/<ministry_id>/<year>/<uuid>.webp` (+ `-thumb`)
- `project/<project_id>/<year>/<uuid>.webp` (+ `-thumb`)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SELECT (also gates .download()):
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ( /* +aal2 */
       ((storage.foldername(name))[1] = 'church'   and public.is_finance())
    or ((storage.foldername(name))[1] = 'ministry' and (public.is_finance()
          or (storage.foldername(name))[2]::uuid = any(public.my_ministry_ids())))
    or ((storage.foldername(name))[1] = 'project'  and exists (select 1 from public.fin_projects fp
          where fp.id = (storage.foldername(name))[2]::uuid and fp.owner_id = auth.uid()))));

-- INSERT: same shape per scope AND the path must be well-formed (folder depth +
-- 4-digit year), so the ::uuid casts in read/delete can never hit a malformed name.
-- church:   depth 2, [2] ~ '^\d{4}$', is_finance()
-- ministry: depth 3, [3] ~ '^\d{4}$', uploader leads [2]::uuid OR is_finance()
-- project:  depth 3, [3] ~ '^\d{4}$', uploader OWNS the project [2]::uuid (finance may NOT write)
drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and ( /* +aal2 */
       ((storage.foldername(name))[1] = 'church'
          and array_length(storage.foldername(name),1) = 2
          and (storage.foldername(name))[2] ~ '^\d{4}$'
          and public.is_finance())
    or ((storage.foldername(name))[1] = 'ministry'
          and array_length(storage.foldername(name),1) = 3
          and (storage.foldername(name))[3] ~ '^\d{4}$'
          and ((storage.foldername(name))[2]::uuid = any(public.my_ministry_ids()) or public.is_finance()))
    or ((storage.foldername(name))[1] = 'project'
          and array_length(storage.foldername(name),1) = 3
          and (storage.foldername(name))[3] ~ '^\d{4}$'
          and exists (select 1 from public.fin_projects fp
                where fp.id = (storage.foldername(name))[2]::uuid and fp.owner_id = auth.uid()))));

-- DELETE: identical predicates to SELECT except project stays owner-only and
-- church/ministry deletion requires the same write scope as INSERT.
-- NO UPDATE policy: receipts are immutable (upsert:false); replace = delete + re-upload.
```

### D-019 RLS widening (additive; legacy behavior unchanged — legacy filters by owner client-side)
```sql
-- Ministry-mates see the ministry's project container rows:
drop policy if exists pp_fin_projects_ministry_read on public.fin_projects;
create policy pp_fin_projects_ministry_read on public.fin_projects for select to authenticated
  using (ministry_id is not null and ministry_id = any(public.my_ministry_ids()));

-- Ministry-mates share entries of ministry-linked projects (income + expenses, full CRUD):
drop policy if exists pp_fin_income_ministry on public.fin_income;
create policy pp_fin_income_ministry on public.fin_income for all to authenticated
  using      (project_id is not null and exists (select 1 from public.fin_projects fp
                where fp.id = fin_income.project_id and fp.ministry_id is not null
                  and fp.ministry_id = any(public.my_ministry_ids())))
  with check (project_id is not null and exists (select 1 from public.fin_projects fp
                where fp.id = fin_income.project_id and fp.ministry_id is not null
                  and fp.ministry_id = any(public.my_ministry_ids())));
-- identical pp_fin_expenses_ministry on public.fin_expenses
```
Do NOT drop `pp_fin_income_owner`/`pp_fin_expenses_owner` — additive only. The NEW app
aggregates ministry entries by `fin_projects.ministry_id` (all duplicate per-owner rows
included); the duplicate-row consolidation is deferred to the S64 cutover PR (D-019).
Default filed: ministry-mates get SELECT on the container row and full CRUD on entries;
container rename/manage stays owner/finance (revisit at S56b review).

### Retention cron + edge fn (D-018)
`supabase/functions/receipts-cleanup/index.ts` — conventions of `newsletter-broadcast`:
POST-only; reject unless `x-cron-secret == Deno.env.get('CRON_SECRET')`; service-role client;
Spanish `{error}` / `{ok:true,...}` JSON; deploy `--no-verify-jwt`.
Logic: `cutoff = body.cutoffYear ?? new Date().getUTCFullYear() - 2` (i.e. delete `year <= cutoff`):
1. Page `fin_receipts` rows `where year <= cutoff` (500/page); `storage.from('receipts').remove()` their
   `storage_path` + `thumb_path` in chunks of ≤100; collect failures (do not abort the batch).
2. Orphan sweep: `list('church')` → year folders `<= cutoff` → remove contents; for `ministry/` and
   `project/`, `list(scope)` → id folders → year folders `<= cutoff` → remove contents (catches objects
   orphaned by `on delete cascade` of a project/ministry).
3. `delete from fin_receipts where year <= cutoff`.
4. Return `{ ok:true, cutoff, deletedRows, deletedObjects, failures }`.

`<date>_receipts_cleanup_cron.sql` — same Vault do-block as `20260706_newsletter_cron.sql`
(reads existing `project_url` + `cron_secret`; bail with a NOTICE if unset):
```sql
perform cron.schedule('receipts-cleanup-annual', '0 5 1 2 *',   -- Feb 1, 05:00 UTC
  format($cron$ select net.http_post(url := %L || '/functions/v1/receipts-cleanup',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
    body := '{}'::jsonb); $cron$, base_url, secret));
```
**Off-by-one verified:** run fires Feb 1 of year N; cutoff = N−2; deletes year ≤ N−2.
Example: Feb 1 2028 → deletes 2026 and older → 2027 (full previous year) + 2028 kept.
A receipt therefore lives ~13 months (dated Dec 31 of Y) to ~25 months (Jan 1 of Y).
The `<=` (not `=`) makes a missed run self-heal at the next annual firing.
(A monthly self-healing variant — `'0 5 1 * *'` with the same `<=` cutoff — is equivalent in
effect and more robust, but adopting it requires amending D-018's locked "annual" wording.)

### `supabase/README.md` — add a "Recibos de tesorería" section
Setup: apply the two migrations; `supabase functions deploy receipts-cleanup --no-verify-jwt`
(reuses the existing `CRON_SECRET` secret and Vault `project_url`/`cron_secret` from the
newsletter setup — no new one-time secrets); how to run a manual test
(`curl -X POST -H "x-cron-secret: …" …/functions/v1/receipts-cleanup -d '{"cutoffYear":1990}'`
is a safe no-op on an empty range); the retention rule in one sentence.

### UI spec
**Mounts.**
- Finance (S53 church-books shell): a new `Recibos` sub-tab in the treasury subnav (after Notas).
  Top bar: scope picker `[Iglesia | <each ministry>]` (finance sees church + ALL ministries; never
  personal projects) + year picker (current + previous year only — the retention window) + `Descargar año (ZIP)`.
- Leader (S56 ministry/project view): a `Recibos` section inside each ministry tab and each project
  tab (scope fixed by the tab), with the same year picker + year ZIP.

**Components** (under the S53/S56 treasury route folder, e.g. `web/src/routes/(admin)/admin/tesoreria/`):
`ReceiptsView.svelte` (scope+year state, loads `listReceipts(scope, year)` once, groups by `month`),
`ReceiptMonthGrid.svelte` (the 4×3 grid: 4 columns ≥900px, 2 columns ≤640px; one box per month
Ene…Dic), `ReceiptMonthCard.svelte` (month name, count + total size, actions: `Subir` /
`Ver` / `ZIP` — ZIP+Ver disabled when empty), `ReceiptViewerModal.svelte` (thumb grid → S20
Lightbox full view + download + delete-with-confirm), shared upload progress.

**Upload flow.** `<input type="file" accept="image/*" multiple capture="environment">` per month box.
Per file, concurrency ≤3 (port `optimizeMany`'s cap): optimize with the receipt preset — **ONE WebP
main, maxWidth 1600, q≈0.8 + ONE WebP thumb, 320px, q≈0.7; never upscale** (D-018; the optimizer's
`scale = min(1, …)` guard) — upload main, upload thumb, then insert the `fin_receipts` row; **if the
row insert fails, `remove()` both uploaded objects** (rollback exactly as `gallery.js uploadPhoto`).
Progress `n de m` per month box; per-file failures toast and continue.

**Viewing (decision).** The bucket is private, so `<img src=publicUrl>` is impossible. Use
**authenticated `.download()` → `URL.createObjectURL`** (revoke on unmount / viewer close, small
per-session cache) rather than `createSignedUrl`: no bearer URLs leak into history/DOM/SW caches,
one mechanism serves thumbs, full view, and ZIP alike, and thumbs are tiny. Signed URLs' only
advantage (native HTTP caching) doesn't matter at this volume.

**ZIP.** `web/src/lib/zip.ts` wrapping **fflate** (npm, bundled): download each receipt blob
(already-compressed WebP → `zip` with `level 0`), entry names `MM/dd_<n>.webp` from `created_at`
(+ sanitized `original_name` when present), save via the ported `saveFile`. Filenames:
`recibos-<scope-name>-<year>-<MM>.zip` / `recibos-<scope-name>-<year>.zip`. Year ZIP streams
month-by-month with progress; warn above ~200 MB.

**States & copy.** Loading = skeleton grid (12 gray boxes); error = retry + human Spanish (never a raw
Postgres string); empty month = "Sin recibos". Retention notice under the year picker:
"Los recibos de un año se conservan hasta el 31 de enero del segundo año siguiente (ej. 2026 → se
eliminan el 1 de febrero de 2028)." All labels Spanish (`Recibos`, `Subir recibos`, `Ver`,
`Descargar mes (ZIP)`, `Descargar año (ZIP)`), identifiers English.

**A11y / motion.** Every icon-only control gets an accessible name ("Subir recibos de enero");
viewer modal = S16/S20 focus behavior; upload progress announced via `aria-live=polite`; no
progress animation under `prefers-reduced-motion` (S12's `reduced-motion.ts`).

## Acceptance criteria
- [ ] Migrations apply idempotently over the baseline (`supabase db reset` ×2 clean).
- [ ] Staging RLS negative checks recorded in the PR (per VERIFICATION.md — not unit tests):
      leader A of ministry M sees M's receipts uploaded by leader B (D-019 positive);
      a leader NOT in M gets zero M rows and a storage `download()` 4xx;
      a non-finance leader gets zero `church` rows; **finance gets zero `project` rows**;
      anon gets nothing.
- [ ] Upload → row+2 objects; forced row-insert failure leaves **zero** orphaned objects.
- [ ] Month ZIP and year ZIP open with correct entries; empty month's ZIP button disabled.
- [ ] `receipts-cleanup` on staging with seeded old rows deletes objects + rows for `year <= cutoff`
      and nothing newer; re-run is a no-op (`{deletedRows:0}`).
- [ ] Grid renders 4×3 desktop / 2-col mobile at 360px with no horizontal scroll (admin-ux §2/§4).
- [ ] No money hex literals (D-016), no new `prefers-color-scheme` blocks (D-017), no `{@html}` (D-005).

## Verification gate
- [ ] `docs/migration/VERIFICATION.md` — #1,2,3,4,6,7,8,12,13. #5 N/A (new feature — recorded here);
      #10/#11 N/A (no public surface, no cutover).

## How to resume if interrupted
- Branch: `migrate/S56b-treasury-recibos`. Done so far: <bullets>. Next action: <…>.
- Landmines: bucket must stay `public=false` — verify after every re-run of the migration;
  the `::uuid` casts in storage predicates are safe ONLY because INSERT enforces path shape —
  never loosen the shape checks; revoke objectURLs or the tab leaks memory; the cleanup fn must
  chunk `remove()` (≤100 paths); do not touch legacy files.

## On completion
- [ ] Update `MIGRATION.md`: S56b ✅ on the board, Current state, Next up; append any new G-xxx.
- [ ] Open PR; paste gate results + RLS check transcript; link this file.
