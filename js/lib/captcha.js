// js/lib/captcha.js
// Human check shown before the public contact form sends: a dialog shows a
// 6-digit code and the visitor types it into one box per digit.
//
// The boxes are Zag's pin-input — focus movement, backspace, arrow keys, paste
// and per-box screen-reader labels come from a maintained library instead of
// hand-rolled focus juggling. It is fetched from the CDN on first use, never at
// import time: main.js imports this module on every public page.
//
// Both packages come from esm.sh, not jsDelivr: jsDelivr's +esm build of
// pin-input times out, and the two must share one @zag-js/core — esm.sh
// resolves both to the same core URL.
//
// This is a speed bump for drive-by bots, not a security boundary — the
// formsubmit endpoint is public and can be posted to directly.
//
// Usage:
//   import { runCodeCaptchaModal, preloadCodeCaptcha } from '/js/lib/captcha.js';
//   preloadCodeCaptcha();                        // optional: warm the CDN fetch
//   if (!(await runCodeCaptchaModal())) return;  // false = closed without verifying

import { html } from '/js/utils/escape.js';
import { loadingHtml, errorHtml } from '/js/components/states.js';

const CODE_LENGTH = 6;
const ZAG_VANILLA = 'https://esm.sh/@zag-js/vanilla@1.44.0';
const ZAG_PIN_INPUT = 'https://esm.sh/@zag-js/pin-input@1.44.0';

let _zag = null;

/** Start fetching the pin-input library. Safe to call repeatedly; retries after a failure. */
export function preloadCodeCaptcha() {
  _zag ??= Promise.all([import(ZAG_VANILLA), import(ZAG_PIN_INPUT)])
    .then(([vanilla, pinInput]) => ({ vanilla, pinInput }))
    .catch((e) => {
      _zag = null;
      throw e;
    });
  return _zag;
}

function genCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)), (n) => n % 10).join('');
}

// Renders the boxes into `slot` and keeps them in sync with the machine.
// Follows Zag's vanilla adapter contract: paint once so the ids exist, then
// subscribe, then start.
function mountPinInput(slot, { vanilla, pinInput }, props) {
  const { VanillaMachine, normalizeProps, spreadProps } = vanilla;

  slot.innerHTML = html`
    <div class="cap-pin">
      <div class="cap-pin__control">
        ${Array.from({ length: CODE_LENGTH }, () => html`<input class="cap-pin__box">`)}
      </div>
      <input class="cap-pin__hidden">
    </div>`;

  const root = slot.querySelector('.cap-pin');
  const control = root.querySelector('.cap-pin__control');
  const hidden = root.querySelector('.cap-pin__hidden');
  const boxes = [...root.querySelectorAll('.cap-pin__box')];

  const machine = new VanillaMachine(pinInput.machine, props);
  let api = pinInput.connect(machine.service, normalizeProps);

  const paint = () => {
    spreadProps(root, api.getRootProps());
    spreadProps(control, api.getControlProps());
    spreadProps(hidden, api.getHiddenInputProps());
    boxes.forEach((box, index) => spreadProps(box, api.getInputProps({ index })));
  };

  paint();
  machine.subscribe(() => {
    api = pinInput.connect(machine.service, normalizeProps);
    paint();
  });
  machine.start();

  return {
    clear: () => api.clearValue(),
    focus: () => api.focus(),
    setInvalid: (invalid) => machine.updateProps({ invalid }),
    stop: () => machine.stop(),
  };
}

