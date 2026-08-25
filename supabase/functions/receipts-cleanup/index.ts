// supabase/functions/receipts-cleanup/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Treasury receipt retention (MIGRATION.md D-018). Deletes every fin_receipts
// row whose `year` is at or below the cutoff, together with its two storage
// objects, and sweeps year folders left behind by `on delete cascade`.
//
// Cutoff:  body.cutoffYear ?? (current UTC year − 2)  →  delete `year <= cutoff`.
//          Fires Feb 1 of year N → cutoff N−2 → e.g. Feb 1 2028 deletes 2026 and
//          older and keeps 2027 + 2028. `<=` makes a missed run self-heal.
//
// Auth:    server-to-server only — requires header `x-cron-secret: <CRON_SECRET>`.
//          Runs with the service-role key, so RLS does not apply here: the
//          `receipts` bucket stays private and this is the only caller allowed
//          to bulk-delete across every scope.
//
// Trigger: pg_cron, February 1st 05:00 UTC (20260824120200_receipts_cleanup_cron).
//
// Deploy:  supabase functions deploy receipts-cleanup --no-verify-jwt
// Secrets: reuses CRON_SECRET (already set for the newsletter functions);
//          SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Smoke test (a safe no-op — no receipt is that old):
//   curl -X POST "$FN/receipts-cleanup" -H "x-cron-secret: $CRON_SECRET" \
//        -H 'Content-Type: application/json' -d '{"cutoffYear":1990}'
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

// deno-lint-ignore no-explicit-any
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

const BUCKET = "receipts";
const ROW_PAGE = 500; // fin_receipts rows read per page
const REMOVE_CHUNK = 100; // storage paths per remove() call — never exceed this
const LIST_PAGE = 1000; // storage list() page size
const SCOPES = ["church", "ministry", "project"] as const;
const YEAR_FOLDER = /^\d{4}$/;

/**
 * The retention cutoff (D-018): everything filed in this year or earlier goes.
 * MIRRORED in `web/src/lib/repos/receipts.ts` (`retentionCutoffYear`) — the two
 * runtimes cannot share a module, so keep the one line in step. The web copy is
 * the one covered by Vitest.
 */
