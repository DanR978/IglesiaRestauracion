// js/lib/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { CONFIG } from '/js/lib/config.js';

// ── Supabase client ─────────────────────────────────────────────────────────
export const sb = (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY)
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

if (!sb) console.warn('Supabase not initialized — check js/lib/config.js');

// ── Public exports ──────────────────────────────────────────────────────────
export const STORAGE_WEB       = CONFIG.STORAGE_WEB;
export const STORAGE_EVENTS    = CONFIG.STORAGE_EVENTS;
export const YT_API_KEY        = CONFIG.YT_API_KEY;
export const YT_CHANNEL_HANDLE = CONFIG.YT_CHANNEL_HANDLE;
export const YT_LIVE_FN        = CONFIG.YT_LIVE_FN;