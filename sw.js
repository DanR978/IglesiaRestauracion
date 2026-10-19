// sw.js — Iglesia Restauración Divina service worker.
//
// Strategy:
//   • Pre-cache a minimal app shell on install (homepage + global CSS + boot JS
//     + header/footer fragments) so the site loads when offline.
//   • Network-first for HTML so navigations always try fresh content; fall back
//     to the cached version (and ultimately the cached homepage) when offline.
//   • Stale-while-revalidate for same-origin static assets (CSS, JS, images).
//   • Pass-through (no SW involvement) for cross-origin: Supabase, YouTube,
//     Google Fonts, cdnjs. Browser HTTP cache handles those.
//
// Bumping CACHE_VERSION invalidates everything on the next install.

const CACHE_VERSION = 'ird-v12';
const CACHE_NAME    = `ird-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/css/style.css',
  '/js/main.js',
  '/js/include.js',
  '/js/utils/load-icons.js',
  '/js/app/scroll-reveal.js',
  '/resources/icons/icons.svg',  // SVG sprite — footer logo + <use> icons
  '/src/header.html',
  '/src/footer.html',
];

// Same-origin paths we should never touch: both admins use live Supabase + auth.
const SKIP_PATHS = [/^\/admin(\/|$)/, /^\/app\/admin(\/|$)/, /^\/sw\.js$/, /^\/manifest\.json$/];
// Everything an admin page loads (its own and the shared modules) comes from the
// network, so a fresh admin module never links against a stale shared one and the
// auth gate never runs from cache.
const ADMIN_PAGE = /^\/(app\/)?admin(\/|$)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // `cache: 'reload'` so the SW pre-cache pulls fresh copies, not stale HTTP-cache hits.
      cache.addAll(APP_SHELL.map(u => new Request(u, { cache: 'reload' })))
        // If one shell asset fails, don't abort the whole install.
        .catch(err => console.warn('[sw] shell precache partial:', err.message))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin: let the browser handle it directly.
  if (url.origin !== self.location.origin) return;

  // Admin + sentinels: never intercept.
  if (SKIP_PATHS.some(re => re.test(url.pathname))) return;
  if (event.clientId) {
    event.respondWith((async () => {
      const client = await self.clients.get(event.clientId);
      if (client && ADMIN_PAGE.test(new URL(client.url).pathname)) return fetch(req);
      return handle(event, req, url);
    })());
    return;
  }
  return handle(event, req, url, true);
});

// The public-page strategies. `direct` = no wrapping respondWith yet.
function handle(event, req, url, direct = false) {
  const respond = (p) => (direct ? event.respondWith(p) : p);

  // HTML navigations: network-first, fall back to cache, then homepage shell.
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    return respond(
      fetch(req)
        .then(resp => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return resp;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match('/'))
        )
    );
  }

  // Critical render assets — the global stylesheet and the shared HTML
  // fragments (header/footer). Network-first so a new deploy's styles/markup
  // appear on the very first load, with the cache as the offline fallback.
  // (Stale-while-revalidate would paint the previous deploy's CSS first and
  // only update on the *next* navigation — a visible flash of stale styling.)
  if (url.pathname === '/css/style.css' || url.pathname.startsWith('/src/')) {
    return respond(
      fetch(req)
        .then(resp => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match(req))
    );
  }

  // Other static assets: stale-while-revalidate.
  return respond(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(resp => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
}

// Allow the page to nudge a waiting SW to activate immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
