// /js/include.js  (ES module)
// Deterministic, sequential partial loader with reliable readiness events.

(() => {
  // ---------- tiny helpers ----------
  const once = (node, key) => {
    if (!node) return false;
    if (node.dataset?.[key]) return false;
    if (node.dataset) node.dataset[key] = "1";
    return true;
  };
  const nextFrame = () => new Promise(r => requestAnimationFrame(r));
  const emitReady = async (name, el) => { await nextFrame(); document.dispatchEvent(new CustomEvent(name, { detail: { el } })); };

  // No script re-exec (partials must be markup-only)
  const reexecuteScripts = () => {};

  // Optional UI init (idempotent)
  let uiInitDone = false;
  const initUIOnce = async () => {
    if (uiInitDone) return;
    try {
      const ui = await import("/js/app/ui.js");
      ui.initAnimations?.();
      uiInitDone = true;
    } catch {}
  };

  // Ensure rail module is present exactly once
  const ensureRail = (() => {
    let p;
    return () => (p ??= (async () => {
      if (!window.Rail?.init) {
        const mod = await import("/js/components/rail.js");
        if (!window.Rail) window.Rail = mod.default || mod;
      }
    })());
  })();

  // ---------- core include ----------
  async function include(id, file, lifecycle) {
    const host = document.getElementById(id);
    if (!host) return;

    // Avoid double-including the same host if something recalls include()
    if (!once(host, "included")) return;

    // Fetch + inject
    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${file}`);
    const html = await res.text();
    const frag = document.createRange().createContextualFragment(html);
    reexecuteScripts(frag);
    host.replaceChildren(frag);
    // console.log(`Loaded ${file} into #${id}`);

    // Run per-part lifecycle hook (awaited)
    if (typeof lifecycle === "function") {
      await lifecycle(host);
    }
  }

  // ---------- lifecycles ----------
  async function onHeader(host) {
    const heroURL = host.getAttribute("data-hero");
    const heroImg = host.querySelector(".hero");
    if (heroImg && heroURL) heroImg.src = heroURL;

    await initUIOnce();
    await emitReady("header:ready", host);
  }

  async function onRail(host) {
    if (!once(host, "railInited")) return;

    await ensureRail();

    // If inline JSON exists, seed it
    const inline = host.querySelector("#events-data");
    if (inline) {
      try {
        const data = JSON.parse(inline.textContent.trim());
        if (Array.isArray(data) && data.length) {
          window.Rail?.setEvents?.(data);
          // console.log(`[rail] seeded ${data.length} events from inline JSON`);
        }
      } catch (e) {
        console.error("[rail] invalid #events-data JSON", e);
      }
    }

    await window.Rail?.init?.(host);
    await initUIOnce();
    await emitReady("rail:ready", host);
  }

  async function onContactForm(host) {
    await initUIOnce();
    const form = host.querySelector('form[action*="formsubmit.co"]');
    if (form && once(form, "ajaxWired")) {
      try {
        const forms = await import("/js/lib/forms.js");
        forms.attachAjaxToForm(form);
        await emitReady("contact:ready", host);
      } catch (e) {
        console.error("[include] Failed to load forms.js", e);
      }
    } else {
      await emitReady("contact:ready", host);
    }
  }

  async function onFooter(host) {
    await initUIOnce();
    try {
      const ui = await import("/js/app/ui.js");
      ui.setCurrentYear?.();
    } catch {}
    await emitReady("footer:ready", host);
  }

  // ---------- boot: strict sequence ----------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      // Load in deterministic order so dependents never race
      await include("header",       "/src/header.html",       onHeader);
      await include("events-rail",  "/src/rail.html",         onRail);
      await include("contact-form", "/src/contact-form.html", onContactForm);
      await include("footer",       "/src/footer.html",       onFooter);

      // Give layout one extra frame, then signal global ready
      await nextFrame();
      document.dispatchEvent(new Event("includes:ready"));
      // console.log("[include] all includes ready");
    } catch (err) {
      console.error("[include] boot error:", err);
    }
  });
})();
