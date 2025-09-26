(function () {
  const PHRASES = [
    "Cree en Jesús",
    "Arrepiéntete de tu pecado",
    "Recibe nueva vida",
    "Toma tu cruz",
    "Enamorate de el y síguelo"
  ];

  // Get real fade duration from your CSS (.animate-fade-in transition)
  function getFadeMs(el) {
    const cs = getComputedStyle(el);
    const props = cs.transitionProperty.split(",").map(s => s.trim());
    const durs  = cs.transitionDuration.split(",").map(s => s.trim());
    const idx   = props.findIndex(p => p === "opacity" || p === "all");
    const dur   = (durs[idx >= 0 ? idx : 0] || "1s").trim();
    return dur.endsWith("ms") ? parseFloat(dur) : parseFloat(dur) * 1000;
  }

  const span = document.getElementById("drawText");
  if (!span) return;

  const h2 = span.closest(".mission-title");

  // Tighter timings (feel free to tweak)
  let FADE = 0;   // will read from CSS
  const HOLD = 2000;  // time fully visible
  const GAP  = 50;   // small pause before next word

  let i = 0, started = false;

  function cycle() {
    span.textContent = PHRASES[i];

    // fade in using your .animate-fade-in + .visible
    // double-rAF prevents first-frame snapping
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        span.classList.add("visible");

        // after it's visible for FADE+HOLD, fade out then next
        setTimeout(() => {
          span.classList.remove("visible");
          setTimeout(() => {
            i = (i + 1) % PHRASES.length;
            setTimeout(cycle, GAP);
          }, FADE);
        }, FADE + HOLD);
      });
    });
  }

  function start() {
    if (started) return;
    started = true;
    // Ensure the base class is there and read fade duration
    span.classList.add("animate-fade-in");
    FADE = Math.max(getFadeMs(span), 16);
    cycle();
  }

  // Start when the H2 becomes visible via your IO, or fallback quickly
  if (!h2 || h2.classList.contains("visible")) {
    start();
  } else {
    const mo = new MutationObserver(() => {
      if (h2.classList.contains("visible")) {
        mo.disconnect(); start();
      }
    });
    mo.observe(h2, { attributes: true, attributeFilter: ["class"] });
    setTimeout(start, 800); // fallback if IO never fires
  }
})();
