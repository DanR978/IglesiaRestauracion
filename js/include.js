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
        initAnimations();
      }

      if (id === "contact-form") {
        initAnimations();

        // 🔗 Wire the form immediately after it’s injected
        const form = el.querySelector('form[action*="formsubmit.co"]');
        if (form && typeof attachAjaxToForm === 'function') {
          console.log('[contact] wiring form from include.js');
          attachAjaxToForm(form);
        }

        // optional event (kept if you want listeners)
        document.dispatchEvent(new CustomEvent('contact:ready', { detail: { el } }));
      }

      if (id === "footer") {
        initAnimations();

        if (typeof setCurrentYear === "function") {
          setCurrentYear();
        } else {
          console.warn("setCurrentYear is not defined");
        }
      }

    } catch (err) {
      console.error(err);
    }
  };

  include("header", "./src/header.html");
  include("contact-form", "./src/contact-form.html");
  include("footer", "./src/footer.html");
});
