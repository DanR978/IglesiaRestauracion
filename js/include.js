// /js/include.js  (ES module)
// Deterministic includes with retry + verification, no script re-exec.

(() => {
  // --------- helpers ---------
  const once = (node, key) => {
    if (!node) return false;
    if (node.dataset?.[key]) return false;
    node.dataset[key] = "1";
    return true;
  };
  const nextFrame = () => new Promise(r => requestAnimationFrame(r));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const emitReady = async (name, el) => { await nextFrame(); document.dispatchEvent(new CustomEvent(name, { detail: { el } })); };

  const reexecuteScripts = () => {}; // never re-run scripts from fragments

  let uiInitDone = false;
  const initUIOnce = async () => {
    if (uiInitDone) return;
    try {
      const ui = await import("/js/app/ui.js");
      ui.initAnimations?.();
      uiInitDone = true;
    } catch {}
  };

  // --------- assets: CSS + renderer with YOUR paths first ---------
  async function ensureEventsCSS() {
    const tried = [];
    const tryHref = async (href) => {
      tried.push(href);
      // already present?
      const has = [...document.querySelectorAll('link[rel="stylesheet"]')].some(l => {
        try { return new URL(l.href, location.href).pathname === new URL(href, location.href).pathname; } catch { return false; }
      });
      if (has) return true;

      return await new Promise((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.onload = () => resolve(true);
        link.onerror = () => { link.remove(); resolve(false); };
        document.head.appendChild(link);
      });
    };

    // Put your real path first
    const candidates = [
      "/css/sections/events.css",
      "/css/events.css",
      "/styles/events.css",
      "/assets/css/events.css",
      "/assets/events.css",
      "./css/sections/events.css",
      "./css/events.css",
    ];

    for (const href of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await tryHref(href)) {
        console.info("[events] CSS loaded:", href);
        return;
      }
    }
    console.warn("[events] CSS not found. Tried:", tried.join(", "));
  }

  const ensureRenderer = (() => {
    let p;
    return () => (p ??= (async () => {
      if (window.Rail?.setEvents) return;

      // Put your real path first
      const candidates = [
        "/js/app/events.js",
        "/js/events.js",
        "/js/components/events.js",
        "/assets/js/events.js",
        "./js/app/events.js",
        "./js/events.js",
      ];

      const tried = [];
      for (const src of candidates) {
        tried.push(src);
        try {
          const mod = await import(src);
          const api = mod?.default || mod || {};
          window.Rail = Object.assign(window.Rail || {}, api);
          if (window.Rail?.setEvents) {
            console.info("[events] renderer loaded:", src);
            return;
          }
        } catch {
          // keep trying
        }
      }
      console.warn("[events] renderer not found. Tried:", tried.join(", "));
    })());
  })();

  // --------- fetch/include core ---------
  async function fetchHTML(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) {
        lastErr = e;
        await sleep(120 * (i + 1));
      }
    }
    throw lastErr || new Error(`Failed to fetch ${url}`);
  }

  async function include(id, file, verify, lifecycle) {
    const host = document.getElementById(id);
    if (!host) return; // mount not on this page

    if (!once(host, "included")) return;

    const html = await fetchHTML(file, 3);
    const frag = document.createRange().createContextualFragment(html);
    reexecuteScripts(frag);
    host.replaceChildren(frag);

    if (typeof verify === "function") {
      let ok = verify(host);
      let attempts = 0;
      while (!ok && attempts < 2) {
        await sleep(100);
        host.replaceChildren(document.createRange().createContextualFragment(html));
        ok = verify(host);
        attempts++;
      }
      if (!ok) console.warn(`[include] verification failed for #${id} (${file})`);
    }

    if (typeof lifecycle === "function") {
      await lifecycle(host);
    }
  }

  // --------- lifecycles ---------
  async function onHeader(host) {
    const heroURL = host.getAttribute("data-hero");
    const heroImg = host.querySelector(".hero");
    if (heroImg && heroURL) heroImg.src = heroURL;

    await initUIOnce();
    await emitReady("header:ready", host);
  }

  async function initEventsIn(container) {
    await ensureEventsCSS();
    await ensureRenderer();

    // Optional inline seed
    const inline = container.querySelector?.("#events-data");
    if (inline) {
      try {
        const data = JSON.parse(inline.textContent.trim());
        if (Array.isArray(data) && data.length) window.Rail?.setEvents?.(data);
      } catch (e) {
        console.error("[events] invalid #events-data JSON", e);
      }
    }

    await window.Rail?.init?.(container);
    await initUIOnce();
    await emitReady("events:ready", container);
  }

  async function onEvents(host) {
    if (!once(host, "eventsInited")) return;
    await initEventsIn(host);
  }

  async function onContactForm(host) {
    await initUIOnce();
    const form = host.querySelector('form[action*="formsubmit.co"]');
    if (form && once(form, "ajaxWired")) {
      try {
        const forms = await import("/js/lib/forms.js");
        forms.attachAjaxToForm(form);
      } catch (e) {
        console.error("[include] Failed to load forms.js", e);
      }
    }
    await emitReady("contact:ready", host);
  }

  async function onFooter(host) {
    await initUIOnce();
    try {
      const ui = await import("/js/app/ui.js");
      ui.setCurrentYear?.();
    } catch {}
    await emitReady("footer:ready", host);
  }

  // --------- boot ---------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      // Header
      await include("header", "/src/header.html",
        (host) => !!host.querySelector("nav, header, .hero"),
        onHeader
      );

      // Homepage: limit 4
      await include("events-home", "/src/4-events.html",
        (host) => !!host.querySelector(".events__grid"),
        onEvents
      );

      // Events page: all upcoming
      await include("events-list", "/src/all-events.html",
        (host) => !!host.querySelector(".events__grid"),
        onEvents
      );

      // If a data-events section is already in the HTML, initialize it too
      document.querySelectorAll("[data-events]").forEach(sec => initEventsIn(sec));

      // Contact + Footer
      await include("contact-form", "/src/contact-form.html",
        (host) => !!host.querySelector('form[action*="formsubmit.co"]') || host.childElementCount > 0,
        onContactForm
      );

      await include("footer", "/src/footer.html",
        (host) => host.textContent.trim().length > 0,
        onFooter
      );

      await nextFrame();
      document.dispatchEvent(new Event("includes:ready"));
    } catch (err) {
      console.error("[include] boot error:", err);
    }
  });
})();
