// /js/event-fetcher.js
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

  return { fetchEvents, subscribeRealtime, startPolling, stopPolling, client: supabase };
}

export default { createEventFetcher };
