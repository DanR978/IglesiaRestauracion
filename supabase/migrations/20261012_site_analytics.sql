-- ============================================================================
-- 20261012_site_analytics.sql — first-party, cookieless website analytics
-- ============================================================================
-- Backs the admin "Analíticas" tab. The public pages send beacons to the
-- `track` Edge Function (js/lib/analytics.js); the function — not the browser —
-- writes here with the service role. Nothing in this file is reachable by anon.
--
-- Privacy model (why there is no consent banner and no PII):
--   • No cookies, no localStorage id. A visitor is identified only by
--     sha256(daily salt + IP + user-agent + host), computed in the function.
--   • The salt is random per UTC day and deleted after ~2 days, so a hash can't
--     be linked across days or reversed back to an IP once its salt is gone.
--     Consequence: "visitors" over a multi-day range is the SUM of daily unique
--     visitors — the same trade-off Plausible makes. The dashboard says so.
--   • The IP and user-agent are never stored. Only coarse derived fields are.
--
-- Access: has_tab('analytics') (admins always; grantable per profile). Reads go
-- through the two RPCs at the bottom; the tables themselves have no policies.
--
-- Idempotent. Apply manually in the SQL editor (CI never touches the DB).
-- Then deploy the function: supabase functions deploy track --no-verify-jwt
-- ============================================================================

-- ── 1. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.analytics_events (
  -- Client-generated per page load, so the later "engage" beacon (time on page,
  -- scroll depth, the final document.title) can update its own pageview row.
  id            uuid primary key,
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in ('pageview', 'event')),
  visitor_hash  text not null,
  -- pathname + only the allowlisted query keys (?id= / ?e= / ?slug= / ?view=).
  path          text not null check (char_length(path) <= 400),
  title         text check (char_length(title) <= 200),
  not_found     boolean not null default false,
  -- External referrers only (internal navigation is recorded as null).
  referrer_host text check (char_length(referrer_host) <= 120),
  utm_source    text check (char_length(utm_source) <= 80),
  utm_medium    text check (char_length(utm_medium) <= 80),
  utm_campaign  text check (char_length(utm_campaign) <= 120),
  device        text check (device in ('mobile', 'tablet', 'desktop')),
  browser       text check (char_length(browser) <= 40),
  os            text check (char_length(os) <= 40),
  lang          text check (char_length(lang) <= 16),
  -- IANA zone from the browser (e.g. America/New_York): coarse location
  -- without any IP geolocation lookup.
  tz            text check (char_length(tz) <= 64),
  engaged_ms    integer check (engaged_ms between 0 and 14400000),
  scroll_pct    smallint check (scroll_pct between 0 and 100),
  -- kind = 'event' only: what happened (call / whatsapp / newsletter_signup…)
  name          text check (char_length(name) <= 40),
  label         text check (char_length(label) <= 200),
  check ((kind = 'event') = (name is not null))
);

create index if not exists analytics_events_created_idx  on public.analytics_events (created_at);
create index if not exists analytics_events_visitor_idx  on public.analytics_events (visitor_hash, created_at);
create index if not exists analytics_events_kind_idx     on public.analytics_events (kind, created_at);

create table if not exists public.analytics_salts (
  day  date primary key,
  salt text not null
);

-- No policies on purpose: only the service role (the track function) and the
-- security-definer RPCs below touch these tables.
alter table public.analytics_events enable row level security;
alter table public.analytics_salts  enable row level security;
revoke all on public.analytics_events from anon, authenticated;
revoke all on public.analytics_salts  from anon, authenticated;

