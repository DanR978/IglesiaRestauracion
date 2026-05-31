// js/lib/pwa.js — PWA wiring: manifest link injection, service-worker
// registration, optional custom "Instalar app" button.
//
// Loaded lazily from js/include.js so every public page gets it without
// touching individual HTML files. Admin pages are excluded (we skip
// registration on /admin* routes so the SW never caches authenticated state).

(() => {
  // Skip on the admin app — auth + Supabase live calls don't want caching here.
  if (location.pathname.startsWith('/admin')) return;

  // 1. Inject <link rel="manifest"> if not already present in the page.
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }

  // 2. Ensure a theme-color meta is present (Android Chrome status-bar tint).
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#2d4e57';
    document.head.appendChild(meta);
  }

  // 3. Register the service worker.
  if ('serviceWorker' in navigator) {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
    const isHttps = location.protocol === 'https:';
    if (isHttps || isLocalhost) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then(reg => {
            // Soft-notify on update; user gets new version on next nav.
            reg.addEventListener('updatefound', () => {
              const sw = reg.installing;
              sw?.addEventListener('statechange', () => {
                if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                  console.info('[pwa] Update ready; will activate on next visit.');
                }
              });
            });
          })
          .catch(err => console.warn('[pwa] SW registration failed:', err.message));
      });
    }
  }

  // 4. Custom install prompt — only when the browser fires beforeinstallprompt
  //    (Chrome/Edge on Android, Edge on desktop). iOS Safari doesn't fire it;
  //    those users install via the Share menu, so we don't show the button.
  let deferred = null;
  let dismissedThisSession = sessionStorage.getItem('ird-install-dismissed') === '1';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (!dismissedThisSession) showInstallButton();
  });

  // If already installed, never show.
  window.addEventListener('appinstalled', () => {
    deferred = null;
    document.getElementById('ird-install-fab')?.remove();
  });

  function showInstallButton() {
    if (document.getElementById('ird-install-fab')) return;

    // Self-contained styles so we don't depend on the bundled CSS having loaded.
    const css = `
      #ird-install-fab {
        position: fixed; left: 16px; bottom: 16px;
        z-index: 8000;
        display: inline-flex; align-items: center; gap: 0.55rem;
        padding: 0.7rem 1.1rem;
        background: #2d4e57; color: #fff;
        border: 0; border-radius: 999px;
        font: 600 0.88rem/1 var(--font-Signika, system-ui, sans-serif);
        letter-spacing: 0.04em;
        box-shadow: 0 10px 26px rgba(45, 78, 87, 0.32);
        cursor: pointer;
        animation: irdInstallIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      #ird-install-fab:hover { background: #c89858; }
      #ird-install-fab__close {
        all: unset; cursor: pointer;
        width: 22px; height: 22px;
        display: inline-flex; align-items: center; justify-content: center;
        border-radius: 50%; opacity: 0.7;
        font-size: 0.8rem;
      }
      #ird-install-fab__close:hover { opacity: 1; background: rgba(255,255,255,0.15); }
      @keyframes irdInstallIn {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: none; }
      }
      /* Hide above the mobile bottom action bar on phones so it doesn't collide */
      @media (max-width: 720px) {
        #ird-install-fab { bottom: calc(env(safe-area-inset-bottom, 0px) + 76px); }
      }
    `;
    const style = document.createElement('style');
    style.id = 'ird-install-fab-style';
    style.textContent = css;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'ird-install-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Instalar la aplicación');
    btn.innerHTML = `
      <i class="fas fa-mobile-screen-button" aria-hidden="true"></i>
      <span>Instalar app</span>
      <span id="ird-install-fab__close" role="button" aria-label="No mostrar más por ahora" tabindex="0">✕</span>
    `;

    btn.addEventListener('click', async (e) => {
      // Close (✕) handler — dismiss for this session only
      if (e.target.id === 'ird-install-fab__close') {
        sessionStorage.setItem('ird-install-dismissed', '1');
        btn.remove();
        return;
      }
      if (!deferred) return;
      deferred.prompt();
      try {
        const choice = await deferred.userChoice;
        console.info('[pwa] install outcome:', choice.outcome);
      } catch {}
      deferred = null;
      btn.remove();
    });

    document.body.appendChild(btn);
  }
})();
