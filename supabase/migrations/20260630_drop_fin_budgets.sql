-- ============================================================================
-- 20260630_drop_fin_budgets.sql — remove the Presupuestos feature
-- ============================================================================
-- Run AFTER the treasury-tab.js change that stops reading/writing fin_budgets
-- (Presupuestos sub-tab removed; Resumen no longer queries it). Recurrentes
-- covers the same need. Idempotent.
-- ============================================================================

-- 1) Drop the budgets table (no code reads it after the treasury change).
drop table if exists public.fin_budgets;

-- 2) OPTIONAL — purge the historical budget-as-expense rows. Presupuestos used
--    to inject a paid fin_expenses row per budget line (note 'auto:budget:%').
--    Those were allocations, not real spending, and could double-count
--    Recurrentes. DESTRUCTIVE — review, then uncomment. Preview first:
--      select occurred_on, payee, amount, note from public.fin_expenses
--       where note like 'auto:budget:%' order by occurred_on;
--
-- delete from public.fin_expenses where note like 'auto:budget:%';
