// /js/components/login-modal.js
(() => {
  const SELECTOR_TRIGGER = '#nav-login, [data-action="open-login"]';
  const MODAL_ID = 'loginModal';

  function getModal() {
    return document.getElementById(MODAL_ID)
        || document.querySelector(`#login-modal #${MODAL_ID}`);
  }

  function open() {
    const m = getModal();
    if (!m) { console.warn('[login-modal] modal not in DOM'); return; }
    m.hidden = false;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // focus
    const first = m.querySelector('input,button,[href],select,textarea,[tabindex]:not([tabindex="-1"])');
    (first || m).focus();

    // esc to close
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    m._esc = onEsc;
    document.addEventListener('keydown', onEsc);
  }

  function close() {
    const m = getModal();
    if (!m) return;
    m.hidden = true;
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (m._esc) { document.removeEventListener('keydown', m._esc); m._esc = null; }
  }

  // 1) Hash helper (Web Crypto API)
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 2) Your stored creds now keep ONLY the hash
  const storedCreds = {
    username: 'admin@irdlex.org',
    // SHA-256("CristoVive")
    passwordHash: 'f70b3a51c9c1923dd0e1ce1a42e5d46b6245b83b28d10c0c7c25048bac832034'
  };

  // 3) Wire up the form (now async so we can await hashing)
  async function wireForm() {
    const m = getModal();
    if (!m) return;

    const form = m.querySelector('#loginForm');
    const user = m.querySelector('#loginEmail');
    const pass = m.querySelector('#loginPassword');
    if (!form || form._wired) return;
    form._wired = true;

    // Prefer anything provided by window.LoginModal.creds, but expect passwordHash now
    const creds = (window.LoginModal?.creds && {
      username: window.LoginModal.creds.username ?? storedCreds.username,
      passwordHash: window.LoginModal.creds.passwordHash ?? storedCreds.passwordHash
    }) || storedCreds;

    // Accessibility / browser hints
    pass?.setAttribute('autocomplete', 'current-password');
    user?.setAttribute('autocomplete', 'email');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const u = (user?.value || '').trim();
      const p = pass?.value || '';

      // Hash what the user typed
      const pHash = await hashPassword(p);

      if (u === creds.username && pHash === creds.passwordHash) {
        window.Auth?.login?.({ admin: true });
        // Clear the plaintext from the input for good measure
        if (pass) pass.value = '';
        close();
      } else {
        window.showToast?.('Credenciales inválidas.', { ok: false });
      }
    });
  }


  function init() {
    // delegate trigger clicks so it works with injected header
    if (!document._loginTriggerBound) {
      document._loginTriggerBound = true;
      document.addEventListener('click', (e) => {
        const t = e.target.closest(SELECTOR_TRIGGER);
        if (!t) return;
        e.preventDefault();
        open();
      });
    }

    // close button + backdrop click
    const m = getModal();
    if (m && !m._wiredClose) {
      m._wiredClose = true;
      m.addEventListener('click', (e) => {
        if (e.target === m || e.target.matches('[data-close]')) close();
      });
    }

    wireForm();
    console.log('[login-modal] ready');
  }

  // Minimal Auth shim (keeps admin UI in sync)
  if (!window.Auth) {
    window.Auth = {
      login(data = { admin: true }) {
        document.body.classList.add('is-admin');
        localStorage.setItem('ird:isAdmin', '1');
        document.dispatchEvent(new CustomEvent('auth:login', { detail: data }));
      },
      logout() {
        document.body.classList.remove('is-admin');
        localStorage.removeItem('ird:isAdmin');
        document.dispatchEvent(new CustomEvent('auth:logout'));
      }
    };
  }

  // Public API
  window.LoginModal = {
    init,
    open,
    close,
    setupStaticAuth({ username, password }) {
      window.LoginModal.creds = { username, password };
    }
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
