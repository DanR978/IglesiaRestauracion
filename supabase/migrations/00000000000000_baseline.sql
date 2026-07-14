

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."audit_capture"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rec   jsonb;
  v_id  text;
  v_lbl text;
  v_act uuid := auth.uid();
  v_nm  text;
begin
  if (tg_op = 'DELETE') then rec := to_jsonb(old); else rec := to_jsonb(new); end if;

  v_id  := coalesce(rec->>'id', '');
  v_lbl := coalesce(rec->>'name', rec->>'title', rec->>'full_name',
                    rec->>'display_name', rec->>'subject', rec->>'slug', '');

  if v_act is not null then
    select display_name into v_nm from public.profiles where id = v_act;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, label)
    values (v_act, coalesce(v_nm, 'Sistema'), tg_op, tg_table_name, v_id, v_lbl);

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end $$;


ALTER FUNCTION "public"."audit_capture"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_design"("d" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.owns_design(d) or exists(select 1 from public.design_shares where design_id=d and user_id=auth.uid());
$$;


ALTER FUNCTION "public"."can_edit_design"("d" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_finance"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_admin() or public.is_treasurer()
$$;


ALTER FUNCTION "public"."can_finance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_join_design_topic"("topic" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare did uuid;
begin
  if topic !~ '^design:[0-9a-fA-F-]{36}$' then return false; end if;
  did := substring(topic from 8)::uuid;
  return public.can_edit_design(did);
exception when others then return false;
end $_$;


ALTER FUNCTION "public"."can_join_design_topic"("topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."designs_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at = now(); return new; end $$;


ALTER FUNCTION "public"."designs_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."discipleship_auto_place"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_group   public.discipleship_groups;
  v_filled  int;
begin
  if new.target_group_id is null then return null; end if;

  select * into v_group
    from public.discipleship_groups
    where id = new.target_group_id;
  if v_group.id is null then return null; end if;

  -- Only auto-place into 'open' groups (active = already running, manual placement)
  if v_group.status <> 'open' then return null; end if;

  select coalesce(member_count, 0) into v_filled
    from public.discipleship_groups
    where id = new.target_group_id;

  -- Capacity check (capacity is nullable; null = unlimited)
  if v_group.capacity is not null and v_filled >= v_group.capacity then
    return null;
  end if;

  -- Insert the member (silently skip if same email already in group)
  begin
    insert into public.discipleship_members (group_id, full_name, email, phone, interest_id)
      values (new.target_group_id, new.full_name, new.email, new.phone, new.id);
  exception when unique_violation then
    -- Already a member by email; that's fine
    null;
  end;

  -- Mark interest as placed
  update public.discipleship_interests
    set status = 'placed',
        assigned_group_id = new.target_group_id,
        contacted_at = now()
    where id = new.id;

  return null;
end $$;


ALTER FUNCTION "public"."discipleship_auto_place"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."discipleship_recount_members"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (tg_op = 'INSERT') then
    update public.discipleship_groups
      set member_count = (select count(*) from public.discipleship_members
                           where group_id = new.group_id)
      where id = new.group_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.discipleship_groups
      set member_count = (select count(*) from public.discipleship_members
                           where group_id = old.group_id)
      where id = old.group_id;
    return old;
  elsif (tg_op = 'UPDATE') then
    if (new.group_id is distinct from old.group_id) then
      update public.discipleship_groups
        set member_count = (select count(*) from public.discipleship_members
                             where group_id = old.group_id)
        where id = old.group_id;
      update public.discipleship_groups
        set member_count = (select count(*) from public.discipleship_members
                             where group_id = new.group_id)
        where id = new.group_id;
    end if;
    return new;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."discipleship_recount_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_recount_photos"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (tg_op = 'INSERT') then
    update public.gallery_albums
      set photo_count = (select count(*) from public.gallery_photos where album_id = new.album_id)
      where id = new.album_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.gallery_albums
      set photo_count = (select count(*) from public.gallery_photos where album_id = old.album_id)
      where id = old.album_id;
    return old;
  elsif (tg_op = 'UPDATE') then
    if (new.album_id is distinct from old.album_id) then
      update public.gallery_albums
        set photo_count = (select count(*) from public.gallery_photos where album_id = old.album_id)
        where id = old.album_id;
      update public.gallery_albums
        set photo_count = (select count(*) from public.gallery_photos where album_id = new.album_id)
        where id = new.album_id;
    end if;
    return new;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."gallery_recount_photos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inv public.invitations;
begin
  -- Most-recent valid (pending, unexpired) invitation for this email
  select * into inv
    from public.invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
    order by created_at desc
    limit 1;

  if inv.id is not null then
    -- Invited account → profile gets the invited role + ministry. The invitee
    -- never controls these values; the invitation row is the source of truth.
    insert into public.profiles (id, display_name, role, ministry_id)
      values (
        new.id,
        coalesce(inv.display_name,
                 new.raw_user_meta_data->>'display_name',
                 split_part(new.email, '@', 1)),
        inv.role,
        inv.ministry_id
      )
      on conflict (id) do update
        set role         = excluded.role,
            ministry_id  = excluded.ministry_id,
            display_name = excluded.display_name;

    update public.invitations
      set status = 'accepted', accepted_at = now()
      where id = inv.id;
  else
    -- No invitation. Only the original bootstrap admin legitimately has no
    -- invitation, and they already have a profile (-> do nothing). Anyone else
    -- lands powerless: ministry_leader + null ministry = RLS denies all writes.
    insert into public.profiles (id, display_name, role, ministry_id)
      values (
        new.id,
        coalesce(new.raw_user_meta_data->>'display_name',
                 split_part(new.email, '@', 1)),
        'ministry_leader',
        null
      )
      on conflict (id) do nothing;
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_any_tab"("tabs" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.allowed_tabs && tabs)
  );
$$;


ALTER FUNCTION "public"."has_any_tab"("tabs" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_tab"("tab" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.allowed_tabs @> array[tab])
  );
$$;


ALTER FUNCTION "public"."has_tab"("tab" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_aal2"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$ select true $$;


ALTER FUNCTION "public"."is_aal2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_finance"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'treasurer'));
$$;


ALTER FUNCTION "public"."is_finance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_treasurer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'treasurer')
$$;


ALTER FUNCTION "public"."is_treasurer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_designer_users"() RETURNS TABLE("id" "uuid", "display_name" "text", "avatar_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      select p.id, p.display_name, p.avatar_url from public.profiles p
      where auth.uid() is not null and (p.role='admin' or p.allowed_tabs @> array['special-events']) and p.id <> auth.uid()
    $$;


ALTER FUNCTION "public"."list_designer_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_ministry_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select (public.my_ministry_ids())[1];
$$;


ALTER FUNCTION "public"."my_ministry_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_ministry_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
           when cardinality(coalesce(ministry_ids, '{}')) > 0 then ministry_ids
           when ministry_id is not null then array[ministry_id]
           else '{}'::uuid[]
         end
    from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."my_ministry_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_interest"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.admin_notifications (type, title, body, link, entity, entity_id)
    values (
      'discipleship_interest',
      'Nuevo interesado en discipulado',
      coalesce(new.full_name, 'Alguien') ||
        case when new.target_group_id is not null then ' — quiere unirse a un grupo'
             else ' — interés general' end,
      'discipulado',
      'discipleship_interests',
      new.id::text
    );
  return new;
end $$;


ALTER FUNCTION "public"."notify_new_interest"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_registration"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_title text;
begin
  select title into v_title from public.special_events where id = new.event_id;
  insert into public.admin_notifications (type, title, body, link, entity, entity_id)
    values (
      'event_registration',
      'Nueva inscripción',
      coalesce(new.first_name || ' ' || new.last_name, 'Alguien') ||
        coalesce(' — ' || v_title, ''),
      'special-events',
      'event_registrations',
      new.id::text
    );
  return new;
end $$;


ALTER FUNCTION "public"."notify_new_registration"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_design"("d" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(select 1 from public.designs where id=d and created_by=auth.uid());
$$;


ALTER FUNCTION "public"."owns_design"("d" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_avatar"("p_url" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles set avatar_url = nullif(btrim(coalesce(p_url, '')), '') where id = auth.uid();
$$;


ALTER FUNCTION "public"."set_my_avatar"("p_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_display_name"("p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_my_display_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at = now(); return new; end $$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "entity" "text",
    "entity_id" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text",
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "text",
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "date" "date" NOT NULL,
    "time" "text",
    "location" "text",
    "description" "text",
    "category" "text" DEFAULT 'otro'::"text",
    "cancelled" boolean DEFAULT false,
    "ministry_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "calendar_events_category_check" CHECK (("category" = ANY (ARRAY['servicio'::"text", 'estudio'::"text", 'oracion'::"text", 'evangelizacion'::"text", 'especial'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "time" "text",
    "location" "text",
    "pattern_type" "text" NOT NULL,
    "day_of_week" integer NOT NULL,
    "nth_week" integer,
    "sort_order" integer DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calendar_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."design_shares" (
    "design_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."design_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."designs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT 'Sin título'::"text" NOT NULL,
    "kind" "text" DEFAULT 'flyer'::"text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "doc" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "thumbnail_url" "text",
    "event_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."designs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discipleship_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text",
    "name" "text" NOT NULL,
    "level" smallint NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "capacity" smallint,
    "starts_on" "date",
    "ends_on" "date",
    "meeting_day" "text",
    "meeting_time" time without time zone,
    "location_name" "text",
    "location_address" "text",
    "leader_name" "text",
    "leader_id" "uuid",
    "notes" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "member_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "discipleship_groups_capacity_check" CHECK ((("capacity" IS NULL) OR ("capacity" > 0))),
    CONSTRAINT "discipleship_groups_level_check" CHECK ((("level" >= 1) AND ("level" <= 5))),
    CONSTRAINT "discipleship_groups_meeting_day_check" CHECK ((("meeting_day" IS NULL) OR ("meeting_day" = ANY (ARRAY['domingo'::"text", 'lunes'::"text", 'martes'::"text", 'miércoles'::"text", 'jueves'::"text", 'viernes'::"text", 'sábado'::"text"])))),
    CONSTRAINT "discipleship_groups_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."discipleship_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discipleship_interests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "preferred_day" "text",
    "preferred_time" "text",
    "experience_level" smallint,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "assigned_group_id" "uuid",
    "source" "text" DEFAULT 'public_form'::"text" NOT NULL,
    "contacted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_group_id" "uuid",
    "can_host" boolean,
    "home_address" "text",
    "has_transportation" boolean,
    "bringing_family" "text",
    "age_range" "text",
    "gender" "text",
    CONSTRAINT "discipleship_interests_age_range_check" CHECK ((("age_range" IS NULL) OR ("age_range" = ANY (ARRAY['teen'::"text", 'young-adult'::"text", 'adult'::"text", 'senior'::"text"])))),
    CONSTRAINT "discipleship_interests_experience_level_check" CHECK ((("experience_level" IS NULL) OR (("experience_level" >= 1) AND ("experience_level" <= 5)))),
    CONSTRAINT "discipleship_interests_gender_check" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['masculino'::"text", 'femenino'::"text", 'no-especifica'::"text"])))),
    CONSTRAINT "discipleship_interests_preferred_day_check" CHECK ((("preferred_day" IS NULL) OR ("preferred_day" = ANY (ARRAY['domingo'::"text", 'lunes'::"text", 'martes'::"text", 'miércoles'::"text", 'jueves'::"text", 'viernes'::"text", 'sábado'::"text", 'cualquiera'::"text"])))),
    CONSTRAINT "discipleship_interests_preferred_time_check" CHECK ((("preferred_time" IS NULL) OR ("preferred_time" = ANY (ARRAY['mañana'::"text", 'tarde'::"text", 'noche'::"text", 'cualquiera'::"text"])))),
    CONSTRAINT "discipleship_interests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'placed'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."discipleship_interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discipleship_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "interest_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discipleship_members_role_check" CHECK (("role" = ANY (ARRAY['leader'::"text", 'co-leader'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."discipleship_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discipleship_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "subject" "text",
    "body" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_by" "uuid"
);


ALTER TABLE "public"."discipleship_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "age" integer NOT NULL,
    "sex" "text",
    "contact_name" "text" NOT NULL,
    "relationship" "text" NOT NULL,
    "contact_phone" "text" NOT NULL,
    "contact_email" "text",
    "allergies" "text",
    "medical_conditions" "text",
    "notes" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "registration_group_id" "uuid",
    "signature_image" "text",
    "signature_name" "text",
    "waiver_signed_at" timestamp with time zone,
    "waiver_version" "text",
    "parent_name" "text",
    "parent_relationship" "text",
    "parent_phone" "text",
    "parent_email" "text",
    CONSTRAINT "event_registrations_age" CHECK ((("age" >= 0) AND ("age" <= 120))),
    CONSTRAINT "event_registrations_len" CHECK ((("char_length"("first_name") <= 120) AND ("char_length"("last_name") <= 120) AND ("char_length"(COALESCE("sex", ''::"text")) <= 40) AND ("char_length"("contact_name") <= 160) AND ("char_length"("relationship") <= 80) AND ("char_length"("contact_phone") <= 40) AND ("char_length"(COALESCE("contact_email", ''::"text")) <= 160) AND ("char_length"(COALESCE("allergies", ''::"text")) <= 2000) AND ("char_length"(COALESCE("medical_conditions", ''::"text")) <= 2000) AND ("char_length"(COALESCE("notes", ''::"text")) <= 2000))),
    CONSTRAINT "event_registrations_waiver_len" CHECK ((("char_length"(COALESCE("signature_image", ''::"text")) <= 262144) AND ("char_length"(COALESCE("signature_name", ''::"text")) <= 160) AND ("char_length"(COALESCE("waiver_version", ''::"text")) <= 40)))
);


ALTER TABLE "public"."event_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "tag" "text",
    "location" "text",
    "image_url" "text",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "description" "text",
    "organizer_name" "text",
    "organizer_email" "text",
    "ministry_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON TABLE "public"."events" IS 'Upcoming Events in the next two months';



CREATE TABLE IF NOT EXISTS "public"."fin_expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "group_name" "text",
    "needs_note" boolean DEFAULT false NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fin_expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "occurred_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "ministry_id" "uuid",
    "payee" "text",
    "category" "text",
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "label" "text",
    "fund_id" "uuid",
    "category_id" "uuid",
    "project_id" "uuid",
    CONSTRAINT "fin_expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "fin_expenses_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."fin_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_funds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "restricted" boolean DEFAULT false NOT NULL,
    "opening_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fin_funds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_income" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "occurred_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "source" "text" NOT NULL,
    "fund" "text",
    "amount" numeric(12,2) NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fund_id" "uuid",
    "category_id" "uuid",
    "project_id" "uuid",
    CONSTRAINT "fin_income_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."fin_income" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_income_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fin_income_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "body" "text" NOT NULL,
    "ministry_id" "uuid",
    "pinned" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fin_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_payables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creditor" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "due_on" "date",
    "ministry_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "fin_payables_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "fin_payables_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."fin_payables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "icon" "text",
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ministry_id" "uuid"
);


ALTER TABLE "public"."fin_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fin_recurring" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payee" "text" NOT NULL,
    "ministry_id" "uuid",
    "category" "text",
    "amount" numeric(12,2) NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "day_of_month" smallint,
    "active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "label" "text",
    CONSTRAINT "fin_recurring_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "fin_recurring_day_of_month_check" CHECK ((("day_of_month" IS NULL) OR (("day_of_month" >= 1) AND ("day_of_month" <= 31)))),
    CONSTRAINT "fin_recurring_frequency_check" CHECK (("frequency" = ANY (ARRAY['monthly'::"text", 'weekly'::"text", 'yearly'::"text"])))
);


ALTER TABLE "public"."fin_recurring" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_albums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "year" smallint NOT NULL,
    "event_date" "date",
    "event_type" "text",
    "cover_url" "text",
    "cover_photo_id" "uuid",
    "is_featured" boolean DEFAULT false NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "photo_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gallery_albums_year_check" CHECK ((("year" >= 2000) AND ("year" <= 2100)))
);


ALTER TABLE "public"."gallery_albums" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "album_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "webp_url" "text",
    "thumbnail_url" "text",
    "caption" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "width" integer,
    "height" integer,
    "mime_type" "text",
    "file_size" integer,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gallery_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'ministry_leader'::"text" NOT NULL,
    "ministry_id" "uuid",
    "display_name" "text",
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'ministry_leader'::"text", 'treasurer'::"text"]))),
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ministries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#345a65'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ministries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_dispatch_log" (
    "kind" "text" NOT NULL,
    "ref" "text" NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."newsletter_dispatch_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."newsletter_dispatch_log" IS 'Idempotency ledger for scheduled newsletter sends (monthly digest, day-before reminders).';



