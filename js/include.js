// /js/include.js  (ES module)
// Robust, idempotent partial loader with explicit readiness events.
// NO login modal logic in this version.

(() => {
  // --- small helpers ---------------------------------------------------------
  const once = (obj, key) => {
    if (!obj) return false;
    if (obj.dataset?.[key]) return false;
    if (obj.dataset) obj.dataset[key] = "1";
    return true;
  };

  // Re-exec <script> tags inside injected HTML (optional but safer if your
  // header/rail/footer contain scripts). If you don't need this, you can drop it.
  const reexecuteScripts = (root) => {
    root.querySelectorAll("script").forEach((s) => {
      const ns = document.createElement("script");
      for (const a of s.attributes) ns.setAttribute(a.name, a.value);
      ns.textContent = s.textContent;
      s.replaceWith(ns);
    });
  };

  // run UI init only once globally
  let uiInitDone = false;
  const initUIOnce = async () => {
    if (uiInitDone) return;
    try {
      const ui = await import("/js/app/ui.js");
      ui.initAnimations?.();
      uiInitDone = true;
    } catch {
      /* optional UI module */
    }
  };

  // --- core include -----------------------------------------------------------
  const include = async (id, file) => {
    const host = document.getElementById(id);
    if (!host) return;

    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${file}`);

    const html = await res.text();

    // Use a fragment so we can re-exec scripts
    const frag = document.createRange().createContextualFragment(html);
    reexecuteScripts(frag);

    host.replaceChildren(frag);
    console.log(`Loaded ${file} into #${id}`);

    // Per-partial post-load logic (idempotent)
    switch (id) {
      case "header": {
        // hero image swap (if present)
        const heroURL = host.getAttribute("data-hero");
        const heroImg = host.querySelector(".hero");
        if (heroImg && heroURL) heroImg.src = heroURL;

        await initUIOnce();

        // Emit readiness so burger wiring can happen after injection
        document.dispatchEvent(new CustomEvent("header:ready", { detail: { el: host } }));
        break;
      }

      case "events-rail": {
        if (!once(host, "railInited")) break;

        try {
          // Ensure module present
          if (!window.Rail?.init) {
            const mod = await import("/js/components/rail.js");
            // allow either default or named export to populate window.Rail
            if (!window.Rail) window.Rail = mod.default || mod;
          }

          // Try inline JSON
          const inline = host.querySelector("#events-data");
          if (inline) {
            try {
              const data = JSON.parse(inline.textContent.trim());
              if (Array.isArray(data) && data.length) {
                window.Rail?.setEvents?.(data);
                console.log(`[rail] Loaded ${data.length} events from inline JSON`);
              } else {
                console.warn("[rail] #events-data was empty or not an array");
              }
            } catch (e) {
              console.error("[rail] Invalid JSON in #events-data", e);
            }
          }

          await window.Rail?.init?.(host); // init rail for this section only
          await initUIOnce();

          document.dispatchEvent(new CustomEvent("rail:ready", { detail: { el: host } }));
        } catch (e) {
          console.error("[rail] init failed", e);
        }
        break;
      }

      case "contact-form": {
        await initUIOnce();

        const form = host.querySelector('form[action*="formsubmit.co"]');
        if (form && once(form, "ajaxWired")) {
          try {
            const forms = await import("/js/lib/forms.js");
            forms.attachAjaxToForm(form);
            document.dispatchEvent(new CustomEvent("contact:ready", { detail: { el: host, form } }));
          } catch (e) {
            console.error("[include] Failed to load forms.js", e);
          }
        }
        break;
      }

      case "footer": {
        await initUIOnce();
        try {
          const ui = await import("/js/app/ui.js");
          ui.setCurrentYear?.();
        } catch { /* optional */ }
        document.dispatchEvent(new CustomEvent("footer:ready", { detail: { el: host } }));
        break;
      }
    }
  };

  // --- boot sequence ----------------------------------------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const tasks = [
        include("header",       "/src/header.html"),
        include("events-rail",  "/src/rail.html"),
        include("contact-form", "/src/contact-form.html"),
        include("footer",       "/src/footer.html"),
        // login-modal intentionally removed
      ];

      await Promise.all(tasks);

      // All includes are now in the DOM; emit a global ready signal.
      document.dispatchEvent(new Event("includes:ready"));
      console.log("[include] all includes ready");
    } catch (err) {
      console.error("[include] boot error:", err);
    }
  });
})();
