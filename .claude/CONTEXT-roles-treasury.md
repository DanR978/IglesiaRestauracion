# Context — Roles/Access overhaul + Treasury plan (2026-06-30)

> Deep context for the role-preset/access work shipped on 2026-06-30 and the
> treasury work that is **planned but not yet implemented**. Read alongside
> [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), [CLAUDE.md](CLAUDE.md), [TASKS.md](TASKS.md).
> If something here disagrees with the code, the code wins — verify before acting.

---

## 0. ⚠️ Pending manual deploy steps (do these or the new UI errors)

Migrations are applied **by hand** to the hosted Supabase project (no runner). Apply in order, then redeploy the function:

1. `supabase/migrations/20260630_role_presets.sql` — role presets + `profiles.preset_id` + (re)adds `profiles.allowed_tabs`, seeds 4 presets, backfills existing admins → **Desarrollador**. Idempotent.
2. `supabase/migrations/20260630_public_feature_flags.sql` — lets the public site read `app_settings` key=`features` (needed for Modo mantenimiento).
3. `supabase/migrations/20260630_admin_notifications_delete.sql` — admin DELETE policy so the bell's "Limpiar" works.
4. `supabase/migrations/20260630_drop_role_ministry_check.sql` — drops the old "ministry_leader needs a ministry" CHECK constraints on `invitations`/`profiles` (the new model leaves `ministry_id` null). Without it: invites with a ministry_leader-based preset (e.g. Medios) fail with `invitations_role_ministry_chk` violation.
5. `supabase/migrations/20260630_page_permission_rls.sql` — **the page-permission RLS that was never applied.** Adds `has_tab()`/`has_any_tab()`/`is_finance()` helpers + additive `pp_*` policies so a `ministry_leader` can actually load the tables behind its granted tabs (special_events, event_registrations, events, calendar_events, gallery_albums/photos, discipleship_*) and a `treasurer` can load `fin_*`. Without it: a Medios user sees the tabs but Registraciones/Eventos/Galería never load (admins bypass RLS, so it only bit non-admins).
6b. `supabase/migrations/20260701_ministry_budget.sql` — **apply right AFTER fin_projects.** Makes media's project entries PRIVATE (treasurer's books = `project_id IS NULL`; owner sees only their own project rows) and lets a media user read its ministry's church allocations as budget income (`my_ministry_id()`). Owns all fin_income/fin_expenses policies (single source of truth). The treasurer→media link = `profiles.ministry_id` (a "Ministerio / equipo" picker shows for ministry_leader presets); recurring payment wizard now picks **Persona** (free text) or **Ministerio** (dropdown), and the ministry choice feeds that team's budget.

6. `supabase/migrations/20260701_fin_projects.sql` — **per-user project treasury.** `fin_projects` table + `project_id` on `fin_income`/`fin_expenses` + RLS so a ministry user manages only their own projects' entries; treasurer/admin (`is_finance()`) see all. Ministry users with the `treasury` grant get a scoped project tracker (Resumen + a tab per project, income/expense/balance); their entries roll into the treasurer's full books automatically.
7. **`supabase functions deploy admin-invite`** — the deployed function was stale; redeploy AFTER the migrations. Now also: `treasury` is a grantable ministry_leader tab (project treasury) and `past` was removed. Also note: this DB never had the old page-permissions migration, so `allowed_tabs` was missing on `profiles` (added in step 1) and on `invitations` (the function no longer writes it there).

> **To give Medios the project treasury:** edit the Medios preset (Roles y accesos) and check **"Tesorería (proyectos)"** — it propagates to its users. Their Tesorería tab renders the per-project tracker (`js/pages/admin/project-treasury.js`); the treasurer's tab is unchanged (full church books, now including project entries).

> **Treasury for a Medios user:** by design — Medios is `ministry_leader` and its preset doesn't grant the treasury tab. Finance is the **Tesorería** (treasurer) preset's job. A single preset has one base_role, so there's no "media + finance" account today; assign Tesorería for finance access.

