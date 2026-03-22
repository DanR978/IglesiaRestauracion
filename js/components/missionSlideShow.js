(function () {
  const PHRASES = [
    "Cree en Jesús",
    "Arrepiéntete de tu pecado",
    "Recibe nueva vida",
    "Toma tu cruz",
    "Síguelo"
  ];

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

  let FADE = 0;
  const HOLD = 2000
  const GAP  = 50; 

  let i = 0, started = false;

  function cycle() {
    span.textContent = PHRASES[i];

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        span.classList.add("visible");

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
    span.classList.add("animate-fade-in");
    FADE = Math.max(getFadeMs(span), 16);
    cycle();
  }

  if (!h2 || h2.classList.contains("visible")) {
    start();
  } else {
    const mo = new MutationObserver(() => {
      if (h2.classList.contains("visible")) {
        mo.disconnect(); start();
      }
    });
    mo.observe(h2, { attributes: true, attributeFilter: ["class"] });
    setTimeout(start, 800);
  }
})();
