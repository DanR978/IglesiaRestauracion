-- ============================================================================
-- 20260704_profile_self_service.sql — let a signed-in user edit their own
-- display name from the "Perfil y Configuración" page.
-- ============================================================================
-- Run in the Supabase SQL Editor.
--
--   • set_my_display_name(name) — the ONLY way a user changes their own name.
--     security definer, mirrors set_my_avatar (20260703_profile_avatar.sql):
--     it never needs a broad "update own profile" RLS policy (which would also
--     let a user change their own role / allowed_tabs). It touches display_name
--     of auth.uid() and nothing else, trims whitespace, and rejects blanks so a
--     user can never erase their own name into an empty string.
-- Idempotent.
-- ============================================================================

create or replace function public.set_my_display_name(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if length(v_name) < 2 then
    raise exception 'El nombre debe tener al menos 2 caracteres.';
  end if;
  if length(v_name) > 80 then
    v_name := left(v_name, 80);
  end if;
  update public.profiles set display_name = v_name where id = auth.uid();
  return v_name;
end;
$$;

grant execute on function public.set_my_display_name(text) to authenticated;