8. `supabase/migrations/20260702_multi_ministry.sql` — **multi-ministry per user.** Adds `profiles.ministry_ids uuid[]` (a leader can hold several, e.g. "Youth & Kids Manager" → Youth + Kids), keeps `ministry_id` synced to the first for back-compat, adds `my_ministry_ids()`, and re-points the budget RLS (`pp_fin_expenses_budget` / `pp_fin_recurring_budget`) at `= any(my_ministry_ids())`. Backfills from the old single column. Idempotent.
9. `supabase/migrations/20260703_profile_avatar.sql` — **profile photos.** Adds `profiles.avatar_url`, a `set_my_avatar(url)` security-definer RPC (self-service, only touches your own avatar — no broad profile-update RLS), and a public `avatars` storage bucket (own-`<uid>/`-folder write, public read).
10. `supabase/migrations/20260704_ministry_budget_projects.sql` — **ministry budgets as project tabs.** Adds `fin_projects.ministry_id`. Each assigned ministry becomes its own tab in the leader's project treasury (`project-treasury.js` auto-creates/adopts a `fin_projects` row when the ministry has a budget). Income seeds read-only from the treasurer's allocations to that ministry (`project_id IS NULL` rows read via `pp_fin_expenses_budget`); gastos are the leader's own project entries. No RLS change (owner-scoped). Resumen shows Ministerios + Proyectos sections.

> **admin-invite redeploy (step 7) now also:** accepts `ministry_ids` (array) on invite/set-role (falls back to single `ministry_id`), writes both columns, and returns `ministry_ids` + `avatar_url` in `list`. The invite/edit modal uses a checkbox dropdown for ministries; the signed-in user's identity moved from the header to a photo circle at the bottom of the sidebar (Mi cuenta → change/remove photo).

Apply migrations **before** redeploying the function (the function queries `role_presets`).

---

## 1. Access model (shipped)

Users are **invite-only** via the `admin-invite` Edge Function. Access is assigned by picking a **preset** (no more per-user ministry + manual page checklist). A preset = `name + base_role + allowed_tabs + icon + color`. Assigning copies `role` + `allowed_tabs` onto the profile; **editing a preset propagates** to every member (Edge Function does the propagation).

Source of truth for enforcement stays `profiles.role` + `profiles.allowed_tabs` (RLS reads them). `profiles.preset_id` is a label + propagation key. RLS was **not** changed by this work.

### Roles & the 4 built-in presets
DB role enum: `admin | ministry_leader | treasurer`. Two **admin tiers**, both DB-role `admin` (so data/RLS access is identical) — the difference is purely which tabs show:

| Preset | base_role | allowed_tabs | Sees |
|--------|-----------|--------------|------|
| **Desarrollador** | admin | `{users,activity,settings}` | everything |
| **Administrador** | admin | `{}` | everything **except** Usuarios, Actividad, Configuración |
| **Tesorería** | treasurer | `{}` | finance only |
| **Medios** | ministry_leader | `{analytics,upcoming,past,calendario,special-events,galeria}` | those pages |

`allowed_tabs` semantics **depend on base_role** (mirrored in `admin-invite/index.ts` and `role-presets.js`):
- `ministry_leader` → which of the 7 **operational** tabs show (`analytics, upcoming, past, calendario, special-events, discipulado, galeria`).
- `admin` → which of the 3 **system** tabs show on top of always-on admin pages (`users, activity, settings`). Desarrollador = all 3; Administrador = none.
- `treasurer` → empty (finance gated by role).

`auth.js applyTabAccess()` (admin branch) inline-hides the 3 system tabs for admins who lack them. The "last developer" (admin with `users`) is guarded against removal in the Edge Function (`developerIds()`), so you can't lock everyone out of user management.

**Note:** the Developer/Administrador split is currently **UI-enforced** — the Edge Function caller check is still `role==='admin'` (both tiers can call it). Left this way to avoid lockout risk; can be hardened to require a developer later.