-- ── 2. Sessions (internal) ──────────────────────────────────────────────────
-- A session is one visitor's run of pageviews with no gap over 30 minutes.
-- Duration = first→last pageview + the time spent on the last page.
create or replace function public._analytics_sessions(p_from timestamptz, p_to timestamptz)
returns table (
  visitor_hash text, started_at timestamptz, pages int, duration_ms bigint,
  entry_path text, exit_path text, source text, utm_medium text, utm_campaign text
)
language sql stable security definer set search_path = public as $$
  with pv as (
    select e.visitor_hash, e.created_at, e.path, e.engaged_ms,
           coalesce(nullif(e.utm_source, ''), e.referrer_host) as source,
           e.utm_medium, e.utm_campaign,
           case when lag(e.created_at) over w is null
                  or e.created_at - lag(e.created_at) over w > interval '30 minutes'
                then 1 else 0 end as is_new
    from public.analytics_events e
    where e.kind = 'pageview' and not e.not_found
      and e.created_at >= p_from and e.created_at < p_to
    window w as (partition by e.visitor_hash order by e.created_at)
  ),
  numbered as (
    select pv.*, sum(pv.is_new) over (
      partition by pv.visitor_hash order by pv.created_at rows unbounded preceding) as sess
    from pv
  )
  select n.visitor_hash,
         min(n.created_at),
         count(*)::int,
         (extract(epoch from max(n.created_at) - min(n.created_at)) * 1000)::bigint
           + coalesce((array_agg(n.engaged_ms order by n.created_at desc))[1], 0),
         (array_agg(n.path         order by n.created_at))[1],
         (array_agg(n.path         order by n.created_at desc))[1],
         (array_agg(n.source       order by n.created_at))[1],
         (array_agg(n.utm_medium   order by n.created_at))[1],
         (array_agg(n.utm_campaign order by n.created_at))[1]
  from numbered n
  group by n.visitor_hash, n.sess;
$$;

create or replace function public._analytics_totals(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from public._analytics_sessions(p_from, p_to)),
  pv as (
    select visitor_hash, engaged_ms from public.analytics_events
    where kind = 'pageview' and not not_found and created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'visitors',          (select count(distinct visitor_hash) from pv),
    'pageviews',         (select count(*) from pv),
    'sessions',          (select count(*) from s),
    'bounce_rate',       (select round(100.0 * count(*) filter (where pages = 1) / nullif(count(*), 0), 1) from s),
    'pages_per_session', (select round(avg(pages)::numeric, 2) from s),
    'avg_session_s',     (select round(avg(duration_ms) / 1000.0) from s),
    'avg_engaged_s',     (select round(avg(engaged_ms) / 1000.0) from pv where engaged_ms is not null),
    'events',            (select count(*) from public.analytics_events
                          where kind = 'event' and created_at >= p_from and created_at < p_to)
  );
$$;

