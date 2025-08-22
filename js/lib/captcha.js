// captcha-modal.js
export function runCodeCaptchaModal() {
  return new Promise((resolve) => {
    // --- utils
    const genCode = (len = 6) => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
      let out = '';
      for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
      return out;
    };
    const normalize = (s) => (s || '').replace(/\s+/g, '').toUpperCase();

    // --- DOM
    const bd = document.createElement('div');
    bd.className = 'cap-backdrop';

    const md = document.createElement('div');
    md.className = 'cap-modal';

    md.innerHTML = `
      <div class="cap-header">
        <h3 class="cap-title">Verificación rápida</h3>
        <button class="cap-close" type="button" aria-label="Cerrar">×</button>
      </div>

      <div class="cap-body">
        <div class="cap-container">
          <header class="cap-hdr">Captcha</header>

          <div class="cap-field cap-display">
            <input class="cap-code" type="text" value="" aria-label="Código generado" disabled />
            <button class="cap-refresh" type="button" title="Refrescar">
              ⟲
            </button>
          </div>

          <div class="cap-field cap-input">
            <input class="cap-enter" type="text" inputmode="latin" autocomplete="off"
                   autocapitalize="characters" spellcheck="false"
                   placeholder="Ingresa el código" aria-label="Ingresa el código" />
          </div>

          <div class="cap-msg" aria-live="polite"></div>

          <div class="cap-actions">
            <button class="ird-btn" type="button" data-cancel>Cancelar</button>
            <button class="ird-btn ird-btn--teal" type="button" data-accept disabled>Confirmar</button>
          </div>
        </div>
      </div>
    `;

    // refs
    const closeBtn = md.querySelector('.cap-close');
    const cancelBtn = md.querySelector('[data-cancel]');
    const acceptBtn = md.querySelector('[data-accept]');

    const codeBox   = md.querySelector('.cap-code');
    const refreshBt = md.querySelector('.cap-refresh');
    const enterBox  = md.querySelector('.cap-enter');
    const msg       = md.querySelector('.cap-msg');

    // state
    let code = '';

    // behaviors
    const showCode = () => {
      code = genCode(6);
      // Add spacing for visual distortion
      codeBox.value = code.split('').join('   ');
      enterBox.value = '';
      setEnabled(false);
      setMsg('');
    };

    const setMsg = (text, ok = false) => {
      msg.textContent = text || '';
      msg.classList.toggle('active', !!text);
      msg.classList.toggle('ok', !!ok);
      msg.classList.toggle('err', !!text && !ok);
    };

    const setEnabled = (on) => {
      acceptBtn.disabled = !on;
      acceptBtn.classList.toggle('enabled', !!on);
    };

    const maybeValidate = () => {
      const good = normalize(enterBox.value) === normalize(code);
      setEnabled(good);
      if (enterBox.value.length) {
        setMsg(good ? 'Código correcto.' : 'Código incorrecto. Vuelve a intentarlo.', good);
      } else {
        setMsg('');
      }
    };

    // cleanup & focus trap
    let lastFocus = document.activeElement;
    const onEsc = (e) => { if (e.key === 'Escape') cleanup(false); };
    const trapFocus = (e) => {
      if (!md.contains(e.target)) {
        e.stopPropagation();
        (md.querySelector('.cap-enter') || md).focus();
      }
    };

    const cleanup = (ok) => {
      bd.classList.remove('show');
      md.addEventListener('transitionend', () => bd.remove(), { once: true });
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('focusin', trapFocus);
      try { lastFocus?.focus?.(); } catch {}
      resolve(!!ok);
    };

    // wire
    refreshBt.addEventListener('click', showCode);
    enterBox.addEventListener('input', maybeValidate);
    enterBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !acceptBtn.disabled) cleanup(true);
    });

    acceptBtn.addEventListener('click', () => cleanup(true));
    cancelBtn.addEventListener('click', () => cleanup(false));
    closeBtn.addEventListener('click', () => cleanup(false));
    bd.addEventListener('click', (e) => { if (e.target === bd) cleanup(false); });

    document.addEventListener('keydown', onEsc);
    document.addEventListener('focusin', trapFocus);

    // mount
    bd.appendChild(md);
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('show'));

    // init
    showCode();
    enterBox.focus();
  });
}

export default { runCodeCaptchaModal };