### Key files (access)
- `js/pages/admin/role-presets.js` — "Roles y accesos" sub-tab UI (preset CRUD, **icon picker** `PRESET_ICONS`, `OPERATIONAL_TABS`/`ADMIN_TABS`). Exports `getPresets`, `fetchPresets`, `loadRolePresets`, `initRolePresets`.
- `js/pages/admin/admin-fn.js` — shared `callAdmin()` Edge-Function helper (moved out of users.js).
- `js/pages/admin/users.js` — invite/edit modal now picks a preset; rows show preset badge.
- `supabase/functions/admin-invite/index.ts` — preset CRUD (`list-presets`/`save-preset`/`delete-preset`, with empty-table **auto-seed**), preset-driven `invite`/`set-role`, developer guards.
- `admin/index.html` — `#tab-users` has sub-tabs **Cuentas | Roles y accesos**; preset modal; invite modal preset `<select>`.
- ⚠️ **Naming gotcha:** `js/pages/admin/presets.js` is the **event calendar "smart presets"** (`calendar_presets` table), NOT roles. Role presets live in **`role-presets.js`**.

### Ministry assignment was REMOVED from user creation
Users are no longer scoped to a ministry (`profiles.ministry_id` is set to null on invite/set-role). The `ministries` table still exists for **events**. **This matters for the treasury plan below** — per-ministry budgeting needs `profiles.ministry_id` reintroduced for ministry_leaders.

---

## 2. Other shipped changes (2026-06-30)

- **Removed the "Instalar app" PWA button** (`js/lib/pwa.js`) — offline caching kept; only the promoted install FAB removed.
- **Palette toned down.** Public: rails + soft teal/orange surface tints neutralized in `css/tokens/colors.css`. Admin: a scoped neutral/slate palette in `css/pages/admin/palette.css` (drops gold/orange) + neutralized role/preset chips and checklist accents in `css/pages/admin/users.css`. Accent tokens (buttons/links/logo) untouched on the public site.
- **Maintenance mode now works.** `js/lib/maintenance.js` (lazy-loaded from `js/include.js`) reads `app_settings.features.maintenance` (now publicly readable) and shows a full-screen overlay to non-staff; signed-in staff pass through. Previously the public site never read the flag, so it did nothing. All the `features.*` flags were/are admin-only-cosmetic except this one now.
- **Notifications inbox** (`js/pages/admin/notifications.js`) is now **paginated** (batches of 20 + "Cargar más"), has a **"Limpiar"** clear-all button (needs the delete-policy migration), and the unread badge uses an accurate `count` query.

---

## 3. Build pipeline reality (important)

- `css/style.css` and `css/admin.css` are **build artifacts**. Sources: `css/{tokens,base,layout,components,sections,pages,utilities}/` (style.css) and `css/pages/admin/*` (admin.css).
- `npm run build:css` == `bash scripts/build.sh`. The **CI** (`.github/workflows/build-css.yml`) runs it on push and commits the result, so **sources are canonical** — the CI normalizes the bundles.
- **Gotcha:** running `build.sh` locally can reorder the bundles vs the committed copy (environment-specific glob sort) → a huge spurious diff. Don't commit a full local rebuild. The 2026-06-30 work edited the **sources** AND surgically patched the **bundles** (append at end so it wins) for immediate local preview; the next CI build regenerates the bundles cleanly from sources. PROJECT_CONTEXT.md's "never hand-edit the bundles" rule still holds for normal work — edit sources and let CI build.
- Other generated artifacts: page `<head>`s (`scripts/build-heads.mjs`), inlined `src/` partials (`scripts/inline-includes.mjs`), `sitemap.xml`, `js/lib/config.js`.

---

## 4. TREASURY — system map (NOT yet changed; planned)

