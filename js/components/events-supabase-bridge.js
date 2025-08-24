// /js/rail-supabase-bridge.js
import { createEventFetcher } from "js/components/events-fetcher.js";

// ⬅️ put your real values here
const EF = createEventFetcher({
  url:  "https://snqwxgyhfiinouewxgiy.supabase.co",
  anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXd4Z3loZmlpbm91ZXd4Z2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjMxNzAsImV4cCI6MjA3MTM5OTE3MH0.LgxKa56FGiHRZB24s8ikfg5epV5QXdG3aVkgPIRMneo"
});

// Supabase row -> rail.js event shape
function toRailEvent(row) {
  // expects row.starts_at (timestamptz) and row.image_url
  const d = new Date(row.starts_at);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  const date = `${yyyy}-${mm}-${dd}`;
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return {
    id:       row.id,
    title:    row.title,
    date,                     // rail.js expects YYYY-MM-DD (string)
    time,                     // "7:00 PM"
    location: row.location || "",
    image:    row.image_url || ""   // rail.js expects 'image'
  };
}

async function refreshRailFromSupabase() {
  const rows = await EF.fetchEvents({ upcomingOnly: false });
  const mapped = rows.map(toRailEvent);
  window.Rail?.setEvents?.(mapped);   // feed your existing rail
}

// Run once the rail markup is injected by include.js
document.addEventListener("events:ready", refreshRailFromSupabase);

// Realtime (enable it for the `events` table in Supabase → Database → Replication → Realtime)
EF.subscribeRealtime(refreshRailFromSupabase);

// Polling fallback every 2 minutes (cheap + safe)
EF.startPolling(refreshRailFromSupabase, 120000);