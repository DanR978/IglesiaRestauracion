// js/app/floating-ui.js
// ─────────────────────────────────────────────────────────────────────────────
// Controls the visibility of the floating UI cluster (WhatsApp FAB + mobile
// bottom action bar). Behavior:
//
//   • On page load, both are HIDDEN (the hero owns the screen).
//   • Once the user scrolls past the hero (<header id="header">), both
//     reveal together with a smooth slide-in.
//   • If the user scrolls back to the hero, both re-hide.
//   • A small × on the WhatsApp FAB lets the user dismiss the whole cluster.
//     Dismissal persists in sessionStorage until the user taps the peek tab
//     to restore them. Clears on a fresh browser session.
//   • A small peek tab in the bottom-right corner appears while dismissed,
//     so the user can always recover.
//
// State classes on <body>:
//   .floating-ui--past-hero    → user has scrolled past the hero
//   .floating-ui--dismissed    → user explicitly dismissed the cluster
//
// The CSS rules that show/hide the FAB + bar live in floating-ui.css; this
// module only manages the classes.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ird-floating-dismissed';

/** Safe sessionStorage helpers — private-browsing / sandboxed iframes throw. */
function safeGet(key)        { try { return sessionStorage.getItem(key); }    catch (_) { return null; } }
function safeSet(key, value) { try { sessionStorage.setItem(key, value); }    catch (_) { /* noop */ } }
function safeRemove(key)     { try { sessionStorage.removeItem(key); }        catch (_) { /* noop */ } }

let _heroObserver = null;     // module-level so we can disconnect on re-init

export function initFloatingUI() {
  const body = document.body;
  const hero = document.getElementById('header');     // hero <header>
  const fab  = document.querySelector('.whatsapp-fab');
  const bar  = document.querySelector('.mobile-bar');

  // Nothing to do if neither floating element is on the page
  if (!fab && !bar) return;

  // Idempotent — if anything we previously installed is still there, this is
  // a re-init (e.g. async footer injection). Disconnect the old observer
  // before creating a new one to avoid duplicate listeners.
  if (_heroObserver) { _heroObserver.disconnect(); _heroObserver = null; }

  // ── Restore dismissed state from session ─────────────────────────────
  if (safeGet(STORAGE_KEY) === '1') body.classList.add('floating-ui--dismissed');

  // ── Inject the dismiss × on the FAB ──────────────────────────────────
  if (fab && !fab.querySelector('.floating-ui__dismiss')) {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'floating-ui__dismiss';
    dismiss.setAttribute('aria-label', 'Ocultar acciones rápidas');
    dismiss.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>
    </svg>`;
    dismiss.addEventListener('click', (e) => {
      // Stop the click from also opening WhatsApp
      e.preventDefault();
      e.stopPropagation();
      body.classList.add('floating-ui--dismissed');
      safeSet(STORAGE_KEY, '1');
    });
    fab.appendChild(dismiss);
  }

  // ── Inject the peek tab (only shown while dismissed) ─────────────────
  if (!document.querySelector('.floating-ui__peek')) {
    const peek = document.createElement('button');
    peek.type = 'button';
    peek.className = 'floating-ui__peek';
    peek.setAttribute('aria-label', 'Mostrar acciones rápidas');
    peek.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="6 15 12 9 18 15"/>
    </svg>`;
    peek.addEventListener('click', () => {
      body.classList.remove('floating-ui--dismissed');
      safeRemove(STORAGE_KEY);
    });
    body.appendChild(peek);
  }

  // ── Scroll-past-hero detection ───────────────────────────────────────
  // No hero on this page? Treat as "always past hero" so the cluster
  // shows immediately (interior pages without a hero element).
  if (!hero) {
    body.classList.add('floating-ui--past-hero');
    return;
  }

  if (!('IntersectionObserver' in window)) {
    // Fallback: just show them
    body.classList.add('floating-ui--past-hero');
    return;
  }

  _heroObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      // When the hero is no longer intersecting the viewport, the user has
      // scrolled past it → reveal floating UI. When it's back, hide them.
      body.classList.toggle('floating-ui--past-hero', !entry.isIntersecting);
    }
  }, {
    root: null,
    // A bit of negative top margin so the cluster appears slightly
    // *before* the hero is completely gone — feels more responsive.
    rootMargin: '-10% 0px 0px 0px',
    threshold: 0,
  });

  _heroObserver.observe(hero);
}

// Auto-init when DOM is ready (footer is included async via /js/include.js;
// the markup we need lives there, so we wait for `includes:ready` if present,
// otherwise DOMContentLoaded as a fallback).
function boot() { initFloatingUI(); }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Re-init after async footer injection in case our boot ran before include.js
document.addEventListener('includes:ready', boot, { once: true });
