import { showToast } from './toast.js';
import { runCodeCaptchaModal } from './captcha.js';   // <-- updated name
import { isValidEmail, isValidUSPhone, isValidName, normalizeUSPhone } from './validators.js';

// ── Accessible field errors ──────────────────────────────────────────────────
// Validation used to surface only a toast (and the toast live region was broken,
// so screen-reader users got nothing). Now each invalid field also gets
// aria-invalid + an inline role="alert" message wired via aria-describedby, and
// focus moves to the first offender. The toast stays as the visible summary.
function setFieldError(input, message) {
  if (!input) return;
  const group = input.closest('.form-group') || input.parentElement;
  let err = group.querySelector('.form-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'form-error';
    err.setAttribute('role', 'alert');
    err.id = `${input.id || input.name || 'field'}-error`;
    group.appendChild(err);
  }
  err.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', err.id);
}

function clearFieldError(input) {
  if (!input) return;
  input.removeAttribute('aria-invalid');
  const errId = input.getAttribute('aria-describedby');
  input.removeAttribute('aria-describedby');
  if (errId) document.getElementById(errId)?.remove();
}

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

  // Clear a field's error as soon as the user starts correcting it.
  form.addEventListener("input", (e) => {
    if (e.target.getAttribute?.("aria-invalid") === "true") clearFieldError(e.target);
  });

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

    // Validate everything, surface every error inline, focus the first offender.
    [nameEl, phoneEl, emailEl, msgEl].forEach(clearFieldError);
    const errors = [];
    if (!isValidName(name))                  errors.push([nameEl,  "Nombre inválido (mínimo 3 letras)."]);
    if (!isValidUSPhone(phone))              errors.push([phoneEl, "Teléfono inválido."]);
    if (!isValidEmail(email))                errors.push([emailEl, "Correo electrónico inválido."]);
    if (msg.trim().length < MIN_MSG_CHARS)   errors.push([msgEl,   `El mensaje debe tener al menos ${MIN_MSG_CHARS} caracteres.`]);
    if (errors.length) {
      errors.forEach(([el, m]) => setFieldError(el, m));
      errors[0][0]?.focus();
      showToast(errors[0][1], { ok:false });
      busy = false; return;
    }

    const normalizedPhone = normalizeUSPhone(phone);
    if (!normalizedPhone) { setFieldError(phoneEl, "El teléfono no es válido."); phoneEl?.focus(); showToast("El teléfono no es válido.", { ok:false }); busy=false; return; }
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
