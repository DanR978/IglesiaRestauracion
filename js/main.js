// js/main.js  (ES module)
// ---------------------------------------------------------------------------
// 1) Make scroll-blocking listeners passive by default (perf shim)
// ---------------------------------------------------------------------------
(function () {
  let supportsPassive = false;
  try {
    const opts = Object.defineProperty({}, "passive", {
      get() { supportsPassive = true; }
    });
    window.addEventListener("test-passive", null, opts);
    window.removeEventListener("test-passive", null, opts);
  } catch (_) {}
  if (!supportsPassive) return;

  const orig = EventTarget.prototype.addEventListener;
  const SCROLL_BLOCKING = new Set(["touchstart", "touchmove", "wheel"]);
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const needsPassive =
      SCROLL_BLOCKING.has(String(type).toLowerCase()) &&
      !(options && typeof options === "object" && "passive" in options);

    if (needsPassive) {
      if (options == null) options = { passive: true };
      else if (typeof options === "boolean") options = { capture: options, passive: true };
      else options = { ...options, passive: true };
    }
    return orig.call(this, type, listener, options);
  };
})();


// ---------------------------------------------------------------------------
// 2) App imports + IRD namespace (unchanged)
// ---------------------------------------------------------------------------
import IRDns from "./core/ird.js";
import * as Toast from "./lib/toast.js";
import * as Captcha from "./lib/captcha.js";
import * as Validators from "./lib/validators.js";
import * as Forms from "./lib/forms.js";

import {
  loadExternalScripts,
  setCurrentYear,
  setupBurgerMenu,
  setupStickyNav,
  setupFAQAccordion,
  loadRandomVerse,
  initAnimations,
  setupDirectionsButton,
} from "./app/ui.js";

// Expose namespace for legacy/partials
const IRD = (window.IRD ||= (IRDns ?? {}));
IRD.Toast = Toast;
IRD.Captcha = Captcha;
IRD.Validators = Validators;
IRD.Forms = Forms;


// ---------------------------------------------------------------------------
// 3) Idempotent page wiring
// ---------------------------------------------------------------------------
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

// Wait for includes to finish before wiring
document.addEventListener("includes:ready", wirePageOnce);

// Burger menu after header is injected so listeners survive innerHTML swaps
document.addEventListener("header:ready", () => {
  setupStickyNav?.({ sentinelSelector: '.hero', scrollThreshold: 100, hideOnScroll: true });
  setupBurgerMenu?.();
});


// ---------------------------------------------------------------------------
// 4) SUPABASE → EVENTS bridge (auto-load + realtime updates)
// ---------------------------------------------------------------------------
import { sb } from '/js/lib/supabase.js';

// Map DB row -> renderer shape expected by /js/app/events.js
function toEvent(row) {
  const d = row?.starts_at ? new Date(row.starts_at) : null;

  // Local YYYY-MM-DD (renderer uses this for sorting/filtering)
  const date = d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    : "";

  // Local “7:00 PM”
  const time = d
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  return {
    id: row.id,
    title: row.title || "",
    date,
    time,
    location: row.location || "",
    image: row.image_url || "",
    // url: row.url || "" // include only if you actually store URLs
  };
}

async function refreshEvents() {
  try {
    // Keep only upcoming: start-of-today (local) → ISO for timestamptz compare
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const { data, error } = await sb
      .from("events")
      .select("*")
      .gte("starts_at", start.toISOString())
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("[events] supabase fetch error:", error);
      window.Rail?.setEvents?.([]);     // render empty state
      return;
    }

    const mapped = (data || []).map(toEvent);
    console.info("[events] rows:", data?.length ?? 0, "mapped:", mapped.length);

    // Hand data to the renderer (it will render into all [data-events] sections)
    window.Rail?.setEvents?.(mapped);
  } catch (err) {
    console.error("[events] refresh error:", err);
  }
}

// Run initial load AFTER the events markup is injected/initialized by include.js
// NOTE: new signal is "events:ready" (not "rail:ready")
document.addEventListener("events:ready", refreshEvents);

// Realtime updates (enable Realtime for `public.events` in Supabase Studio)
try {
  sb.channel("events-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, refreshEvents)
    .subscribe();
} catch (e) {
  console.warn("[events] realtime subscribe skipped:", e);
}

// Simple polling fallback every 2 minutes
setInterval(refreshEvents, 120000);