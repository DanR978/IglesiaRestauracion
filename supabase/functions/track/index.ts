// supabase/functions/track/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// First-party website analytics collector (cookieless).
//
// Flow: js/lib/analytics.js on every public page sends small beacons here
// (navigator.sendBeacon, text/plain — no CORS preflight). This function drops
// bots and foreign origins, derives an anonymous daily visitor hash from
// IP + user-agent + a salt that rotates every UTC day, and writes to
// public.analytics_events with the service role. The IP and user-agent are
// never stored. Schema + privacy model: 20261012_site_analytics.sql.
//
// Beacon types (JSON body):
//   { t:'pageview', id, p, ti?, r?, nf?, dv?, lg?, tz? }
//   { t:'engage',   id, ms, sc?, ti? }       — updates that pageview's row
//   { t:'event',    id, p, n, l? }           — call / whatsapp / signup…
//
// Deploy:  supabase functions deploy track --no-verify-jwt
//          (no-verify-jwt: anonymous visitors call it without a session)
// Secrets: optional ANALYTICS_EXTRA_ORIGINS="http://localhost:5173" to accept
//          beacons from a dev server (they land in the PRODUCTION table).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORIGINS = new Set([
  "https://www.irdlex.org",
  "https://irdlex.org",
  ...(Deno.env.get("ANALYTICS_EXTRA_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);
const OWN_HOST = /(^|\.)irdlex\.org$/i;

const MAX_BODY = 4096;
const MAX_HITS_PER_HOUR = 600;   // per visitor hash — caps a scripted flood
const RETENTION_MONTHS = 25;

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|httpclient|phantomjs|selenium|puppeteer|playwright/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;

const done = (status = 204) => new Response(null, { status, headers: CORS });

const str = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
};

// pathname + allowlisted query keys. Anything else in the query (UTM tags
// are split out separately) could carry PII from a mistyped link.
const KEEP_QUERY = ["id", "e", "slug", "view"];
function cleanPath(raw: unknown): { path: string; utm: Record<string, string | null> } | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  let u: URL;
  try { u = new URL(raw, "https://www.irdlex.org"); } catch { return null; }
  let path = u.pathname.replace(/\/index\.html$/i, "/").replace(/\/{2,}/g, "/");
  const kept = new URLSearchParams();
  for (const k of KEEP_QUERY) {
    const v = u.searchParams.get(k);
    if (v) kept.set(k, v.slice(0, 80));
  }
  const qs = kept.toString();
  if (qs) path += `?${qs}`;
  const utm = (k: string) => str(u.searchParams.get(k), k === "utm_campaign" ? 120 : 80)?.toLowerCase() ?? null;
  return {
    path: path.slice(0, 400),
    utm: { source: utm("utm_source"), medium: utm("utm_medium"), campaign: utm("utm_campaign") },
  };
}

// External referrer → a stable host label; internal or unparsable → null.
const REF_ALIASES: Array<[RegExp, string]> = [
  [/(^|\.)facebook\.com$|^fb\.me$/, "facebook.com"],
  [/(^|\.)instagram\.com$/, "instagram.com"],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, "x.com"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube.com"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing.com"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo.com"],
  [/(^|\.)yahoo\.com$/, "yahoo.com"],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, "whatsapp"],
  [/(^|\.)linktr\.ee$/, "linktr.ee"],
];
function refHost(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  let host: string;
  try {
    const u = new URL(raw);
    // Android apps report themselves as android-app://com.google.android.gm/
    host = u.protocol === "android-app:" ? u.host || u.pathname.replace(/^\/+/, "") : u.hostname;
  } catch { return null; }
  host = host.toLowerCase().replace(/^www\./, "");
  if (!host || OWN_HOST.test(host)) return null;
  for (const [re, label] of REF_ALIASES) if (re.test(host)) return label;
  return host.slice(0, 120);
}

