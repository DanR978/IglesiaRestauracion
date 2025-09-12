// // /js/rail-supabase-bridge.js
// import { createEventFetcher } from "js/components/events-fetcher.js";

// const EF = createEventFetcher({
//   url:  "https://snqwxgyhfiinouewxgiy.supabase.co",
//   anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXd4Z3loZmlpbm91ZXd4Z2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjMxNzAsImV4cCI6MjA3MTM5OTE3MH0.LgxKa56FGiHRZB24s8ikfg5epV5QXdG3aVkgPIRMneo"
// });

// function toRailEvent(row) {
//   // expects row.starts_at (timestamptz) and row.image_url
//   const d = new Date(row.starts_at);
//   const yyyy = d.getFullYear();
//   const mm   = String(d.getMonth() + 1).padStart(2, "0");
//   const dd   = String(d.getDate()).padStart(2, "0");
//   const date = `${yyyy}-${mm}-${dd}`;
//   const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

//   return {
//     id:       row.id,
//     title:    row.title,
//     date,                     
//     time,                   
//     location: row.location || "",
//     image:    row.image_url || ""  
//   };
// }

// async function refreshRailFromSupabase() {
//   const rows = await EF.fetchEvents({ upcomingOnly: false });
//   const mapped = rows.map(toRailEvent);
//   window.Rail?.setEvents?.(mapped);   // feed your existing rail
// }

// // Run once the rail markup is injected by include.js
// document.addEventListener("events:ready", refreshRailFromSupabase);

// // Realtime (enable it for the `events` table in Supabase → Database → Replication → Realtime)
// EF.subscribeRealtime(refreshRailFromSupabase);

// // Polling fallback every 2 minutes (cheap + safe)
// EF.startPolling(refreshRailFromSupabase, 120000);

// js/components/events-fetcher.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export function createEventFetcher({ url, anon, table = "events" }) {
  const supabase = createClient(url, anon);
  let chan = null, poll = null;

  async function fetchEvents({ upcomingOnly = false } = {}) {
    let q = supabase.from(table).select("*");
    if (upcomingOnly) q = q.gte("starts_at", new Date().toISOString());
    q = q.order("starts_at", { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  // NEW: delete by id
  async function deleteEvent(id) {
    if (!id) throw new Error("Missing event id");
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  function subscribeRealtime(cb) {
    if (chan) try { chan.unsubscribe(); } catch {}
    chan = supabase
      .channel(`${table}-changes`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => cb().catch(console.error))
      .subscribe();
    return () => { try { chan?.unsubscribe(); } catch {}; chan = null; };
  }

  function startPolling(cb, ms = 120000) {
    stopPolling();
    poll = setInterval(() => cb().catch(console.error), ms);
    return stopPolling;
  }
  function stopPolling() { if (poll) clearInterval(poll); poll = null; }

  return { fetchEvents, deleteEvent, subscribeRealtime, startPolling, stopPolling, client: supabase };
}
