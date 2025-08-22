// /js/include.js  (ES module)
// Deterministic includes with retry + verification, no script re-exec.

(() => {
  const once = (node, key) => {
    if (!node) return false;
    if (node.dataset?.[key]) return false;
    if (node.dataset) node.dataset[key] = "1";
    return true;
  };
  const nextFrame = () => new Promise(r => requestAnimationFrame(r));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const emitReady = async (name, el) => { await nextFrame(); document.dispatchEvent(new CustomEvent(name, { detail: { el } })); };

  // 🔒 never re-run scripts from partials
  const reexecuteScripts = () => {};

  let uiInitDone = false;
  const initUIOnce = async () => {
    if (uiInitDone) return;
    try {
      const ui = await import("/js/app/ui.js");
      ui.initAnimations?.();
      uiInitDone = true;
    } catch {}
  };

  const ensureRail = (() => {
    let p;
    return () => (p ??= (async () => {
      if (!window.Rail?.init) {
        const mod = await import("/js/components/rail.js");
        if (!window.Rail) window.Rail = mod.default || mod;
      }
    })());
  })();

  async function fetchHTML(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) {
        lastErr = e;
        await sleep(120 * (i + 1)); // tiny backoff
      }
    }
    throw lastErr || new Error(`Failed to fetch ${url}`);
  }

  async function include(id, file, verify, lifecycle) {
    const host = document.getElementById(id);
    if (!host) return;

    // avoid double include if something calls twice
    if (!once(host, "included")) return;

    const html = await fetchHTML(file, 3);

    const frag = document.createRange().createContextualFragment(html);
    reexecuteScripts(frag);
    host.replaceChildren(frag);

    // verify critical element(s) exist; retry inject if needed
    if (typeof verify === "function") {
      let ok = verify(host);
      let attempts = 0;
      while (!ok && attempts < 2) { // at most 2 re-attempts
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

    // optional seed from inline JSON
    const inline = host.querySelector("#events-data");
    if (inline) {
      try {
        const data = JSON.parse(inline.textContent.trim());
        if (Array.isArray(data) && data.length) {
          window.Rail?.setEvents?.(data);
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

  // ---------- boot: strict sequence ----------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      // header
      await include(
        "header",
        "/src/header.html",
        (host) => !!host.querySelector("nav, header, .hero"),
        onHeader
      );

      // rail
      await include(
        "events-rail",
        "/src/rail.html",
        (host) => !!host.querySelector(".c-rail__track"),
        onRail
      );

      // contact
      await include(
        "contact-form",
        "/src/contact-form.html",
        (host) => !!host.querySelector('form[action*="formsubmit.co"]') || host.childElementCount > 0,
        onContactForm
      );

      // footer
      await include(
        "footer",
        "/src/footer.html",
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