CREATE TABLE IF NOT EXISTS "public"."newsletter_subscribers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "source" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unsubscribe_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unsubscribed_at" timestamp with time zone
);


ALTER TABLE "public"."newsletter_subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "text" DEFAULT 'ministry_leader'::"text" NOT NULL,
    "ministry_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "preset_id" "uuid",
    "allowed_tabs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "ministry_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "avatar_url" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'ministry_leader'::"text", 'treasurer'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "base_role" "text" NOT NULL,
    "allowed_tabs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "icon" "text",
    "color" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "role_presets_base_role_check" CHECK (("base_role" = ANY (ARRAY['admin'::"text", 'ministry_leader'::"text", 'treasurer'::"text"])))
);


ALTER TABLE "public"."role_presets" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_presets" IS 'Reusable access presets. base_role + allowed_tabs are copied onto profiles when assigned.';



CREATE TABLE IF NOT EXISTS "public"."special_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "image_url" "text",
    "description" "text",
    "information" "text",
    "event_at" timestamp with time zone,
    "location" "text",
    "registration_open" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "age_groups" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "special_events_age_groups_is_array" CHECK (("jsonb_typeof"("age_groups") = 'array'::"text")),
    CONSTRAINT "special_events_status_chk" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."special_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "Events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_presets"
    ADD CONSTRAINT "calendar_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."design_shares"
    ADD CONSTRAINT "design_shares_pkey" PRIMARY KEY ("design_id", "user_id");