function browserOf(ua: string): string {
  if (/FBAN|FBAV/.test(ua)) return "Facebook (app)";
  if (/Instagram/.test(ua)) return "Instagram (app)";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox|FxiOS/.test(ua)) return "Firefox";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Otro";
}
function osOf(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Otro";
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// One random salt per UTC day. Edge isolates are reused across requests, so
// it's cached in memory; the DB row makes every isolate agree on it. Creating
// a new day's salt is also when yesterday-but-one's salt and expired rows go.
let saltCache: { day: string; salt: string } | null = null;
// deno-lint-ignore no-explicit-any
async function todaysSalt(sb: any): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10);
  if (saltCache?.day === day) return saltCache.salt;

  const { data } = await sb.from("analytics_salts").select("salt").eq("day", day).maybeSingle();
  if (data?.salt) { saltCache = { day, salt: data.salt }; return data.salt; }

  const fresh = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await sb.from("analytics_salts").insert({ day, salt: fresh });
  if (error && (error as { code?: string }).code !== "23505") {
    console.error("[track] salt insert:", error.message);
    return null;
  }
  // Lost the race to another isolate → use the row that won.
  const { data: row } = await sb.from("analytics_salts").select("salt").eq("day", day).maybeSingle();
  if (!row?.salt) return null;
  saltCache = { day, salt: row.salt };

  if (!error) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await sb.from("analytics_salts").delete().lt("day", yesterday);
    await sb.from("analytics_events").delete().lt("created_at", cutoff());
  }
  return row.salt;
}
function cutoff(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return d.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return done(405);

  const origin = req.headers.get("origin") ?? "";
  if (!ORIGINS.has(origin)) return done(403);

  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return done();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return done(500);

  // deno-lint-ignore no-explicit-any
  let b: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return done(413);
    b = JSON.parse(text);
  } catch {
    return done(400);
  }
  if (!b || typeof b !== "object" || typeof b.id !== "string" || !UUID.test(b.id)) return done(400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const salt = await todaysSalt(sb);
  if (!salt) return done(500);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || "";
  const visitor = (await sha256(`${salt}|${ip}|${ua}|irdlex.org`)).slice(0, 32);

  if (b.t === "engage") {
    const ms = Math.round(Number(b.ms));
    if (!Number.isFinite(ms) || ms < 0) return done(400);
    const patch: Record<string, unknown> = { engaged_ms: Math.min(ms, 14_400_000) };
    const sc = Math.round(Number(b.sc));
    if (Number.isFinite(sc)) patch.scroll_pct = Math.max(0, Math.min(sc, 100));
    const ti = str(b.ti, 200);
    if (ti) patch.title = ti;
    // Scoped to the same visitor + recent rows, so a guessed id can't touch
    // someone else's pageview.
    const { error } = await sb.from("analytics_events").update(patch)
      .eq("id", b.id).eq("kind", "pageview").eq("visitor_hash", visitor)
      .gt("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if (error) console.error("[track] engage:", error.message);
    return done();
  }

  if (b.t !== "pageview" && b.t !== "event") return done(400);

  const loc = cleanPath(b.p);
  if (!loc) return done(400);

  const { count } = await sb.from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("visitor_hash", visitor)
    .gt("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_HITS_PER_HOUR) return done(429);

  const row: Record<string, unknown> = {
    id: b.id,
    kind: b.t,
    visitor_hash: visitor,
    path: loc.path,
    browser: browserOf(ua),
    os: osOf(ua),
  };

  if (b.t === "pageview") {
    Object.assign(row, {
      title: str(b.ti, 200),
      not_found: b.nf === true,
      referrer_host: refHost(b.r),
      utm_source: loc.utm.source,
      utm_medium: loc.utm.medium,
      utm_campaign: loc.utm.campaign,
      device: ["mobile", "tablet", "desktop"].includes(b.dv) ? b.dv : null,
      lang: str(b.lg, 16),
      tz: str(b.tz, 64),
    });
  } else {
    const name = typeof b.n === "string" && EVENT_NAME.test(b.n) ? b.n : null;
    if (!name) return done(400);
    Object.assign(row, { name, label: str(b.l, 200) });
  }

  const { error } = await sb.from("analytics_events").insert(row);
  // 23505: the same beacon delivered twice (pagehide + visibilitychange). Fine.
  if (error && (error as { code?: string }).code !== "23505") {
    console.error("[track] insert:", error.message);
    return done(500);
  }
  return done();
});
