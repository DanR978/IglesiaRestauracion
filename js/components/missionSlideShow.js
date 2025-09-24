(function () {
  // === CONFIG: match these to your existing CSS ===
  const IN_CLASS  = "animate-fade-in";   // your fade-in class
  const OUT_CLASS = "animate-fade-out";  // your fade-out class
  const VISIBLE   = "visible";           // your IO adds this when visible

  // Durations (ms) — set to your CSS transition times
  const FADE_IN_MS  = 1000;
  const FADE_OUT_MS = 1000;
  const HOLD_MS     = 6500;  // time the word stays fully visible
  const GAP_MS      = 7500;   // small pause before next word

  const PHRASES = [
    "Cree en Jesús",
    "Arrepiéntete del pecado",
    "Recibe nueva vida",
    "Toma tu cruz",
    "Síguelo"
  ];

  const span = document.getElementById("drawText");
  if (!span) return;

  const h2 = span.closest(".mission-title");

  let i = 0;
  let started = false;

  function fadeIn() {
    // ensure we're not in "out" state
    span.classList.remove(OUT_CLASS);
    // trigger reflow so the browser sees a state change
    void span.offsetWidth;
    // apply in state
    span.classList.add(IN_CLASS, VISIBLE);
  }

  function fadeOut() {
    // removing VISIBLE should make your fade-out class take effect
    span.classList.remove(VISIBLE, IN_CLASS);
    span.classList.add(OUT_CLASS);
  }

  function cycle() {
    // set next text
    span.textContent = PHRASES[i];

    // fade in
    fadeIn();

    // after it's visible for a bit, fade out, then queue next
    setTimeout(() => {
      fadeOut();
      setTimeout(() => {
        i = (i + 1) % PHRASES.length;
        setTimeout(cycle, GAP_MS);
      }, FADE_OUT_MS);
    }, FADE_IN_MS + HOLD_MS);
  }

  function start() {
    if (started) return;
    started = true;
    cycle();
  }

  // Start when the H2 becomes visible via your existing IntersectionObserver
  if (!h2 || h2.classList.contains(VISIBLE)) {
    start();
  } else {
    const mo = new MutationObserver(() => {
      if (h2.classList.contains(VISIBLE)) {
        mo.disconnect();
        start();
      }
    });
    mo.observe(h2, { attributes: true, attributeFilter: ["class"] });

    // Safety: if IO never fires, start anyway after a moment
    setTimeout(start, 1200);
  }
})();
