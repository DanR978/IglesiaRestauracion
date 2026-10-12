// js/lib/analytics.js
// ─────────────────────────────────────────────────────────────────────────────
// Site-wide visitor analytics. Two independent trackers:
//
//   1. Google Analytics 4 (GA4) — page views into the GA property.
//   2. First-party, cookieless beacons to the `track` Edge Function, which feed
//      the admin "Analíticas" tab (supabase/functions/track,
//      supabase/migrations/20261012_site_analytics.sql). No cookies, no
//      storage id — the function derives an anonymous daily visitor hash.
//
// Loaded in the <head> of every PUBLIC page (build-heads.mjs injects it; the
// pages without a BUILD-HEAD include it by hand). The /admin panel is
// intentionally NOT tagged, so staff activity never skews the visitor numbers.
//
// Beyond page views, the first-party tracker records:
//   • time actually spent on the page (visible tab only) + max scroll depth
//   • clicks on tel: / mailto: / WhatsApp / maps / outbound links / downloads
//   • conversions dispatched by page modules through js/lib/track.js
//   • 404s (404.html includes this script with data-not-found)
//
// Usage: <script defer src="/js/lib/analytics.js"></script>
//        add data-no-ga to load only the first-party tracker
// Opt a browser out (e.g. staff): localStorage['ird.analytics.optout'] = '1'
// — the admin Analíticas tab has a button for it.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // Some pages include this script twice; run once.
  var root = document.documentElement;
  if (root.hasAttribute('data-ird-analytics')) return;
  root.setAttribute('data-ird-analytics', '');

  var tag = document.currentScript;
  var notFound = !!(tag && tag.hasAttribute('data-not-found'));
  // Pages that never had GA (the event pages, the registration form that
  // collects minors' details, 404) opt out of the third-party tracker and get
  // only the first-party beacon, which carries the path and title — never
  // form contents.
  var noGa = !!(tag && tag.hasAttribute('data-no-ga'));

  // ── 1. GA4 ────────────────────────────────────────────────────────────────
  var GA_ID = 'G-GXK6QZWMC9';
  if (GA_ID && !noGa) {
    var lib = document.createElement('script');
    lib.async = true;
    lib.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(lib);

    window.dataLayer = window.dataLayer || [];
    var gtag = function () { window.dataLayer.push(arguments); };
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  // ── 2. First-party beacons ────────────────────────────────────────────────
  var ENDPOINT = 'https://snqwxgyhfiinouewxgiy.supabase.co/functions/v1/track';

  function optedOut() {
    try { return localStorage.getItem('ird.analytics.optout') === '1'; } catch (_) { return false; }
  }
  // Production hosts only, so `npm run dev` never pollutes the numbers.
  if (!/(^|\.)irdlex\.org$/.test(location.hostname)) return;
  if (navigator.webdriver || optedOut()) return;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // text/plain is CORS-safelisted, so neither path triggers a preflight.
  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch (_) { /* fall through */ }
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' } });
    } catch (_) { /* analytics must never break the page */ }
  }

  function device() {
    var w = Math.min(screen.width || 0, screen.height || 0) || window.innerWidth;
    var touch = navigator.maxTouchPoints > 0;
    if (touch && w < 600) return 'mobile';
    if (touch && w < 1100) return 'tablet';
    return 'desktop';
  }

  var pageId = uuid();
  var path = location.pathname + location.search;

  // Engaged time counts only while the tab is visible.
  var engagedMs = 0;
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  var maxScroll = 0;

  function scrollPct() {
    var el = document.documentElement;
    var max = el.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 100;
  }

  function sendPageview() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { /* old browser */ }
    send({
      t: 'pageview', id: pageId, p: path, ti: document.title, r: document.referrer,
      nf: notFound, dv: device(), lg: navigator.language || '', tz: tz,
    });
  }

  function flushEngagement() {
    if (visibleSince) { engagedMs += Date.now() - visibleSince; visibleSince = 0; }
    maxScroll = Math.max(maxScroll, scrollPct());
    send({ t: 'engage', id: pageId, ms: engagedMs, sc: maxScroll, ti: document.title });
  }

  function track(name, label) {
    send({ t: 'event', id: uuid(), p: path, n: name, l: label ? String(label).slice(0, 200) : '' });
  }

  // A prerendered page that is never shown isn't a visit.
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', sendPageview, { once: true });
  } else {
    sendPageview();
  }

  window.addEventListener('scroll', function () {
    maxScroll = Math.max(maxScroll, scrollPct());
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushEngagement();
    else visibleSince = Date.now();
  });
  window.addEventListener('pagehide', function () {
    if (document.visibilityState === 'visible') flushEngagement();
  });

  // Conversions from page modules (js/lib/track.js).
  document.addEventListener('ird:track', function (e) {
    var d = e.detail || {};
    if (d.name) track(d.name, d.label);
  });

  // Outbound / contact clicks, via one delegated listener.
  var DOWNLOAD = /\.(pdf|docx?|xlsx?|pptx?|zip|ics|mp3|mp4)$/i;
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^tel:/i.test(href)) return track('call', href.slice(4));
    if (/^mailto:/i.test(href)) return track('email', href.slice(7).split('?')[0]);

    var url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    var host = url.hostname.replace(/^www\./, '');
    if (/^(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)$/.test(host)) return track('whatsapp', host);
    if (/(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.indexOf('/maps') === 0) return track('directions', 'Google Maps');
    if (host === 'maps.apple.com' || host === 'maps.app.goo.gl') return track('directions', host);
    if (DOWNLOAD.test(url.pathname)) return track('download', url.pathname.split('/').pop());
    if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) track('outbound', host);
  }, true);
})();
