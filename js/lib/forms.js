import { showToast } from './toast.js';
import { runCodeCaptchaModal } from './captcha.js';   // <-- updated name
import { isValidEmail, isValidUSPhone, isValidName, normalizeUSPhone } from './validators.js';

export function setupMessageCounter(form, { minChars = 20, defaultMax = 300 } = {}) {
  const field = form.querySelector("#message");
  if (!field) return { minChars };
  if (!field.maxLength || field.maxLength < 1) field.maxLength = defaultMax;

  const parent = field.parentNode;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";

  const counter = document.createElement("div");
  Object.assign(counter.style, {
    position: "absolute", bottom: "6px", right: "10px",
    fontSize: "12px", color: "var(--color-black)", opacity: "0.8", pointerEvents: "none"
  });
  counter.textContent = `0 / ${field.maxLength}`;
  parent.appendChild(counter);

  const update = () => { counter.textContent = `${field.value.length} / ${field.maxLength}`; };
  field.addEventListener("input", update); update();
  return { minChars };
}

export function attachAjaxToForm(form) {
  if (!form || form.__wiredAjax) return;
  form.__wiredAjax = true;
  form.setAttribute("novalidate", "");

  let cap = form.querySelector('input[name="_captcha"]');
  if (!cap) { 
    cap = document.createElement("input"); 
    cap.type = "hidden"; 
    cap.name = "_captcha"; 
    form.appendChild(cap); 
  }
  cap.value = "false";

  if (!form.querySelector('input[name="_honey"]')) {
    const honey = document.createElement("input");
    honey.type = "text"; honey.name = "_honey"; honey.style.display = "none"; honey.tabIndex = -1;
    form.appendChild(honey);
  }

  const { minChars: MIN_MSG_CHARS = 20 } = setupMessageCounter(form) || {};
  let busy = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); if (busy) return;
    busy = true;

    const emailEl = form.querySelector('input[type="email"]');
    const phoneEl = form.querySelector('input[type="tel"]');
    const nameEl  = form.querySelector("#first-name");
    const msgEl   = form.querySelector("#message");

    const email = emailEl?.value || "";
    const phone = phoneEl?.value || "";
    const name  = nameEl?.value || "";
    const msg   = msgEl?.value || "";

    if (!isValidName(name))  { showToast("Nombre Invalido (minimo 3 Letras).", { ok:false }); busy=false; return; }
    if (!isValidUSPhone(phone)) { showToast("Teléfono invalido.", { ok:false }); busy=false; return; }
    if (!isValidEmail(email)) { showToast("E-mail inválido.", { ok:false }); busy=false; return; }
    if (msg.trim().length < MIN_MSG_CHARS) { showToast(`El mensaje debe tener al menos ${MIN_MSG_CHARS} caracteres.`, { ok:false }); busy=false; return; }

    const normalizedPhone = normalizeUSPhone(phone);
    if (!normalizedPhone) { showToast("El teléfono no es válido.", { ok:false }); busy=false; return; }
    if (phoneEl) phoneEl.value = normalizedPhone;

    // --- updated: use new captcha modal ---
    const human = await runCodeCaptchaModal();
    if (!human) { showToast("Verificación cancelada.", { ok:false }); busy=false; return; }

    const ajaxUrl = form.action.replace("https://formsubmit.co/", "https://formsubmit.co/ajax/");
    const body    = new FormData(form);

    try {
      const res  = await fetch(ajaxUrl, { method: "POST", headers: { Accept: "application/json" }, body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        showToast("¡Mensaje enviado! Gracias por contactarnos.", { ok: true });
        form.reset();
      } else {
        showToast("No se pudo enviar. Inténtalo de nuevo.", { ok: false });
      }
    } catch {
      showToast("Error de red. Revisa tu conexión.", { ok: false });
    } finally {
      busy = false;
    }
  });
}

export function observeContainer(root) {
  const immediate = root.querySelector('form[action*="formsubmit.co"]');
  if (immediate) attachAjaxToForm(immediate);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches?.('form[action*="formsubmit.co"]')) attachAjaxToForm(n);
        n.querySelectorAll?.('form[action*="formsubmit.co"]').forEach(attachAjaxToForm);
      });
    }
  });
  mo.observe(root, { childList: true, subtree: true });
  return mo;
}

export function initContactFormWiring() {
  const host = document.getElementById("contact-form") || document.body;
  observeContainer(host);
}

export default { setupMessageCounter, attachAjaxToForm, observeContainer, initContactFormWiring };
