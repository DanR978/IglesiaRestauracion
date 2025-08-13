export function runCheckboxCaptchaModal() {
  return new Promise((resolve) => {
    const bd = document.createElement("div");
    bd.className = "cap-backdrop";

    const md = document.createElement("div");
    md.className = "cap-modal";
    md.innerHTML = `
      <div class="cap-header">
        <h3 class="cap-title">Verificación rápida</h3>
        <button class="cap-close" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="cap-body">
        <div class="cap-row">
          <input id="cap-check" class="cap-checkbox" type="checkbox" />
          <label for="cap-check" class="cap-label">No soy un robot</label>
        </div>
        <p class="cap-note">Marcando esta casilla nos ayudas a evitar spam.</p>
        <div class="cap-actions">
          <button class="ird-btn" type="button" data-cancel style="font-size: 1rem; padding: 0; color: var(--color-black);">Cancelar</button>
          <button class="ird-btn ird-btn--teal" type="button" data-accept disabled style="font-size: 1rem; padding: 12px 18px;">Confirmar</button>
        </div>
      </div>
    `;

    const check  = md.querySelector("#cap-check");
    const accept = md.querySelector("[data-accept]");
    const cancel = md.querySelector("[data-cancel]");
    const close  = md.querySelector(".cap-close");

    function setEnabled(on) {
      accept.disabled = !on;
      accept.classList.toggle("enabled", !!on);
    }
    check.addEventListener("change", () => setEnabled(check.checked));

    function cleanup(ok) {
      bd.classList.remove("show");
      md.addEventListener("transitionend", () => bd.remove(), { once: true });
      document.removeEventListener("keydown", onEsc);
      resolve(!!ok);
    }
    function onEsc(e) { if (e.key === "Escape") cleanup(false); }

    bd.addEventListener("click", (e) => { if (e.target === bd) cleanup(false); });
    accept.addEventListener("click", () => cleanup(true));
    cancel.addEventListener("click", () => cleanup(false));
    close.addEventListener("click", () => cleanup(false));
    document.addEventListener("keydown", onEsc);

    bd.appendChild(md);
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add("show"));
    check.focus();
  });
}
export default { runCheckboxCaptchaModal };
