-- ============================================================================
-- 20260630000001_admin_notifications_delete.sql — allow admins to clear notifications
-- ============================================================================
-- The notification bell's "Limpiar" button deletes all admin_notifications rows.
-- The table was read/insert/update only, so DELETE was blocked. Idempotent.
-- ============================================================================

alter table public.admin_notifications enable row level security;

drop policy if exists admin_notifications_admin_delete on public.admin_notifications;
create policy admin_notifications_admin_delete
  on public.admin_notifications for delete to authenticated
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));
