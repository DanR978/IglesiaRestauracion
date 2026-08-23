-- ============================================================================
-- 20260707000001_ministries_dev_tab.sql — make "Ministerios" a Desarrollador-only page
-- ============================================================================
-- Ministerios used to show for every admin (Desarrollador AND Administrador).
-- It is now a grantable SYSTEM tab (like Usuarios/Actividad/Configuración):
-- only presets whose allowed_tabs include 'ministries' show it. This grants it
-- to the built-in Desarrollador preset and its members; Administrador (empty
-- allowed_tabs) no longer sees it.
--
-- Run in the SQL Editor. Idempotent — the guards skip rows already updated.
-- ============================================================================

-- 1) Developer preset: add 'ministries' to allowed_tabs (deduped).
update public.role_presets
   set allowed_tabs = array(select distinct unnest(allowed_tabs || '{ministries}'::text[])),
       updated_at   = now()
 where slug = 'developer'
   and not (allowed_tabs @> '{ministries}');

-- 2) Accounts carrying the developer preset: mirror the grant onto their profile
--    (the page-permission RLS + nav read profiles.allowed_tabs).
update public.profiles p
   set allowed_tabs = array(select distinct unnest(p.allowed_tabs || '{ministries}'::text[]))
  from public.role_presets rp
 where p.preset_id = rp.id
   and rp.slug = 'developer'
   and not (p.allowed_tabs @> '{ministries}');
