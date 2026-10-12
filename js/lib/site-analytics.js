// js/lib/site-analytics.js
// ─────────────────────────────────────────────────────────────────────────────
// Repository for the first-party website analytics (admin "Analíticas" tab).
//
// All aggregation happens in Postgres (analytics_summary / analytics_live,
// supabase/migrations/20261012_site_analytics.sql); both RPCs check
// has_tab('analytics') themselves, so this module holds no access logic.
//
// Unlike most reads here these return { data } | { error } rather than a safe
// empty: an all-zero dashboard would be indistinguishable from "no traffic",
// and the most likely error (migration not applied) needs to be visible.
//
// Usage:
//   import { fetchSummary, fetchLive, RANGES } from '/js/lib/site-analytics.js';
//   const { data, error } = await fetchSummary('30d');
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';

const CHURCH_TZ = 'America/New_York';

// key → label + how to compute [from, to) and the chart bucket.
export const RANGES = [
  { key: 'today', label: 'Hoy',               bucket: 'hour'  },
  { key: 'yday',  label: 'Ayer',              bucket: 'hour'  },
  { key: '7d',    label: 'Últimos 7 días',    bucket: 'day'   },
  { key: '30d',   label: 'Últimos 30 días',   bucket: 'day'   },
  { key: '90d',   label: 'Últimos 90 días',   bucket: 'day'   },
  { key: '12m',   label: 'Últimos 12 meses',  bucket: 'month' },
];

/** The viewer's own zone, so "today" means the admin's today. */
export function viewerTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || CHURCH_TZ; }
  catch { return CHURCH_TZ; }
}

/** [from, to) in the viewer's local time for a RANGES key. */
export function rangeBounds(key, now = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const daysBack = (n) => { const d = new Date(today); d.setDate(today.getDate() - n); return d; };

  switch (key) {
    case 'today': return { from: today, to: tomorrow };
    case 'yday':  return { from: daysBack(1), to: today };
    case '7d':    return { from: daysBack(6), to: tomorrow };
    case '90d':   return { from: daysBack(89), to: tomorrow };
    case '12m':   return { from: new Date(today.getFullYear(), today.getMonth() - 11, 1), to: tomorrow };
    case '30d':
    default:      return { from: daysBack(29), to: tomorrow };
  }
}

export async function fetchSummary(rangeKey) {
  if (!sb) return { error: 'Supabase no está configurado.' };
  const range = RANGES.find(r => r.key === rangeKey) || RANGES[3];
  const { from, to } = rangeBounds(range.key);
  const { data, error } = await sb.rpc('analytics_summary', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tz: viewerTz(),
    p_bucket: range.bucket,
  });
  if (error) {
    console.warn('[site-analytics] fetchSummary:', error.message);
    return { error: error.message };
  }
  return { data };
}

export async function fetchLive() {
  if (!sb) return { error: 'Supabase no está configurado.' };
  const { data, error } = await sb.rpc('analytics_live');
  if (error) {
    console.warn('[site-analytics] fetchLive:', error.message);
    return { error: error.message };
  }
  return { data };
}

// Per-browser opt-out read by js/lib/analytics.js (same origin as /admin).
const OPTOUT_KEY = 'ird.analytics.optout';
export function isOptedOut() {
  try { return localStorage.getItem(OPTOUT_KEY) === '1'; } catch { return false; }
}
export function setOptedOut(on) {
  try {
    if (on) localStorage.setItem(OPTOUT_KEY, '1');
    else localStorage.removeItem(OPTOUT_KEY);
    return true;
  } catch { return false; }
}