ALTER TABLE ONLY "public"."designs"
    ADD CONSTRAINT "designs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discipleship_groups"
    ADD CONSTRAINT "discipleship_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discipleship_groups"
    ADD CONSTRAINT "discipleship_groups_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."discipleship_interests"
    ADD CONSTRAINT "discipleship_interests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discipleship_members"
    ADD CONSTRAINT "discipleship_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discipleship_messages"
    ADD CONSTRAINT "discipleship_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_expense_categories"
    ADD CONSTRAINT "fin_expense_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."fin_expense_categories"
    ADD CONSTRAINT "fin_expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_expenses"
    ADD CONSTRAINT "fin_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_funds"
    ADD CONSTRAINT "fin_funds_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."fin_funds"
    ADD CONSTRAINT "fin_funds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_income_categories"
    ADD CONSTRAINT "fin_income_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."fin_income_categories"
    ADD CONSTRAINT "fin_income_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_income"
    ADD CONSTRAINT "fin_income_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_notes"
    ADD CONSTRAINT "fin_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_payables"
    ADD CONSTRAINT "fin_payables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_projects"
    ADD CONSTRAINT "fin_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fin_recurring"
    ADD CONSTRAINT "fin_recurring_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_albums"
    ADD CONSTRAINT "gallery_albums_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_albums"
    ADD CONSTRAINT "gallery_albums_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."gallery_photos"
    ADD CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ministries"
    ADD CONSTRAINT "ministries_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."ministries"
    ADD CONSTRAINT "ministries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_dispatch_log"
    ADD CONSTRAINT "newsletter_dispatch_log_pkey" PRIMARY KEY ("kind", "ref");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_presets"
    ADD CONSTRAINT "role_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_presets"
    ADD CONSTRAINT "role_presets_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."special_events"
    ADD CONSTRAINT "special_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."special_events"
    ADD CONSTRAINT "special_events_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "unique_event_time" UNIQUE ("starts_at");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "unique_title_date" UNIQUE ("title", "date");