export function runCodeCaptchaModal() {
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = 'cap-backdrop';

    bd.innerHTML = html`
      <div class="cap-modal" role="dialog" aria-modal="true"
           aria-labelledby="cap-title" aria-describedby="cap-desc">
        <button class="cap-close" type="button" aria-label="Cerrar">
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>

        <form class="cap-form" novalidate>
          <h2 class="cap-title" id="cap-title">Código de verificación</h2>
          <p class="cap-desc" id="cap-desc">
            Para confirmar que eres una persona, escribe este código:
          </p>

          <div class="cap-code">
            <span class="cap-code__digits"></span>
            <button class="cap-refresh" type="button" aria-label="Generar otro código" title="Generar otro código">
              <i class="fas fa-rotate-right" aria-hidden="true"></i>
            </button>
          </div>

          <div class="cap-pin-slot">${loadingHtml()}</div>

          <p class="cap-msg" aria-live="polite"></p>

          <button class="ird-btn ird-btn--teal cap-submit" type="submit" disabled>Enviar</button>
        </form>
      </div>`;

    const md = bd.querySelector('.cap-modal');
    const form = md.querySelector('.cap-form');
    const closeBtn = md.querySelector('.cap-close');
    const digitsEl = md.querySelector('.cap-code__digits');
    const refreshBtn = md.querySelector('.cap-refresh');
    const slot = md.querySelector('.cap-pin-slot');
    const msg = md.querySelector('.cap-msg');
    const submitBtn = md.querySelector('.cap-submit');

    let code = '';
    let verified = false;
    let pin = null;
    let closed = false;

    const setMsg = (text, ok = false) => {
      msg.textContent = text || '';
      msg.classList.toggle('ok', !!text && ok);
      msg.classList.toggle('err', !!text && !ok);
    };

    // Spaced digits so screen readers announce them one at a time.
    const showCode = () => {
      code = genCode();
      digitsEl.textContent = code.split('').join(' ');
      verified = false;
      submitBtn.disabled = true;
      setMsg('');
      pin?.setInvalid(false);
      pin?.clear();
      pin?.focus();
    };

    const check = (value) => {
      const complete = value.length === CODE_LENGTH;
      verified = complete && value === code;
      submitBtn.disabled = !verified;
      pin?.setInvalid(complete && !verified);
      if (!complete) setMsg('');
      else if (verified) setMsg('Código correcto.', true);
      else setMsg('Código incorrecto. Revisa los números.');
    };

    const onEsc = (e) => { if (e.key === 'Escape') cleanup(false); };
    const trapFocus = (e) => {
      if (!md.contains(e.target)) (md.querySelector('.cap-pin__box') || closeBtn).focus();
    };
    const lastFocus = document.activeElement;

    const cleanup = (ok) => {
      if (closed) return;
      closed = true;
      pin?.stop();
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('focusin', trapFocus);
      bd.classList.remove('show');
      // transitionend never fires when motion is reduced — the timer covers it.
      const remove = () => bd.remove();
      md.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 400);
      try { lastFocus?.focus?.(); } catch {}
      resolve(!!ok);
    };

    refreshBtn.addEventListener('click', showCode);
    closeBtn.addEventListener('click', () => cleanup(false));
    bd.addEventListener('click', (e) => { if (e.target === bd) cleanup(false); });
    // Enter on the last box lands here too: the pin-input requests a submit once complete.
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (verified) cleanup(true);
    });

    document.addEventListener('keydown', onEsc);
    document.addEventListener('focusin', trapFocus);

    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('show'));
    showCode();
    closeBtn.focus();

    preloadCodeCaptcha()
      .then((zag) => {
        if (closed) return;
        pin = mountPinInput(slot, zag, {
          id: 'contact-captcha',
          count: CODE_LENGTH,
          type: 'numeric',
          name: 'cap-code',
          placeholder: '',
          translations: { inputLabel: (i, n) => `Dígito ${i + 1} de ${n}` },
          onValueChange: ({ valueAsString }) => check(valueAsString),
        });
        pin.focus();
      })
      .catch((e) => {
        console.warn('[captcha] pin-input failed to load:', e);
        if (closed) return;
        slot.innerHTML = errorHtml('No se pudo cargar la verificación. Revisa tu conexión e inténtalo de nuevo.');
        refreshBtn.disabled = true;
      });
  });
}

export default { runCodeCaptchaModal };
