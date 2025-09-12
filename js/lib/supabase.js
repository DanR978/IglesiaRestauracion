import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

// global singleton
window.sb = window.sb || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// optional: expose a helper
window.getSession = async () => (await window.sb.auth.getSession()).data.session;

