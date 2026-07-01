// js/lib/pwa.js — PWA wiring: manifest link injection + service-worker
// registration (offline caching only). No promoted "Instalar app" button —
// users who want it can still install via the browser's own menu.
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

  // 4. No promoted install button. We still let the browser treat the site as
  //    installable (manifest + SW), but suppress the mini-infobar so nothing
  //    pops up unprompted; users install from the browser menu if they want to.
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); });
})();