CREATE INDEX "design_shares_user_idx" ON "public"."design_shares" USING "btree" ("user_id");



CREATE INDEX "designs_created_by_idx" ON "public"."designs" USING "btree" ("created_by");



CREATE INDEX "designs_event_id_idx" ON "public"."designs" USING "btree" ("event_id");



CREATE INDEX "fin_expenses_project_idx" ON "public"."fin_expenses" USING "btree" ("project_id");



CREATE INDEX "fin_income_project_idx" ON "public"."fin_income" USING "btree" ("project_id");



CREATE INDEX "fin_projects_ministry_idx" ON "public"."fin_projects" USING "btree" ("ministry_id");



CREATE INDEX "fin_projects_owner_idx" ON "public"."fin_projects" USING "btree" ("owner_id");



CREATE INDEX "idx_audit_created" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_entity" ON "public"."audit_log" USING "btree" ("entity");



CREATE INDEX "idx_cal_events_cancelled" ON "public"."calendar_events" USING "btree" ("cancelled");



CREATE INDEX "idx_cal_events_date" ON "public"."calendar_events" USING "btree" ("date");



CREATE INDEX "idx_cal_events_ministry" ON "public"."calendar_events" USING "btree" ("ministry_id");



CREATE INDEX "idx_dgroups_level" ON "public"."discipleship_groups" USING "btree" ("level");



CREATE INDEX "idx_dgroups_starts" ON "public"."discipleship_groups" USING "btree" ("starts_on");



CREATE INDEX "idx_dgroups_status" ON "public"."discipleship_groups" USING "btree" ("status");



CREATE INDEX "idx_dinterests_gender" ON "public"."discipleship_interests" USING "btree" ("gender");



CREATE INDEX "idx_dinterests_group" ON "public"."discipleship_interests" USING "btree" ("assigned_group_id");



CREATE INDEX "idx_dinterests_status" ON "public"."discipleship_interests" USING "btree" ("status");



CREATE INDEX "idx_dinterests_target_group" ON "public"."discipleship_interests" USING "btree" ("target_group_id");



CREATE INDEX "idx_dmembers_group" ON "public"."discipleship_members" USING "btree" ("group_id");



CREATE INDEX "idx_dmessages_group" ON "public"."discipleship_messages" USING "btree" ("group_id", "sent_at" DESC);



CREATE INDEX "idx_event_reg_event" ON "public"."event_registrations" USING "btree" ("event_id");



CREATE INDEX "idx_event_reg_group" ON "public"."event_registrations" USING "btree" ("registration_group_id");



CREATE INDEX "idx_event_reg_submitted" ON "public"."event_registrations" USING "btree" ("submitted_at" DESC);



CREATE INDEX "idx_fin_expenses_date" ON "public"."fin_expenses" USING "btree" ("occurred_on" DESC);



