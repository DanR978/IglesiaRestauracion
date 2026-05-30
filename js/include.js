// /js/include.js  (ES module)
// Deterministic includes with retry + verification, no script re-exec.
// Adds: hero space reservation + hero preload/eager + initial scroll pin.

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

  // --- NEW: tame scroll restoration on initial load (not on hash/anchors)
  const pinScrollTopOnce = (() => {
    let done = false;
    return () => {
      if (done) return;
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      if (!location.hash) window.scrollTo(0, 0);
      done = true;
    };
  })();

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

    const candidates = [
      "./css/sections/events.css"
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

      const candidates = [
        "/js/components/events.js"
      ];

      const tried = [];
      for (const src of candidates) {
        tried.push(src);
        try {
          const mod = await import(/* @vite-ignore */ src);
          const api = mod?.default || mod || {};
          window.Rail = Object.assign(window.Rail || {}, api);
          if (window.Rail?.setEvents) {
            console.info("[events] renderer loaded:", src);
            return;
          }
        } catch { /* keep trying */ }
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

    // If the host already has element children, the content was inlined at
    // build time (scripts/inline-includes.mjs). Skip the network fetch — the
    // markup is already correct — but still run the lifecycle so dynamic
    // behavior (hero video, footer year, contact-form AJAX) wires up.
    if (host.firstElementChild === null) {
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
    }

    if (typeof lifecycle === "function") {
      await lifecycle(host);
    }
  }

  // --------- lifecycles ---------

  // NEW: preload the hero image ASAP (before we fetch header fragment)
  function preloadHeroFromDataset(headerMount) {
    if (!headerMount) return;
    const url = headerMount.getAttribute("data-hero");
    if (!url) return;

    // Reserve space immediately to avoid layout shifts even before CSS arrives
    if (!headerMount.style.minHeight) headerMount.style.minHeight = "100svh";

    // Preconnect + preload hero image
    try {
      const origin = new URL(url, location.href).origin;
      const preconnect = document.createElement("link");
      preconnect.rel = "preconnect";
      preconnect.href = origin;
      document.head.appendChild(preconnect);
    } catch {}

    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "image";
    preload.href = url;
    document.head.appendChild(preload);
  }

  async function onHeader(host) {
    const heroURL             = host.getAttribute("data-hero");
    const heroVideoDesktopURL = host.getAttribute("data-hero-video-desktop");
    const heroVideoMobileURL  = host.getAttribute("data-hero-video-mobile");
    // Back-compat: single `data-hero-video` still works (used on both desktop + mobile).
    const heroVideoFallbackURL = host.getAttribute("data-hero-video");
    const heroImg      = host.querySelector(".hero");
    const headerGrid   = host.querySelector(".header-grid");

    // Fill the reserved area
    if (!host.style.minHeight) host.style.minHeight = "100svh";

    // Set the hero IMAGE immediately and make it eager.
    // The image always loads — it's the poster + the fallback for when the
    // video can't play (reduced motion, slow network, codec missing).
    if (heroImg && heroURL) {
      heroImg.loading = "eager";
      heroImg.setAttribute("fetchpriority", "high");
      heroImg.src = heroURL;
    }

    // OPTIONAL hero video. Two flavors per viewport:
    //   data-hero-video-desktop="<full-quality mp4>"  → loaded on >1180px
    //   data-hero-video-mobile="<compressed mp4>"     → loaded on ≤1180px (phones + iPads)
    //   data-hero-video="<mp4>"                       → legacy single-URL fallback
    // The <video> is injected dynamically — pages without it pay nothing.
    // Threshold matches the mobile-nav breakpoint: anything that uses the
    // burger menu (phones + iPad mini/regular/Air, plus iPad Pro portrait)
    // also gets the smaller mobile video.
    const narrowViewport = window.matchMedia?.("(max-width: 1180px)").matches;
    const heroVideoURL =
      (narrowViewport ? heroVideoMobileURL : heroVideoDesktopURL) ||
      heroVideoFallbackURL ||
      (narrowViewport ? heroVideoDesktopURL : heroVideoMobileURL); // last-resort: whichever was set
    if (heroVideoURL && headerGrid && !headerGrid.querySelector(".hero-video")) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      // Still skip on save-data / 2G / 3G — even the mobile-optimized file is
      // tens of megabytes, and constrained connections shouldn't pay for it.
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const slowNetwork = !!conn && (
        conn.saveData === true ||
        /^(slow-2g|2g|3g)$/i.test(conn.effectiveType || "")
      );
      if (!reducedMotion && !slowNetwork) {
        // Defer injection until the page is idle so the video never competes
        // with critical resources (CSS, fonts, hero image). The poster image
        // shows immediately; the video fades in once everything else is ready.
        const injectHeroVideo = () => {
          const video = document.createElement("video");
          video.className = "hero-video";
          video.muted = true;
          video.autoplay = true;
          video.loop = true;
          video.playsInline = true;                         // iOS inline autoplay
          video.setAttribute("playsinline", "");
          video.setAttribute("webkit-playsinline", "");
          video.setAttribute("aria-hidden", "true");        // decorative
          video.preload = "auto";                           // we deferred — now fetch
          video.disablePictureInPicture = true;
          if (heroURL) video.poster = heroURL;

          // AV1 first (smallest, modern browsers), H.264 fallback (universal).
          // Convention: re-encoded sibling lives next to the .mp4 as `.av1.mp4`.
          const av1URL = heroVideoURL.replace(/\.mp4($|\?)/i, ".av1.mp4$1");
          if (av1URL !== heroVideoURL) {
            const av1 = document.createElement("source");
            av1.src = av1URL;
            av1.type = 'video/mp4; codecs="av01.0.05M.08"';
            video.appendChild(av1);
          }
          const source = document.createElement("source");
          source.src = heroVideoURL;
          source.type = "video/mp4";
          video.appendChild(source);

          // Legacy single-URL fallback — used if the per-viewport file doesn't
          // exist yet on the CDN (404). Most browsers fall through <source>
          // elements on network errors; the explicit `error` handler below
          // covers the few that don't (older Safari).
          if (heroVideoFallbackURL && heroVideoFallbackURL !== heroVideoURL) {
            const legacy = document.createElement("source");
            legacy.src = heroVideoFallbackURL;
            legacy.type = "video/mp4";
            video.appendChild(legacy);

            video.addEventListener("error", () => {
              if (video.dataset.heroFallbackTried) return;
              video.dataset.heroFallbackTried = "1";
              while (video.firstChild) video.removeChild(video.firstChild);
              const onlyFallback = document.createElement("source");
              onlyFallback.src = heroVideoFallbackURL;
              onlyFallback.type = "video/mp4";
              video.appendChild(onlyFallback);
              video.load();
            });
          }

          // Cross-fade the video in only once it's actually playing — until
          // then the poster image shows through with zero flash.
          video.addEventListener("playing", () => {
            video.classList.add("is-playing");
          }, { once: true });

          // Insert the video right after the .hero img so it paints on top
          // (both at z-index 0; later-in-DOM wins). The img stays in place
          // as the poster + fallback if the video fails.
          if (heroImg && heroImg.parentNode) {
            heroImg.parentNode.insertBefore(video, heroImg.nextSibling);
          } else {
            headerGrid.appendChild(video);
          }
        };

        if ("requestIdleCallback" in window) {
          requestIdleCallback(injectHeroVideo, { timeout: 2500 });
        } else {
          setTimeout(injectHeroVideo, 1500);
        }
      }
    }

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
      // NEW: avoid browser restoring scroll before we mount header
      pinScrollTopOnce();

      // NEW: preload hero from #header[data-hero] before fetching header fragment
      preloadHeroFromDataset(document.getElementById("header"));

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

      // NEW: ensure we start at the top after everything is mounted
      requestAnimationFrame(() => { if (!location.hash) window.scrollTo(0, 0); });

      await nextFrame();
      document.dispatchEvent(new Event("includes:ready"));

      // Optional: if you gate smooth scrolling with .ready
      document.documentElement.classList.add("ready");
    } catch (err) {
      console.error("[include] boot error:", err);
    }
  });
})();