Entry: `js/pages/admin/treasury-tab.js` — `loadTreasury()` (≈L82), `render()` (≈L102-111) dispatches by `sub` key. Markup `admin/index.html:633-643` (`#treasuryBody`, `#trezSubnav`). Report builder: `js/pages/admin/report-builder.js`. CSS `css/pages/admin/treasury.css`.

Sub-sections (SUBS ≈L48-58): `resumen` (Resumen), `income` (Ingresos), `expenses` (Gastos), `recurring` (Recurrentes), `budgets` (Presupuestos), `payables` (Por pagar), `reports` (Reportes), `notes` (Notas), `config` (Configurar).

Tables (all `fin_*`):
- **fin_income** — `amount, occurred_on, source, fund, note, created_by` (no ministry_id yet).
- **fin_expenses** — `amount, occurred_on, ministry_id, label, payee, category, status, note, created_by`. **Single source of truth for ALL spending views** (Gastos/Resumen/Reporte). `note` carries idempotency tags (`auto:recurring:…`, `auto:budget:…`); `cleanNote()` (≈L28) strips `auto:` tags from display.
- **fin_budgets** — `line_key (ministry uuid|'pastor'), period (YYYY-MM), amount, ministry_id, label`; upsert key `(line_key, period)`.
- **fin_recurring** — `payee, amount, ministry_id, label, frequency, day_of_month, category, active, note, …`.
- **fin_payables** — `creditor, amount, due_on, ministry_id, status ('open'|'paid'), paid_at, note, created_by`.
- **fin_notes** — `body, ministry_id, pinned, …`. Config masters: `fin_funds`, `fin_income_categories`, `fin_expense_categories` (church-wide).

Allocation encoding (≈L34-46): `''` → general (ministry_id null); a ministry UUID → that ministry; `'pastor'` → ministry_id null + label 'Pastor'.

**Presupuestos vs Recurrentes overlap** — both inject rows into `fin_expenses` so spending views pick them up. Presupuestos (PUSH, ≈L407-421) upserts `fin_budgets` then inserts one `auto:budget:<key>:<month>` paid expense. Recurrentes (PULL, `ensureRecurringForMonth` ≈L354-376) inserts `auto:recurring:<id>:<month>` expenses for active monthly items. If both cover the same money → **double-counted**. Only consumer of `fin_budgets` is the "Presupuesto por línea" card in Resumen (≈L118,129-133,148-158); Reporte never reads it.

---

## 5. TREASURY — the 3 requested tasks

> **Status (2026-06-30):** §5a and §5b are **IMPLEMENTED** in code. §5c (per-ministry) is still **planned**.
> Pending DB step for §5b: apply `supabase/migrations/20260630_drop_fin_budgets.sql` **after** the code deploys
> (it drops `fin_budgets`; the historical `auto:budget:%` expense purge is left commented for the treasurer to decide).
> §5a shipped as written below, plus a `bindList` `onDelete` hook so deleting a paid payable also removes its mirrored `auto:payable:<id>` gasto.

### 5a. BUG — "Por pagar" marked paid doesn't appear in Reporte/Resumen/Gastos  ✅ DONE
Root cause: `markPaid()` (`treasury-tab.js:446-449`) only updates `fin_payables` (status→paid, paid_at); it never writes `fin_expenses`, which is the only table the spending views read. So a paid payable disappears entirely.

Fix: extend `markPaid()` to also insert a tagged expense (idempotent, hidden by `cleanNote`), mirroring the `auto:budget` pattern:
```js
async function markPaid(id) {
  const paid_at = new Date().toISOString();
  const { error } = await sb.from('fin_payables').update({ status: 'paid', paid_at }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  const { data: p } = await sb.from('fin_payables').select('*').eq('id', id).single();
  if (p) {
    const tag = `auto:payable:${id}`;
    await sb.from('fin_expenses').delete().eq('note', tag);            // idempotent re-mark
    await sb.from('fin_expenses').insert({
      occurred_on: (p.paid_at || paid_at).split('T')[0],
      ministry_id: p.ministry_id || null, label: null,
      payee: p.creditor, category: 'Cuenta pagada', amount: p.amount,
      status: 'paid', note: tag, created_by: currentUser?.id || null,
    });
  }
  toast('Marcado como pagado', 'success'); render();
}
```
Caveat: if an "un-mark paid" UI is ever added, it must delete the `auto:payable:<id>` expense.

