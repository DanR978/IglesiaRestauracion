// js/lib/supabase.js
// All values from .env — run: npm run dev (Vite reads .env automatically)
// If you just created .env, restart Vite: ctrl+C → npm run dev

// import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// const _env = (key) => import.meta.env?.[key] || '';

// const url = _env('VITE_SUPABASE_URL');
// const key = _env('VITE_SUPABASE_ANON_KEY');

// if (!url || !key) {
//   console.error(
//     '[supabase] Missing env vars. Make sure .env exists in project root with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart Vite (ctrl+C → npm run dev)'
//   );
// }

// export const sb = url && key
//   ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
//   : null;

// export const STORAGE_WEB       = _env('VITE_STORAGE_WEB_IMAGES');
// export const STORAGE_EVENTS    = _env('VITE_STORAGE_EVENT_IMAGES');
// export const YT_API_KEY        = _env('VITE_YOUTUBE_API_KEY');
// export const YT_CHANNEL_HANDLE = _env('VITE_YOUTUBE_CHANNEL_HANDLE');
// export const YT_LIVE_FN        = _env('VITE_YOUTUBE_LIVE_FN');


// js/lib/supabase.js
// Reads from .env when Vite is running. Falls back to defaults if not.
// To update: change .env then restart Vite (ctrl+C → npm run dev)

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const e = (k, fallback) => {
  try { return import.meta.env?.[k] || fallback; }
  catch { return fallback; }
};

const SUPABASE_URL  = e('VITE_SUPABASE_URL',  'https://snqwxgyhfiinouewxgiy.supabase.co');
const SUPABASE_KEY  = e('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXd4Z3loZmlpbm91ZXd4Z2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjMxNzAsImV4cCI6MjA3MTM5OTE3MH0.LgxKa56FGiHRZB24s8ikfg5epV5QXdG3aVkgPIRMneo');

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const STORAGE_WEB       = e('VITE_STORAGE_WEB_IMAGES',       'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/web-images');
export const STORAGE_EVENTS    = e('VITE_STORAGE_EVENT_IMAGES',     'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/event-images');
export const YT_API_KEY        = e('VITE_YOUTUBE_API_KEY',          'AIzaSyDzqy5ij2NQAjzgOA01yoTfpLHDL-wtFNE');
export const YT_CHANNEL_HANDLE = e('VITE_YOUTUBE_CHANNEL_HANDLE',  '@Lex.IglesiaRestauracionDivina');
export const YT_LIVE_FN        = e('VITE_YOUTUBE_LIVE_FN',         'https://snqwxgyhfiinouewxgiy.supabase.co/functions/v1/youtube-live');