CREATE INDEX "idx_fin_expenses_fund" ON "public"."fin_expenses" USING "btree" ("fund_id");



CREATE INDEX "idx_fin_expenses_min" ON "public"."fin_expenses" USING "btree" ("ministry_id");



CREATE INDEX "idx_fin_income_date" ON "public"."fin_income" USING "btree" ("occurred_on" DESC);



CREATE INDEX "idx_fin_income_fund" ON "public"."fin_income" USING "btree" ("fund_id");



CREATE INDEX "idx_fin_payables_stat" ON "public"."fin_payables" USING "btree" ("status", "due_on");



CREATE INDEX "idx_galbums_event_type" ON "public"."gallery_albums" USING "btree" ("event_type");



CREATE INDEX "idx_galbums_featured" ON "public"."gallery_albums" USING "btree" ("is_featured") WHERE ("is_featured" = true);



CREATE INDEX "idx_galbums_published" ON "public"."gallery_albums" USING "btree" ("is_published");



CREATE INDEX "idx_galbums_year" ON "public"."gallery_albums" USING "btree" ("year" DESC, "event_date" DESC);



CREATE INDEX "idx_gphotos_album" ON "public"."gallery_photos" USING "btree" ("album_id", "sort_order", "created_at");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("lower"("email"));



CREATE INDEX "idx_notif_created" ON "public"."admin_notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notif_unread" ON "public"."admin_notifications" USING "btree" ("is_read") WHERE ("is_read" = false);



CREATE INDEX "newsletter_subscribers_active_idx" ON "public"."newsletter_subscribers" USING "btree" ("unsubscribed_at") WHERE ("unsubscribed_at" IS NULL);



CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "public"."newsletter_subscribers" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "newsletter_subscribers_unsub_token_idx" ON "public"."newsletter_subscribers" USING "btree" ("unsubscribe_token");



CREATE INDEX "profiles_preset_id_idx" ON "public"."profiles" USING "btree" ("preset_id");



CREATE UNIQUE INDEX "uniq_dmembers_group_email" ON "public"."discipleship_members" USING "btree" ("group_id", "lower"("email")) WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "uq_invitations_pending_email" ON "public"."invitations" USING "btree" ("lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE OR REPLACE TRIGGER "designs_touch" BEFORE UPDATE ON "public"."designs" FOR EACH ROW EXECUTE FUNCTION "public"."designs_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."calendar_presets" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."discipleship_groups" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."discipleship_members" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."discipleship_messages" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_expense_categories" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_funds" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_income" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_income_categories" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_notes" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_payables" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fin_recurring" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."gallery_albums" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."invitations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."ministries" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."special_events" FOR EACH ROW EXECUTE FUNCTION "public"."audit_capture"();



CREATE OR REPLACE TRIGGER "trg_dgroups_touch" BEFORE UPDATE ON "public"."discipleship_groups" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_dinterests_auto_place" AFTER INSERT ON "public"."discipleship_interests" FOR EACH ROW EXECUTE FUNCTION "public"."discipleship_auto_place"();



CREATE OR REPLACE TRIGGER "trg_dmembers_recount" AFTER INSERT OR DELETE OR UPDATE ON "public"."discipleship_members" FOR EACH ROW EXECUTE FUNCTION "public"."discipleship_recount_members"();



CREATE OR REPLACE TRIGGER "trg_galbums_touch" BEFORE UPDATE ON "public"."gallery_albums" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_gphotos_recount" AFTER INSERT OR DELETE OR UPDATE ON "public"."gallery_photos" FOR EACH ROW EXECUTE FUNCTION "public"."gallery_recount_photos"();



CREATE OR REPLACE TRIGGER "trg_notify_interest" AFTER INSERT ON "public"."discipleship_interests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_interest"();



CREATE OR REPLACE TRIGGER "trg_notify_registration" AFTER INSERT ON "public"."event_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_registration"();



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id");



ALTER TABLE ONLY "public"."design_shares"
    ADD CONSTRAINT "design_shares_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."design_shares"
    ADD CONSTRAINT "design_shares_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."design_shares"
    ADD CONSTRAINT "design_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."designs"
    ADD CONSTRAINT "designs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."designs"
    ADD CONSTRAINT "designs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discipleship_groups"
    ADD CONSTRAINT "discipleship_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discipleship_groups"
    ADD CONSTRAINT "discipleship_groups_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discipleship_interests"
    ADD CONSTRAINT "discipleship_interests_assigned_group_id_fkey" FOREIGN KEY ("assigned_group_id") REFERENCES "public"."discipleship_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discipleship_interests"
    ADD CONSTRAINT "discipleship_interests_target_group_id_fkey" FOREIGN KEY ("target_group_id") REFERENCES "public"."discipleship_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discipleship_members"
    ADD CONSTRAINT "discipleship_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."discipleship_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discipleship_members"
    ADD CONSTRAINT "discipleship_members_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "public"."discipleship_interests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discipleship_messages"
    ADD CONSTRAINT "discipleship_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."discipleship_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discipleship_messages"
    ADD CONSTRAINT "discipleship_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."special_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id");



ALTER TABLE ONLY "public"."fin_expenses"
    ADD CONSTRAINT "fin_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."fin_expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_expenses"
    ADD CONSTRAINT "fin_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_expenses"
    ADD CONSTRAINT "fin_expenses_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "public"."fin_funds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_expenses"
    ADD CONSTRAINT "fin_expenses_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_expenses"
    ADD CONSTRAINT "fin_expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."fin_projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_income"
    ADD CONSTRAINT "fin_income_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."fin_income_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_income"
    ADD CONSTRAINT "fin_income_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_income"
    ADD CONSTRAINT "fin_income_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "public"."fin_funds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_income"
    ADD CONSTRAINT "fin_income_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."fin_projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_notes"
    ADD CONSTRAINT "fin_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_notes"
    ADD CONSTRAINT "fin_notes_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_payables"
    ADD CONSTRAINT "fin_payables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_payables"
    ADD CONSTRAINT "fin_payables_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_projects"
    ADD CONSTRAINT "fin_projects_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_projects"
    ADD CONSTRAINT "fin_projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fin_recurring"
    ADD CONSTRAINT "fin_recurring_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fin_recurring"
    ADD CONSTRAINT "fin_recurring_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gallery_albums"
    ADD CONSTRAINT "gallery_albums_cover_photo_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "public"."gallery_photos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gallery_albums"
    ADD CONSTRAINT "gallery_albums_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gallery_photos"
    ADD CONSTRAINT "gallery_photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."gallery_albums"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_photos"
    ADD CONSTRAINT "gallery_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "public"."role_presets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."special_events"
    ADD CONSTRAINT "special_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE "public"."admin_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_notifications_admin_all" ON "public"."admin_notifications" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_admin_all" ON "public"."app_settings" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_admin_read" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_presets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calevents_public_read" ON "public"."calendar_events" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "calevents_staff_delete" ON "public"."calendar_events" FOR DELETE TO "authenticated" USING (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"()))));



CREATE POLICY "calevents_staff_insert" ON "public"."calendar_events" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"()))));



CREATE POLICY "calevents_staff_update" ON "public"."calendar_events" FOR UPDATE TO "authenticated" USING (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"())))) WITH CHECK (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"()))));



