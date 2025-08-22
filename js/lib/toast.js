export function showToast(msg, { ok = true, ms = 2400 } = {}) {
  // Root
  const root =
    document.getElementById("toast-root") ||
    document.body.appendChild(
      Object.assign(document.createElement("div"), {
        id: "toast-root",
        "aria-live": "polite",
        "aria-atomic": "true",
      })
    );

  // Toast element
  const el = document.createElement("div");
  el.className = `toast ${ok ? "ok" : "err"}`;
  el.setAttribute("role", "status");

  // Message
  const text = document.createElement("p");
  text.className = "toast__msg";
  text.textContent = msg;

  // Close button with SVG X
  const btn = document.createElement("button");
  btn.className = "toast__close";
  btn.type = "button";
  btn.setAttribute("aria-label", "Cerrar");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" class="toast__icon" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <line x1="18" y1="6"  x2="6"  y2="18" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
    </svg>
  `;

  el.append(text, btn);
  root.appendChild(el);

  // ENTER: add .show (with optional paced delay via .delayed-enter)
  el.classList.add("show", "delayed-enter");

  // Auto-dismiss timer
  let closing = false;
  const timer = ms ? setTimeout(() => startExit(true), ms) : null;

  // Manual close: instant (no exit delay)
  btn.addEventListener("click", () => startExit(false), { passive: true });

  function startExit(isAuto) {
    if (closing) return;
    closing = true;
    if (timer) clearTimeout(timer);

    // Swap classes: remove enter, add exit
    el.classList.remove("show", "delayed-enter");
    el.classList.add("hide");

    // Auto-dismiss pauses before exit; manual closes immediately
    if (isAuto) {
      el.classList.add("delayed-hide");
      // ensure no inline delay overrides are present
      el.style.animationDelay = "";
    } else {
      el.classList.remove("delayed-hide");
      // guarantee no delay on click
      el.style.animationDelay = "0s";
    }

    // Remove node after exit animation completes
    const onAnimEnd = (e) => {
      if (e.target === el && el.classList.contains("hide")) {
        el.removeEventListener("animationend", onAnimEnd);
        el.remove();
      }
    };
    el.addEventListener("animationend", onAnimEnd);

    // Fallback to ensure cleanup on mobile if animationend is missed
    const cs = getComputedStyle(document.documentElement);
    const exitMs = parseTime(cs.getPropertyValue("--toast-exit-ms")) || 1000;
    const autoDelay = isAuto ? (parseTime(cs.getPropertyValue("--toast-exit-delay-auto")) || 0) : 0;
    setTimeout(() => {
      if (el.isConnected) {
        el.removeEventListener("animationend", onAnimEnd);
        el.remove();
      }
    }, exitMs + autoDelay + 100);
  }
}

// Helper: parse "123ms" or "0.2s" to milliseconds
function parseTime(v) {
  if (!v) return 0;
  const s = String(v).trim();
  if (s.endsWith("ms")) return parseFloat(s);
  if (s.endsWith("s"))  return parseFloat(s) * 1000;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

window.showToast = window.showToast || showToast;
export default { showToast };
