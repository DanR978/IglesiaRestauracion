// supabase/functions/admin-invite/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Account and access-preset management for the IRD admin panel.
// Runs on Supabase Edge (Deno) with the service-role key — the service key
// NEVER reaches the browser.
//
// Every action requires a session at aal2 (second factor passed) on a
// developer-tier account; handler.ts documents the authorization order and the
// { code, error } failure contract, lib.ts the codes.
// Actions: list · invite · resend · revoke · set-role · delete · reset-mfa ·
//          list-presets · save-preset · delete-preset.
//
// Deploy:  supabase functions deploy admin-invite
//          — after the migration that adds admin_revoke_user_sessions(); until
//          it exists, delete / reset-mfa / access changes answer
//          revoke_unavailable and change nothing.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
//          automatically. Optional ALLOWED_ORIGINS: comma list of browser
//          origins for CORS, `scheme://host:*` = any port. Default:
//          https://www.irdlex.org,http://localhost:*,http://127.0.0.1:*
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { handleRequest } from "./handler.ts";

serve((req) =>
  handleRequest(req, {
    env: (name) => Deno.env.get(name),
    createAdminClient: (url, serviceKey) =>
      createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  })
);
