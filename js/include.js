// COMPONENT LOAD IN HTML
document.addEventListener("DOMContentLoaded", () => {
  const include = async (selector, file) => {
    const res = await fetch(file);
    const html = await res.text();
    document.querySelector(selector).innerHTML = html;
  };

  include("header", "/src/header.html");
  include("footer", "/src/footer.html");
});