export function retentionCutoffYear(now: Date = new Date()): number {
  // D-018 is a DATE rule, not a year rule: year Y survives until the Feb 1
  // sweep of Y+2. In January the sweep has not happened yet, so the window is
  // still one year wider — without this, a manual off-cycle re-run in January
  // (the documented recovery for a missed Feb 1) would destroy a year of
  // receipts three weeks early, irreversibly.
  return now.getUTCFullYear() - (now.getUTCMonth() === 0 ? 3 : 2);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Entry = { name: string; id: string | null };
// deno-lint-ignore no-explicit-any
type Bucket = any;

/** Every entry under `prefix`, paged. Folders come back with `id === null`. */
async function listAll(
  storage: Bucket,
  prefix: string,
): Promise<{ entries: Entry[]; error: string | null }> {
  const entries: Entry[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await storage.list(prefix, { limit: LIST_PAGE, offset });
    if (error) return { entries, error: error.message };
    const page: Entry[] = data ?? [];
    entries.push(...page);
    if (page.length < LIST_PAGE) return { entries, error: null };
  }
}

/** Chunked remove(); a failing chunk is recorded and the batch continues. */
async function removeAll(
  storage: Bucket,
  paths: string[],
  failures: string[],
): Promise<number> {
  let removed = 0;
  for (const group of chunk(paths, REMOVE_CHUNK)) {
    const { data, error } = await storage.remove(group);
    if (error) {
      failures.push(`remove ${group.length} objeto(s) (${group[0]}…): ${error.message}`);
      continue;
    }
    removed += Array.isArray(data) ? data.length : group.length;
  }
  return removed;
}

/** Delete every object directly inside one `…/<year>` folder. */
async function sweepYearFolder(
  storage: Bucket,
  folder: string,
  failures: string[],
): Promise<number> {
  const { entries, error } = await listAll(storage, folder);
  if (error) {
    failures.push(`list ${folder}: ${error}`);
    return 0;
  }
  const paths = entries.filter((e) => e.id !== null).map((e) => `${folder}/${e.name}`);
  return paths.length ? await removeAll(storage, paths, failures) : 0;
}

function expiredYearFolders(entries: Entry[], cutoff: number): string[] {
  return entries
    .filter((e) => e.id === null && YEAR_FOLDER.test(e.name) && Number(e.name) <= cutoff)
    .map((e) => e.name);
}

/**
 * Orphan sweep: year folders whose rows are already gone — e.g. objects stranded
 * when a ministry or project was deleted and `on delete cascade` took the
 * fin_receipts rows with it.
 */
async function sweepOrphans(
  storage: Bucket,
  cutoff: number,
  failures: string[],
): Promise<number> {
  let removed = 0;
  for (const scope of SCOPES) {
    const { entries, error } = await listAll(storage, scope);
    if (error) {
      failures.push(`list ${scope}: ${error}`);
      continue;
    }
    if (scope === "church") {
      // church/<year>/…
      for (const year of expiredYearFolders(entries, cutoff)) {
        removed += await sweepYearFolder(storage, `church/${year}`, failures);
      }
      continue;
    }
    // ministry|project/<id>/<year>/…
    for (const idFolder of entries.filter((e) => e.id === null)) {
      const prefix = `${scope}/${idFolder.name}`;
      const { entries: years, error: yearErr } = await listAll(storage, prefix);
      if (yearErr) {
        failures.push(`list ${prefix}: ${yearErr}`);
        continue;
      }
      for (const year of expiredYearFolders(years, cutoff)) {
        removed += await sweepYearFolder(storage, `${prefix}/${year}`, failures);
      }
    }
  }
  return removed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
    return json({ error: "La función no está configurada correctamente." }, 500);
  }
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "No autorizado." }, 401);
  }

  let opts: { cutoffYear?: number } = {};
  try {
    opts = await req.json();
  } catch { /* empty body is fine */ }

  const override = opts?.cutoffYear;
  if (
    override !== undefined &&
    (typeof override !== "number" || !Number.isInteger(override) ||
      override < 1900 || override > 2100)
  ) {
    return json({ error: "El año de corte no es válido." }, 400);
  }
  const cutoff = override ?? retentionCutoffYear();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const storage = sb.storage.from(BUCKET);
  const failures: string[] = [];

  // ── 1) Collect the object paths of every expiring row (500 at a time).
  const paths: string[] = [];
  let scanned = 0;
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await sb
      .from("fin_receipts")
      .select("id,storage_path,thumb_path")
      .lte("year", cutoff)
      .order("id", { ascending: true })
      .range(from, from + ROW_PAGE - 1);
    if (error) {
      console.error("[receipts-cleanup] row page error", error);
      return json({ error: "No se pudieron leer los recibos." }, 500);
    }
    const page: Array<{ storage_path: string | null; thumb_path: string | null }> = data ?? [];
    for (const row of page) {
      if (row.storage_path) paths.push(row.storage_path);
      if (row.thumb_path) paths.push(row.thumb_path);
    }
    scanned += page.length;
    if (page.length < ROW_PAGE) break;
  }

  // ── 2) Objects: the rows' own, then the orphaned year folders.
  let deletedObjects = await removeAll(storage, paths, failures);
  deletedObjects += await sweepOrphans(storage, cutoff, failures);

  // ── 3) Rows. `count` is authoritative — it also catches anything inserted
  //       into an expiring year while step 1 was paging.
  const { count, error: delErr } = await sb
    .from("fin_receipts")
    .delete({ count: "exact" })
    .lte("year", cutoff);
  if (delErr) {
    console.error("[receipts-cleanup] row delete error", delErr);
    return json({ error: "No se pudieron eliminar los recibos." }, 500);
  }
  const deletedRows = count ?? scanned;

  console.info(
    `[receipts-cleanup] cutoff ${cutoff}: ${deletedRows} fila(s), ${deletedObjects} objeto(s), ${failures.length} fallo(s)`,
  );
  return json({ ok: true, cutoff, deletedRows, deletedObjects, failures });
});