ALTER TABLE "public"."design_shares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "design_shares_delete" ON "public"."design_shares" FOR DELETE USING (("public"."owns_design"("design_id") OR ("user_id" = "auth"."uid"())));



CREATE POLICY "design_shares_insert" ON "public"."design_shares" FOR INSERT WITH CHECK (("public"."owns_design"("design_id") AND ("added_by" = "auth"."uid"())));



CREATE POLICY "design_shares_select" ON "public"."design_shares" FOR SELECT USING (("public"."owns_design"("design_id") OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."designs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "designs_delete" ON "public"."designs" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "designs_insert" ON "public"."designs" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "designs_select" ON "public"."designs" FOR SELECT USING ("public"."can_edit_design"("id"));



CREATE POLICY "designs_update" ON "public"."designs" FOR UPDATE USING ("public"."can_edit_design"("id")) WITH CHECK ("public"."can_edit_design"("id"));



CREATE POLICY "dgroups_public_read" ON "public"."discipleship_groups" FOR SELECT TO "authenticated", "anon" USING ((("is_published" = true) AND ("status" = ANY (ARRAY['open'::"text", 'active'::"text", 'completed'::"text"]))));



CREATE POLICY "dgroups_staff_all" ON "public"."discipleship_groups" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



CREATE POLICY "dinterests_public_insert" ON "public"."discipleship_interests" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("char_length"("btrim"(COALESCE("full_name", ''::"text"))) >= 1) AND ("char_length"("btrim"(COALESCE("full_name", ''::"text"))) <= 200)));



CREATE POLICY "dinterests_staff_all" ON "public"."discipleship_interests" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



ALTER TABLE "public"."discipleship_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discipleship_interests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discipleship_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discipleship_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dmembers_staff_all" ON "public"."discipleship_members" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



CREATE POLICY "dmessages_staff_all" ON "public"."discipleship_messages" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



CREATE POLICY "event_reg_admin_all" ON "public"."event_registrations" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "event_reg_insert" ON "public"."event_registrations" FOR INSERT TO "authenticated", "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."special_events" "se"
  WHERE (("se"."id" = "event_registrations"."event_id") AND ("se"."registration_open" = true) AND (("se"."event_at" IS NULL) OR ("se"."event_at" >= "now"()))))));



ALTER TABLE "public"."event_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_public_read" ON "public"."events" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "events_staff_delete" ON "public"."events" FOR DELETE TO "authenticated" USING (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"()))));



CREATE POLICY "events_staff_insert" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"()))));



CREATE POLICY "events_staff_update" ON "public"."events" FOR UPDATE TO "authenticated" USING (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"())))) WITH CHECK (("public"."is_aal2"() AND ("public"."is_admin"() OR ("ministry_id" = "public"."my_ministry_id"()))));



ALTER TABLE "public"."fin_expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fin_expense_categories_finance_all" ON "public"."fin_expense_categories" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



CREATE POLICY "fin_expense_categories_read" ON "public"."fin_expense_categories" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."fin_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fin_expenses_finance_all" ON "public"."fin_expenses" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



CREATE POLICY "fin_expenses_leader_read" ON "public"."fin_expenses" FOR SELECT TO "authenticated" USING (("ministry_id" = "public"."my_ministry_id"()));



ALTER TABLE "public"."fin_funds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fin_funds_finance_all" ON "public"."fin_funds" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



CREATE POLICY "fin_funds_read" ON "public"."fin_funds" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."fin_income" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fin_income_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fin_income_categories_finance_all" ON "public"."fin_income_categories" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



CREATE POLICY "fin_income_categories_read" ON "public"."fin_income_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "fin_income_finance_all" ON "public"."fin_income" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



ALTER TABLE "public"."fin_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fin_notes_finance_all" ON "public"."fin_notes" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



ALTER TABLE "public"."fin_payables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fin_payables_finance_all" ON "public"."fin_payables" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



ALTER TABLE "public"."fin_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fin_recurring" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fin_recurring_finance_all" ON "public"."fin_recurring" TO "authenticated" USING ("public"."can_finance"()) WITH CHECK ("public"."can_finance"());



CREATE POLICY "galbums_public_read" ON "public"."gallery_albums" FOR SELECT TO "authenticated", "anon" USING (("is_published" = true));



CREATE POLICY "galbums_staff_all" ON "public"."gallery_albums" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



ALTER TABLE "public"."gallery_albums" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gallery_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gphotos_public_read" ON "public"."gallery_photos" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."gallery_albums" "a"
  WHERE (("a"."id" = "gallery_photos"."album_id") AND ("a"."is_published" = true)))));



