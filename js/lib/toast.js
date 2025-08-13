export function showToast(msg, { ok = true, ms = 2400 } = {}) {
  const root =
    document.getElementById("toast-root") ||
    document.body.appendChild(
      Object.assign(document.createElement("div"), {
        id: "toast-root",
        "aria-live": "polite",
        "aria-atomic": "true",
      })
    );

  const el = document.createElement("div");
  el.className = `toast ${ok ? "ok" : "err"}`;
  el.setAttribute("role", "status");

  const text = document.createElement("p");
  text.className = "toast__msg";
  text.textContent = msg;

  const btn = document.createElement("button");
  btn.className = "toast__close";
  btn.type = "button";
  btn.setAttribute("aria-label", "Cerrar");
  btn.textContent = "×";

  el.append(text, btn);
  root.appendChild(el);

  requestAnimationFrame(() => el.classList.add("show"));

  const timer = ms ? setTimeout(remove, ms) : null;
  btn.addEventListener("click", remove);

  function remove() {
    if (timer) clearTimeout(timer);
    el.classList.remove("show");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }
}
window.showToast = window.showToast || showToast;
export default { showToast };
