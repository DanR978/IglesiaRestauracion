// js/app/scroll-reveal.js
// ─────────────────────────────────────────────────────────────────────────────
// Modern scroll reveal — observes any element with a `.scroll-fade-*` or
// `.scroll-blur-in` class and toggles `.is-visible` when it enters the
// viewport. Works for content that's already in the DOM AND for nodes that
// get added later (Supabase fetches, JS-rendered cards, etc.).
//
// Honors prefers-reduced-motion: we just mark everything visible immediately
// so screen readers / accessibility users get the content with no delay.
// ─────────────────────────────────────────────────────────────────────────────

const REVEAL_SELECTOR = [
  '.scroll-fade-up',
  '.scroll-fade',
  '.scroll-fade-left',
  '.scroll-fade-right',
  '.scroll-fade-scale',
  '.scroll-blur-in',
].join(',');

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function markVisible(el) { el.classList.add('is-visible'); }

function initScrollReveal() {
  // Reduced motion: reveal everything immediately and skip the observer.
  if (REDUCED) {
    document.querySelectorAll(REVEAL_SELECTOR).forEach(markVisible);
    return;
  }

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll(REVEAL_SELECTOR).forEach(markVisible);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      markVisible(entry.target);
      observer.unobserve(entry.target);
    }
  }, {
    root: null,
    // Trigger slightly before the element fully enters the viewport — gives
    // the animation a chance to play while the user is still scrolling.
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.12,
  });

  const observe = (root) => {
    const els = (root === document ? document : root).querySelectorAll(REVEAL_SELECTOR);
    els.forEach((el) => {
      if (!el.classList.contains('is-visible')) observer.observe(el);
    });
  };

  // Initial pass
  observe(document);

  // Pick up nodes added later (Supabase async content, infinite scrolls,
  // wizard panels, etc.) — same observer instance.
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(REVEAL_SELECTOR)) observer.observe(node);
        node.querySelectorAll?.(REVEAL_SELECTOR).forEach((el) => {
          if (!el.classList.contains('is-visible')) observer.observe(el);
        });
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollReveal);
} else {
  initScrollReveal();
}

export { initScrollReveal };
