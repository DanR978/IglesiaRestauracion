-- ============================================================================
-- 20260630000005_public_feature_flags.sql — let the public site read feature flags
-- ============================================================================
-- The admin "Configuración" tab stores site-wide toggles (Modo mantenimiento,
-- Discipulado, …) in app_settings under key='features'. The table was admin-only
-- via RLS, so the public site could never read them — which is why Modo
-- mantenimiento did nothing. These are non-sensitive booleans; expose just the
-- 'features' row read-only. Writes stay admin-only. Idempotent.
-- ============================================================================

alter table public.app_settings enable row level security;

drop policy if exists app_settings_public_features on public.app_settings;
create policy app_settings_public_features
  on public.app_settings for select to anon, authenticated
  using (key = 'features');
