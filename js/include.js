// include.js (ES module) — robust, self-contained includes
document.addEventListener("DOMContentLoaded", () => {

  const include = async (id, file) => {
    const el = document.getElementById(id);
    if (!el) return;

    try {
      const res = await fetch(file, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch ${file}`);
      el.innerHTML = await res.text();
      console.log(`Loaded ${file} into #${id}`);

      // HEADER
      if (id === "header") {
        const heroURL = el.getAttribute("data-hero");
        const heroImg = el.querySelector(".hero");
        if (heroImg && heroURL) heroImg.src = heroURL;

        // optional animations if you use them
        try {
          const ui = await import("/js/app/ui.js");
          ui.initAnimations?.();
        } catch {}
      }

      // EVENTS RAIL
      if (id === "events-rail") {
        try {
          // 1) Ensure the rail module is available
          if (!window.Rail?.init) {
            await import('/js/components/rail.js'); // adjust path if your file lives elsewhere
          }

          // 2) Parse the inline JSON inside this injected section and give it to the rail
          const inline = el.querySelector('#events-data');
          if (inline) {
            try {
              const data = JSON.parse(inline.textContent.trim());
              if (Array.isArray(data) && data.length) {
                window.Rail?.setEvents?.(data); // <- guarantees loadEvents() will get data
                console.log(`[rail] Loaded ${data.length} events from inline JSON`);
              } else {
                console.warn('[rail] Inline #events-data found but empty/not an array');
              }
            } catch (e) {
              console.error('[rail] Invalid JSON in #events-data', e);
            }
          } else {
            console.warn('[rail] No #events-data found in /src/rail.html');
          }

          // 3) Initialize the rail just for this injected section
          await window.Rail.init(el);

          // 4) Optional: kick animations + dispatch ready event
          if (typeof initAnimations === 'function') initAnimations();
          document.dispatchEvent(new CustomEvent('rail:ready', { detail: { el } }));
          el.dataset.railInited = 'true';
        } catch (e) {
          console.error('[rail] init failed', e);
        }
      }


      // CONTACT FORM (FormSubmit AJAX + toast + captcha)
      if (id === "contact-form") {
        try {
          const ui = await import("/js/app/ui.js");
          ui.initAnimations?.();
        } catch {}

        // Immediately wire any injected form
        const form = el.querySelector('form[action*="formsubmit.co"]');
        if (form) {
          try {
            const forms = await import("/js/lib/forms.js");
            forms.attachAjaxToForm(form);
            document.dispatchEvent(new CustomEvent("contact:ready", { detail: { el } }));
          } catch (e) {
            console.error("[include] Failed to load forms.js", e);
          }
        }
      }

      // FOOTER (set current year)
      if (id === "footer") {
        try {
          const ui = await import("/js/app/ui.js");
          ui.initAnimations?.();
          ui.setCurrentYear?.();
        } catch (e) {
          console.warn("setCurrentYear/initAnimations not available", e);
        }
      }

      // LOGIN MODAL (local static auth test)
      // inside include() right after el.innerHTML = html ... 
      if (id === "login-modal") {
        const root  = el;
        const modal = root.querySelector("#loginModal");

        if (!modal) {
          console.warn("[include] #localLoginModal not found inside login-modal include.");
        } else {
          // baseline a11y attributes
          modal.hidden = true;
          modal.setAttribute("aria-hidden", "true");
          modal.setAttribute("aria-modal", "true");
          if (!modal.hasAttribute("role"))     modal.setAttribute("role", "dialog");
          if (!modal.hasAttribute("tabindex")) modal.setAttribute("tabindex", "-1");
        }

        // avoid double init if this include runs more than once
        if (!root.dataset.loginInited) {
          // load the controller (or reuse if already present)
          const ensureLM = window.LoginModal
            ? Promise.resolve(window.LoginModal)
            : import("/js/components/login-modal.js").then(m => (window.LoginModal = m?.default || m));

          ensureLM.then(LM => {
            LM?.init?.(el); // pass the include root that contains #localLoginModal
            LM?.setupStaticAuth?.({
              username: 'admin@irdlex.org',
              password: 'LetMeIn123'
            });
            console.log('[include] login-modal.js loaded & initialized');
          }).catch(e => console.error('[include] Failed to load/initialize login-modal.js', e));
        }

        // let others know the modal markup is in the DOM
        document.dispatchEvent(new CustomEvent("loginmodal:ready", { detail: { el: root, modal } }));
      }
    } catch (err) {
      console.error("[include] error:", err);
    }
  };

  // Load partials
  include("header",        "/src/header.html");
  include("events-rail",   "/src/rail.html");
  include("contact-form",  "/src/contact-form.html");
  include("footer",        "/src/footer.html");
  include("login-modal",   "/src/login-modal.html");
});
