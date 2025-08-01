document.addEventListener("DOMContentLoaded", () => {
  const include = async (id, file) => {
    const el = document.getElementById(id);
    if (!el) return;

    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`Failed to fetch ${file}`);
      const html = await res.text();
      el.innerHTML = html;
      console.log(`✅ Loaded ${file} into #${id}`);

      // Set hero image
      if (id === "header") {
        const heroURL = el.getAttribute("data-hero");
        const heroImg = el.querySelector(".hero");
        if (heroImg && heroURL) {
          heroImg.setAttribute("src", heroURL);
        }

        // 🧠 Trigger animations AFTER header is inserted
        initAnimations();
      }

      // Optional: you can also trigger animations after footer if it has animated content
      if (id === "footer") {
        initAnimations();
      }

    } catch (err) {
      console.error(err);
    }
  };

  include("header", "./src/header.html");
  include("footer", "./src/footer.html");
  include("contact-form", "./src/contact-form.html");
});