### 5b. Remove "Presupuestos" (keep Recurrentes) — they're redundant  ✅ DONE
All in `treasury-tab.js`: remove the `budgets` SUBS entry (≈L53), the `budgets: renderBudgets` dispatch (≈L108-110), delete `renderBudgets()` (≈L378-425). In `renderResumen()` (≈L114-160): drop the `fin_budgets` query (≈L118), remove `budByKey`/`budget:` (≈L129-133), and rework the "Presupuesto por línea" card (≈L148-158) → recommended: rename to **"Gastos por línea · {mes}"** showing only `spent` (keep `spentByMin`/`spentPastor`, drop budget bar/remaining). CSS: drop `.trez-budset*` (and `.trez-bud*` if the card is removed). DB cleanup (after code ships): `delete from fin_expenses where note like 'auto:budget:%';` then `drop table if exists fin_budgets;` — **confirm with the treasurer** whether to purge historical budget-as-expense rows first (they're double-counted in history).

### 5c. Per-ministry budgeting (treasurer inherits all)  ⏳ PLANNED (not started)
Principle: reuse the existing `ministry_id` already on `fin_expenses/fin_recurring/fin_payables/fin_notes`. Do **not** create one table per ministry. Add `ministry_id` to `fin_income` (missing). Scope with RLS keyed on viewer's `profiles.ministry_id`; treasurer/admin "inherit all."

- **BLOCKER:** ministry_leaders currently have **no `ministry_id`** (this session removed ministry assignment). Per-ministry budgeting requires reintroducing a ministry picker in the invite/edit flow (pass `ministry_id` through `admin-invite/index.ts`, persist on profile, add a control in the **role-presets/users UI** — note: the brief said `presets.js` but the correct file is `role-presets.js`/users.js) and backfilling existing leaders.
- RLS: add SELECT (and matching INSERT/UPDATE/DELETE `with check`) policies on each `fin_*` table: `is_admin() OR current_role_name()='treasurer' OR ministry_id = my_ministry_id()`. Helpers `is_admin()`, `current_role_name()`, `my_ministry_id()` exist (see `supabase/rls-audit.sql:61`). **Decision:** do ministry_leaders also see `ministry_id IS NULL` (general) rows? For pure isolation, omit that clause.
- Page access (recommend **Option B**): grant `treasury` in a ministry-leader preset's `allowed_tabs`, then make treasury queries ministry-aware (`if (myMin) q = q.eq('ministry_id', myMin)`) across `renderResumen/renderExpenses/renderIncome/renderPayables/renderRecurring` + `report-builder.js`, and hide admin-only sub-tabs (`config`, maybe `recurring`) for leaders. Verify `auth.js:272-322` finance-tab gating actually shows the tab for a granted leader (they set no `body.is-finance`; the explicit `allowed_tabs` display loop should win — confirm).
- Deploy order: ship 5a + 5b first (low-risk) → add `fin_income.ministry_id` → reintroduce `profiles.ministry_id` + invite picker + **backfill** → add the ministry-budget preset → apply RLS **last** (after frontend filters exist, or scoped users see empty screens).

---

## 6. Where the full investigations live
Two background workflows produced the detail above:
- "create-developer-user-query" — the verified SQL to create/promote a developer user (Dashboard add-user + promote `update public.profiles set role='admin', allowed_tabs='{users,activity,settings}', preset_id=(select id from role_presets where slug='developer'), ministry_id=null where id=(select id from auth.users where email=lower('…'))`).
- "treasury-investigation" — the treasury map / bug / removal / per-ministry brief summarized in §4–5.