CREATE POLICY "gphotos_staff_all" ON "public"."gallery_photos" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitations_admin_all" ON "public"."invitations" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



ALTER TABLE "public"."ministries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ministries_admin_write" ON "public"."ministries" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



CREATE POLICY "ministries_read_all" ON "public"."ministries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "newsletter_admin_all" ON "public"."newsletter_subscribers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."newsletter_dispatch_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "newsletter_insert" ON "public"."newsletter_subscribers" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pp_calendar_events" ON "public"."calendar_events" TO "authenticated" USING ("public"."has_any_tab"(ARRAY['upcoming'::"text", 'calendario'::"text", 'special-events'::"text"])) WITH CHECK ("public"."has_any_tab"(ARRAY['upcoming'::"text", 'calendario'::"text"]));



CREATE POLICY "pp_discipleship_groups" ON "public"."discipleship_groups" TO "authenticated" USING ("public"."has_tab"('discipulado'::"text")) WITH CHECK ("public"."has_tab"('discipulado'::"text"));



CREATE POLICY "pp_discipleship_interests" ON "public"."discipleship_interests" TO "authenticated" USING ("public"."has_tab"('discipulado'::"text")) WITH CHECK ("public"."has_tab"('discipulado'::"text"));



CREATE POLICY "pp_discipleship_members" ON "public"."discipleship_members" TO "authenticated" USING ("public"."has_tab"('discipulado'::"text")) WITH CHECK ("public"."has_tab"('discipulado'::"text"));



CREATE POLICY "pp_event_registrations" ON "public"."event_registrations" TO "authenticated" USING ("public"."has_tab"('special-events'::"text")) WITH CHECK ("public"."has_tab"('special-events'::"text"));



CREATE POLICY "pp_events" ON "public"."events" TO "authenticated" USING ("public"."has_any_tab"(ARRAY['upcoming'::"text", 'calendario'::"text", 'special-events'::"text"])) WITH CHECK ("public"."has_any_tab"(ARRAY['upcoming'::"text", 'calendario'::"text"]));



CREATE POLICY "pp_fin_expense_categories" ON "public"."fin_expense_categories" TO "authenticated" USING ("public"."is_finance"()) WITH CHECK ("public"."is_finance"());



CREATE POLICY "pp_fin_expenses_budget" ON "public"."fin_expenses" FOR SELECT TO "authenticated" USING ((("project_id" IS NULL) AND ("ministry_id" IS NOT NULL) AND ("ministry_id" = ANY ("public"."my_ministry_ids"()))));



CREATE POLICY "pp_fin_expenses_church" ON "public"."fin_expenses" TO "authenticated" USING (("public"."is_finance"() AND ("project_id" IS NULL))) WITH CHECK (("public"."is_finance"() AND ("project_id" IS NULL)));



