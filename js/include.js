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