revoke execute on function public._analytics_sessions(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public._analytics_totals(timestamptz, timestamptz)   from public, anon, authenticated;

-- ── 3. Dashboard RPC ────────────────────────────────────────────────────────
-- One round trip for the whole tab. p_bucket: 'hour' | 'day' | 'month'.
-- `previous` is the same-length window immediately before p_from.
create or replace function public.analytics_summary(
  p_from   timestamptz,
  p_to     timestamptz,
  p_tz     text default 'America/New_York',
  p_bucket text default 'day'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz     text := p_tz;
  v_bucket text := p_bucket;
  v_out    jsonb;
begin
  if not public.has_tab('analytics') then
    raise exception 'No tienes acceso a las analíticas.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Rango de fechas inválido.' using errcode = '22023';
  end if;
  if v_bucket is null or v_bucket not in ('hour', 'day', 'month') then v_bucket := 'day'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'America/New_York'; end if;

  with pv as (
    select * from public.analytics_events
    where kind = 'pageview' and created_at >= p_from and created_at < p_to
  ),
  ok as (select * from pv where not not_found),
  ev as (
    select * from public.analytics_events
    where kind = 'event' and created_at >= p_from and created_at < p_to
  ),
  s as (select * from public._analytics_sessions(p_from, p_to)),
  series as (
    select b as bucket from generate_series(
      date_trunc(v_bucket, p_from at time zone v_tz),
      date_trunc(v_bucket, (p_to - interval '1 microsecond') at time zone v_tz),
      ('1 ' || v_bucket)::interval) b
  ),
  ts as (
    select se.bucket, count(ok.id) as pageviews, count(distinct ok.visitor_hash) as visitors
    from series se
    left join ok on date_trunc(v_bucket, ok.created_at at time zone v_tz) = se.bucket
    group by se.bucket
  ),
  pages as (
    select path,
           (array_agg(title order by created_at desc) filter (where title is not null))[1] as title,
           count(*) as views,
           count(distinct visitor_hash) as visitors,
           round(avg(engaged_ms) / 1000.0) as avg_engaged_s,
           round(avg(scroll_pct)) as avg_scroll
    from ok group by path order by views desc, path limit 25
  ),
  entries as (
    select entry_path as path, count(*) as sessions,
           round(100.0 * count(*) filter (where pages = 1) / count(*), 1) as bounce_rate
    from s group by entry_path order by sessions desc, path limit 10
  ),
  exits as (
    select exit_path as path, count(*) as sessions
    from s group by exit_path order by sessions desc, path limit 10
  ),
  sources as (
    select source, count(*) as sessions, count(distinct visitor_hash) as visitors,
           round(100.0 * count(*) filter (where pages = 1) / count(*), 1) as bounce_rate
    from s group by source order by sessions desc, source nulls first limit 15
  ),
  campaigns as (
    select utm_campaign as campaign, source, utm_medium as medium, count(*) as sessions
    from s where utm_campaign is not null
    group by utm_campaign, source, utm_medium order by sessions desc limit 10
  ),
  dim as (
    select 'device' as d, device as k, count(distinct visitor_hash) as visitors from ok group by device
    union all
    select 'browser', browser, count(distinct visitor_hash) from ok group by browser
    union all
    select 'os', os, count(distinct visitor_hash) from ok group by os
    union all
    select 'lang', split_part(lower(lang), '-', 1), count(distinct visitor_hash) from ok group by 2
    union all
    select 'tz', tz, count(distinct visitor_hash) from ok group by tz
  ),
  events as (
    select name, label, count(*) as count, count(distinct visitor_hash) as visitors
    from ev group by name, label order by count desc, name limit 30
  ),
  missing as (
    select path, count(*) as hits,
           (array_agg(referrer_host) filter (where referrer_host is not null))[1] as referrer
    from pv where not_found group by path order by hits desc, path limit 15
  ),
  heat as (
    select extract(dow from created_at at time zone v_tz)::int as d,
           extract(hour from created_at at time zone v_tz)::int as h,
           count(*) as n
    from ok group by 1, 2
  )
  select jsonb_build_object(
    'tz',        v_tz,
    'bucket',    v_bucket,
    'totals',    public._analytics_totals(p_from, p_to),
    'previous',  public._analytics_totals(p_from - (p_to - p_from), p_from),
    'series',    coalesce((select jsonb_agg(jsonb_build_object(
                    't', to_char(bucket, 'YYYY-MM-DD"T"HH24:MI'), 'pv', pageviews, 'v', visitors)
                    order by bucket) from ts), '[]'::jsonb),
    'pages',     coalesce((select jsonb_agg(to_jsonb(pages)) from pages), '[]'::jsonb),
    'entries',   coalesce((select jsonb_agg(to_jsonb(entries)) from entries), '[]'::jsonb),
    'exits',     coalesce((select jsonb_agg(to_jsonb(exits)) from exits), '[]'::jsonb),
    'sources',   coalesce((select jsonb_agg(to_jsonb(sources)) from sources), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(campaigns)) from campaigns), '[]'::jsonb),
    'dims',      coalesce((select jsonb_object_agg(d, rows) from (
                    select d, jsonb_agg(jsonb_build_object('k', k, 'v', visitors) order by visitors desc) as rows
                    from (select d, k, visitors,
                                 row_number() over (partition by d order by visitors desc) as rn
                          from dim) ranked
                    where rn <= 12 group by d) x), '{}'::jsonb),
    'events',    coalesce((select jsonb_agg(to_jsonb(events)) from events), '[]'::jsonb),
    'not_found', coalesce((select jsonb_agg(to_jsonb(missing)) from missing), '[]'::jsonb),
    'heatmap',   coalesce((select jsonb_agg(to_jsonb(heat)) from heat), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

-- Who is on the site right now: anyone whose last pageview was < 5 min ago.
create or replace function public.analytics_live()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_tab('analytics') then
    raise exception 'No tienes acceso a las analíticas.' using errcode = '42501';
  end if;

  return (
    with recent as (
      select distinct on (visitor_hash) visitor_hash, path
      from public.analytics_events
      where kind = 'pageview' and created_at > now() - interval '5 minutes'
      order by visitor_hash, created_at desc
    )
    select jsonb_build_object(
      'visitors', (select count(*) from recent),
      'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'n', n) order by n desc)
                         from (select path, count(*) as n from recent
                               group by path order by n desc limit 5) p), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.analytics_summary(timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.analytics_live() from public, anon;
grant  execute on function public.analytics_summary(timestamptz, timestamptz, text, text) to authenticated;
grant  execute on function public.analytics_live() to authenticated;
