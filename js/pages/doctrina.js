// js/pages/doctrina.js  (ES module)
// Accordion toggle + reading progress bar for the Doctrina page.

(() => {
  function initAccordion() {
    document.querySelectorAll('.doctrina-accordions .accordion-faq__question').forEach(btn => {
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';

        // Close all others
        document.querySelectorAll('.doctrina-accordions .accordion-faq__question').forEach(b => {
          b.setAttribute('aria-expanded', 'false');
          b.nextElementSibling?.classList.remove('open');
        });

        // Toggle clicked
        if (!expanded) {
          btn.setAttribute('aria-expanded', 'true');
          btn.nextElementSibling?.classList.add('open');
        }
      });
    });
  }

  function initProgressBar() {
    const bar = document.getElementById('readProgress');
    if (!bar) return;

    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      bar.style.width = pct + '%';
    }, { passive: true });
  }

  // Wire up after includes finish (header/footer injected)
  document.addEventListener('includes:ready', () => {
    initAccordion();
    initProgressBar();
  });
})();