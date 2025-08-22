// /js/main.js  (ES module)
import IRDns from './core/ird.js';
import * as Toast from './lib/toast.js';
import * as Captcha from './lib/captcha.js';
import * as Validators from './lib/validators.js';
import * as Forms from './lib/forms.js';

import {
  loadExternalScripts,
  setCurrentYear,
  setupBurgerMenu,
  setupFAQAccordion,
  loadRandomVerse,
  initAnimations,
  setupDirectionsButton
} from './app/ui.js';

// ---- expose namespace for legacy/partials
const IRD = (window.IRD ||= (IRDns ?? {}));
IRD.Toast = Toast;
IRD.Captcha = Captcha;
IRD.Validators = Validators;
IRD.Forms = Forms;

// ---- idempotent page wiring
let wired = false;
function wirePageOnce() {
  if (wired) return;
  wired = true;

  loadExternalScripts?.();
  setCurrentYear?.();
  loadRandomVerse?.();
  initAnimations?.();
  setupFAQAccordion?.();
  setupDirectionsButton?.();

  // contact form AJAX wiring (works for injected partial)
  IRD.Forms?.initContactFormWiring?.();
}

// ---- events: wait for includes, then wire. burger after header only
document.addEventListener('includes:ready', wirePageOnce);
document.addEventListener('header:ready', () => {
  // header is in the DOM now; listeners won't be nuked by innerHTML
  setupBurgerMenu?.();
});


// ============================================================================
// SUPABASE → RAIL bridge (auto-load + realtime updates)
// ============================================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 1) Configure your Supabase project (Project Settings → API)
//    ⚠️ Use the *anon* public key here (not the service role key).
const SUPABASE_URL = "https://snqwxgyhfiinouewxgiy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXd4Z3loZmlpbm91ZXd4Z2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjMxNzAsImV4cCI6MjA3MTM5OTE3MH0.LgxKa56FGiHRZB24s8ikfg5epV5QXdG3aVkgPIRMneo";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2) Map a Supabase row to your rail.js expected shape
//    rail.js expects: { title, date:"YYYY-MM-DD", time:"7:00 PM", location, tag, image, id? }
function toRailEvent(row) {
  const d = row?.starts_at ? new Date(row.starts_at) : null;

  // YYYY-MM-DD for rail.js parsing
  const date = d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : "";

  // “7:00 PM” local time string
  const time = d
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  return {
    id:       row.id,
    title:    row.title || "",
    date,                    // rail uses this to sort/filter
    time,                    // displayed under title
    location: row.location || "",
    tag:      row.tag || "",
    image:    row.image_url || ""  // rail expects `image`
  };
}

// 3) Fetch events and feed the rail
async function refreshRailFromSupabase() {
  try {
    const { data, error } = await sb
      .from("events")
      .select("*")
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("[rail] supabase fetch error:", error);
      return;
    }

    const mapped = (data || []).map(toRailEvent);
    // hand data to your existing rail renderer
    window.Rail?.setEvents?.(mapped);
  } catch (err) {
    console.error("[rail] refresh error:", err);
  }
}

// 4) Run initial load AFTER the rail partial is injected by include.js
document.addEventListener("rail:ready", refreshRailFromSupabase);

// 5) Realtime updates (Dashboard → Database → Replication → Realtime → enable table `events`)
sb.channel("events-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
    // any insert/update/delete → refetch + re-render
    refreshRailFromSupabase();
  })
  .subscribe();

// 6) Optional: cheap polling fallback every 2 minutes
setInterval(refreshRailFromSupabase, 120000);