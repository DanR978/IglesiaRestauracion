// js/lib/analytics.js
// ─────────────────────────────────────────────────────────────────────────────
// Google Analytics 4 (GA4) — site-wide page-view tracking.
//
// Loaded in the <head> of every PUBLIC page. The /admin panel is intentionally
// NOT tagged, so staff activity never skews the visitor numbers.
//
// Single source of truth: to change the property or disable tracking, edit
// GA_ID below — every page picks it up.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  var GA_ID = 'G-GXK6QZWMC9';
  if (!GA_ID) return;

  // Load the gtag.js library (async — never blocks the page).
  var lib = document.createElement('script');
  lib.async = true;
  lib.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(lib);

  // Standard gtag bootstrap.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);
})();
