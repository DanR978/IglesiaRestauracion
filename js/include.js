document.addEventListener("DOMContentLoaded", () => {
  const include = async (id, file) => {
    const el = document.getElementById(id);
    if (!el) return;

    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`Failed to fetch ${file}`);
      const html = await res.text();
      el.innerHTML = html;
      console.log(`Loaded ${file} into #${id}`);

      if (id === "header") {
        const heroURL = el.getAttribute("data-hero");
        const heroImg = el.querySelector(".hero");
        if (heroImg && heroURL) {
          heroImg.setAttribute("src", heroURL);
        }
        if (typeof initAnimations === "function") initAnimations();
      }

      if (id === "contact-form") {
        if (typeof initAnimations === "function") initAnimations();

        // 🔗 Wire the form immediately after it’s injected
        const form = el.querySelector('form[action*="formsubmit.co"]');
        if (form && typeof attachAjaxToForm === 'function') {
          console.log('[contact] wiring form from include.js');
          attachAjaxToForm(form);
        }

        document.dispatchEvent(new CustomEvent('contact:ready', { detail: { el } }));
      }

      if (id === "footer") {
        if (typeof initAnimations === "function") initAnimations();

        if (typeof setCurrentYear === "function") {
          setCurrentYear();
        } else {
          console.warn("setCurrentYear is not defined");
        }
      }

      if (id === "events-rail") {
        // Avoid double-initialization if this gets injected again
        if (!el.dataset.railInited) {
          // Ensure the rail JS is available, then init just this injected section
          if (window.Rail?.init) {
            await window.Rail.init(el);
          } else {
            // Fallback: dynamic import if the script wasn't loaded yet
            try {
              await import('/js/rail.js');   // or './js/rail.js' if you prefer relative
              await window.Rail?.init(el);
            } catch (e) {
              console.error("Failed to load rail.js", e);
            }
          }

          el.dataset.railInited = "true";

          if (typeof initAnimations === "function") initAnimations();
          document.dispatchEvent(new CustomEvent('rail:ready', { detail: { el } }));
        }
      }

    } catch (err) {
      console.error(err);
    }
  };

  include("header", "./src/header.html");
  include("events-rail", "./src/rail.html");
  include("contact-form", "./src/contact-form.html");
  include("footer", "./src/footer.html");
});