CREATE POLICY "pp_fin_expenses_owner" ON "public"."fin_expenses" TO "authenticated" USING ((("project_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fin_projects" "fp"
  WHERE (("fp"."id" = "fin_expenses"."project_id") AND ("fp"."owner_id" = "auth"."uid"())))))) WITH CHECK ((("project_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fin_projects" "fp"
  WHERE (("fp"."id" = "fin_expenses"."project_id") AND ("fp"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "pp_fin_funds" ON "public"."fin_funds" TO "authenticated" USING ("public"."is_finance"()) WITH CHECK ("public"."is_finance"());



CREATE POLICY "pp_fin_income_categories" ON "public"."fin_income_categories" TO "authenticated" USING ("public"."is_finance"()) WITH CHECK ("public"."is_finance"());



CREATE POLICY "pp_fin_income_church" ON "public"."fin_income" TO "authenticated" USING (("public"."is_finance"() AND ("project_id" IS NULL))) WITH CHECK (("public"."is_finance"() AND ("project_id" IS NULL)));



CREATE POLICY "pp_fin_income_owner" ON "public"."fin_income" TO "authenticated" USING ((("project_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fin_projects" "fp"
  WHERE (("fp"."id" = "fin_income"."project_id") AND ("fp"."owner_id" = "auth"."uid"())))))) WITH CHECK ((("project_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."fin_projects" "fp"
  WHERE (("fp"."id" = "fin_income"."project_id") AND ("fp"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "pp_fin_notes" ON "public"."fin_notes" TO "authenticated" USING ("public"."is_finance"()) WITH CHECK ("public"."is_finance"());



CREATE POLICY "pp_fin_payables" ON "public"."fin_payables" TO "authenticated" USING ("public"."is_finance"()) WITH CHECK ("public"."is_finance"());



CREATE POLICY "pp_fin_projects" ON "public"."fin_projects" TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR "public"."is_finance"())) WITH CHECK ((("owner_id" = "auth"."uid"()) OR "public"."is_finance"()));



CREATE POLICY "pp_fin_recurring" ON "public"."fin_recurring" TO "authenticated" USING ("public"."is_finance"()) WITH CHECK ("public"."is_finance"());



CREATE POLICY "pp_fin_recurring_budget" ON "public"."fin_recurring" FOR SELECT TO "authenticated" USING ((("ministry_id" IS NOT NULL) AND ("ministry_id" = ANY ("public"."my_ministry_ids"()))));



CREATE POLICY "pp_gallery_albums" ON "public"."gallery_albums" TO "authenticated" USING ("public"."has_tab"('galeria'::"text")) WITH CHECK ("public"."has_tab"('galeria'::"text"));



CREATE POLICY "pp_gallery_photos" ON "public"."gallery_photos" TO "authenticated" USING ("public"."has_tab"('galeria'::"text")) WITH CHECK ("public"."has_tab"('galeria'::"text"));



CREATE POLICY "pp_ministries_read" ON "public"."ministries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pp_special_events" ON "public"."special_events" TO "authenticated" USING ("public"."has_tab"('special-events'::"text")) WITH CHECK ("public"."has_tab"('special-events'::"text"));



CREATE POLICY "presets_admin_write" ON "public"."calendar_presets" TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



CREATE POLICY "presets_read" ON "public"."calendar_presets" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_delete" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"()));



CREATE POLICY "profiles_admin_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() AND "public"."is_aal2"())) WITH CHECK (("public"."is_admin"() AND "public"."is_aal2"()));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."role_presets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_presets_admin_all" ON "public"."role_presets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."id" = "auth"."uid"()) AND ("pr"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "pr"
  WHERE (("pr"."id" = "auth"."uid"()) AND ("pr"."role" = 'admin'::"text")))));



ALTER TABLE "public"."special_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "special_events_admin_all" ON "public"."special_events" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "special_events_public_read" ON "public"."special_events" FOR SELECT TO "authenticated", "anon" USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_capture"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_capture"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_capture"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_design"("d" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_design"("d" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_design"("d" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_finance"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_finance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_finance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_join_design_topic"("topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_join_design_topic"("topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_join_design_topic"("topic" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."designs_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."designs_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."designs_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."discipleship_auto_place"() TO "anon";
GRANT ALL ON FUNCTION "public"."discipleship_auto_place"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."discipleship_auto_place"() TO "service_role";



GRANT ALL ON FUNCTION "public"."discipleship_recount_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."discipleship_recount_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."discipleship_recount_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_recount_photos"() TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_recount_photos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_recount_photos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_any_tab"("tabs" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_any_tab"("tabs" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_any_tab"("tabs" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_tab"("tab" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tab"("tab" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tab"("tab" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_aal2"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_aal2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_aal2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_finance"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_finance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_finance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_treasurer"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_treasurer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_treasurer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_designer_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_designer_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_designer_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_ministry_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_ministry_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_ministry_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_ministry_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_ministry_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_ministry_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_interest"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_interest"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_interest"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_registration"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_registration"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_registration"() TO "service_role";



GRANT ALL ON FUNCTION "public"."owns_design"("d" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."owns_design"("d" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_design"("d" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_my_display_name"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_my_display_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_display_name"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_notifications" TO "anon";
GRANT ALL ON TABLE "public"."admin_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_presets" TO "anon";
GRANT ALL ON TABLE "public"."calendar_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_presets" TO "service_role";



GRANT ALL ON TABLE "public"."design_shares" TO "anon";
GRANT ALL ON TABLE "public"."design_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."design_shares" TO "service_role";



GRANT ALL ON TABLE "public"."designs" TO "anon";
GRANT ALL ON TABLE "public"."designs" TO "authenticated";
GRANT ALL ON TABLE "public"."designs" TO "service_role";



GRANT ALL ON TABLE "public"."discipleship_groups" TO "anon";
GRANT ALL ON TABLE "public"."discipleship_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."discipleship_groups" TO "service_role";



GRANT ALL ON TABLE "public"."discipleship_interests" TO "anon";
GRANT ALL ON TABLE "public"."discipleship_interests" TO "authenticated";
GRANT ALL ON TABLE "public"."discipleship_interests" TO "service_role";



GRANT ALL ON TABLE "public"."discipleship_members" TO "anon";
GRANT ALL ON TABLE "public"."discipleship_members" TO "authenticated";
GRANT ALL ON TABLE "public"."discipleship_members" TO "service_role";



GRANT ALL ON TABLE "public"."discipleship_messages" TO "anon";
GRANT ALL ON TABLE "public"."discipleship_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."discipleship_messages" TO "service_role";



GRANT ALL ON TABLE "public"."event_registrations" TO "anon";
GRANT ALL ON TABLE "public"."event_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."event_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."fin_expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."fin_expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."fin_expenses" TO "anon";
GRANT ALL ON TABLE "public"."fin_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."fin_funds" TO "anon";
GRANT ALL ON TABLE "public"."fin_funds" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_funds" TO "service_role";



GRANT ALL ON TABLE "public"."fin_income" TO "anon";
GRANT ALL ON TABLE "public"."fin_income" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_income" TO "service_role";



GRANT ALL ON TABLE "public"."fin_income_categories" TO "anon";
GRANT ALL ON TABLE "public"."fin_income_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_income_categories" TO "service_role";



GRANT ALL ON TABLE "public"."fin_notes" TO "anon";
GRANT ALL ON TABLE "public"."fin_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_notes" TO "service_role";



GRANT ALL ON TABLE "public"."fin_payables" TO "anon";
GRANT ALL ON TABLE "public"."fin_payables" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_payables" TO "service_role";



GRANT ALL ON TABLE "public"."fin_projects" TO "anon";
GRANT ALL ON TABLE "public"."fin_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_projects" TO "service_role";



GRANT ALL ON TABLE "public"."fin_recurring" TO "anon";
GRANT ALL ON TABLE "public"."fin_recurring" TO "authenticated";
GRANT ALL ON TABLE "public"."fin_recurring" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_albums" TO "anon";
GRANT ALL ON TABLE "public"."gallery_albums" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_albums" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_photos" TO "anon";
GRANT ALL ON TABLE "public"."gallery_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_photos" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."ministries" TO "anon";
GRANT ALL ON TABLE "public"."ministries" TO "authenticated";
GRANT ALL ON TABLE "public"."ministries" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_dispatch_log" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_dispatch_log" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_dispatch_log" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."role_presets" TO "anon";
GRANT ALL ON TABLE "public"."role_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."role_presets" TO "service_role";



GRANT ALL ON TABLE "public"."special_events" TO "anon";
GRANT ALL ON TABLE "public"."special_events" TO "authenticated";
GRANT ALL ON TABLE "public"."special_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






