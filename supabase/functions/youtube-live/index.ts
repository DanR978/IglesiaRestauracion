// supabase/functions/youtube-live/index.ts
// Deploy: supabase functions deploy youtube-live
// Set secret: supabase secrets set YOUTUBE_API_KEY=<your-key>
// (Never commit the real key. Restrict it to the YouTube Data API v3 in Google Cloud.)
//
// This runs on Supabase's edge (Deno), not in the browser.
// The API key never leaves the server.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CHANNEL_ID = "UCIrKtgR89PjeEJMHPDuomQw";

serve(async (req) => {
  // CORS headers (allow your site)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  const API_KEY = Deno.env.get("YOUTUBE_API_KEY");
  if (!API_KEY) {
    return new Response(
      JSON.stringify({ error: "API key not configured" }),
      { status: 500, headers }
    );
  }

  // Check live first, then upcoming
  for (const eventType of ["live", "upcoming"]) {
    try {
      const url =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet&channelId=${CHANNEL_ID}` +
        `&eventType=${eventType}&type=video&maxResults=1&key=${API_KEY}`;

      const res = await fetch(url);
      const data = await res.json();
      const items = data?.items || [];

      if (items.length > 0 && items[0]?.id?.videoId) {
        return new Response(
          JSON.stringify({ videoId: items[0].id.videoId, type: eventType }),
          { headers }
        );
      }
    } catch (e) {
      console.error(`Error checking ${eventType}:`, e);
    }
  }

  // Nothing live or upcoming
  return new Response(
    JSON.stringify({ videoId: null, type: null }),
    { headers }
  );
});