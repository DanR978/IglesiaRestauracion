// External loaders (optional)
export function loadExternalScripts() {
  const jqueryScript = document.createElement("script");
  jqueryScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.4/jquery.min.js";
  jqueryScript.onload = () => {
    const bootstrapScript = document.createElement("script");
    bootstrapScript.src = "https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.2/js/bootstrap.bundle.min.js";
    document.head.appendChild(bootstrapScript);
  };
  document.head.appendChild(jqueryScript);
}

export function setCurrentYear() {
  const yearSpan = document.getElementById('currentYear');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}

export function setupBurgerMenu() {
  const burger = document.getElementById("burgerToggle");
  const nav    = document.getElementById("mainNav");
  if (!burger || !nav) return;

  /* ── Pane state ─────────────────────────────────────────────── */
  const closeAllSubmenus = () => {
    nav.classList.remove("has-open-submenu");
    nav.querySelectorAll(".menu-item.is-open").forEach(li => li.classList.remove("is-open"));
  };

  /* FLIP animation: smoothly morph the category label in the root pane into
     the section title at the top of the sub-pane. We measure the label's
     current position/size (First), open the sub-pane (Last), then play a
     short transform-only transition from First→Last on the title element. */
  const morphLabelToTitle = (li) => {
    if (!window.matchMedia("(max-width: 1180px)").matches) return;
    const label = li.querySelector(".accordion-toggle");
    if (!label) return;
    const submenu = li.querySelector(".submenu");
    const title = submenu?.querySelector(".submenu__title");
    if (!title) return;

    // Hide the chevron during morph so the animation is the text only
    const chev = label.querySelector(".chevron-icon");

    const startRect = label.getBoundingClientRect();
    const startFontSize = parseFloat(getComputedStyle(label).fontSize);

    // Force the sub-pane to its "open" state so we can read the title's
    // resting position. The CSS transition won't actually run yet because
    // the .has-open-submenu class hasn't been added — but we'll add it
    // next, on the same frame.
    submenu.classList.add("is-measuring");
    const endRect = title.getBoundingClientRect();
    const endFontSize = parseFloat(getComputedStyle(title).fontSize);
    submenu.classList.remove("is-measuring");

    // The title lives INSIDE .submenu, which itself slides in from
     // translateX(100%) → 0. At t=0 that pushes the title +panelWidth to the
     // right. To make the title visually start at the label's spot, undo
     // that initial submenu offset in our FLIP delta.
    const panelWidth = nav.offsetWidth;
    const dx = startRect.left - endRect.left - panelWidth;
    const dy = startRect.top  - endRect.top;
    const scale = startFontSize / endFontSize;

    // Apply the inverted transform so the title appears at the label's spot
    title.style.transformOrigin = "left top";
    title.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    title.style.color = getComputedStyle(label).color;
    title.style.letterSpacing = "0";
    title.style.transition = "none";

    if (chev) chev.style.opacity = "0";

    // Force layout flush, then play to the resting position on the next frame
    void title.offsetHeight;
    requestAnimationFrame(() => {
      title.style.transition = "transform 0.4s cubic-bezier(.22,.61,.36,1), color 0.4s ease, letter-spacing 0.4s ease";
      title.style.transform = "translate(0, 0) scale(1)";
      title.style.color = "";          // reverts to CSS rule
      title.style.letterSpacing = "";
    });

    // Cleanup after the animation
    const cleanup = (e) => {
      if (e.propertyName !== "transform") return;
      title.style.transition = "";
      title.style.transform = "";
      title.style.transformOrigin = "";
      title.style.color = "";
      title.style.letterSpacing = "";
      if (chev) chev.style.opacity = "";
      title.removeEventListener("transitionend", cleanup);
    };
    title.addEventListener("transitionend", cleanup);
  };

  const openSubmenu = (li) => {
    nav.querySelectorAll(".menu-item.is-open").forEach(other => other !== li && other.classList.remove("is-open"));
    // Kick off the label→title morph BEFORE adding the .is-open class so we
    // can measure the title's resting position in the same paint.
    morphLabelToTitle(li);
    li.classList.add("is-open");
    nav.classList.add("has-open-submenu");
  };

  /* ── Burger open/close ─────────────────────────────────────── */
  const open = () => {
    nav.classList.remove("closing");
    nav.classList.add("open");
    burger.classList.add("open");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Cerrar menú");
    document.body.classList.add("no-scroll");
  };

  const close = () => {
    // Remove .open immediately so the .nav actually transitions back out.
    // (The previous version waited for transitionend BEFORE removing .open
    // — which meant no transition ever started and the menu never closed.)
    nav.classList.remove("open");
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Abrir menú");
    document.body.classList.remove("no-scroll");

    // After the slide-out finishes, reset to the root pane for next open
    nav.addEventListener("transitionend", function handler(e) {
      if (e.propertyName === "transform" && e.target === nav) {
        closeAllSubmenus();
        nav.removeEventListener("transitionend", handler);
      }
    });
  };

  const toggle = () => nav.classList.contains("open") ? close() : open();
  burger.addEventListener("click", toggle);

  /* ── Inject the ← Atrás header into each submenu (once) ─────── */
  nav.querySelectorAll(".menu-item.has-submenu").forEach(item => {
    const toggleBtn = item.querySelector(".accordion-toggle");
    const submenu   = item.querySelector(".submenu");
    if (!toggleBtn || !submenu) return;
    if (submenu.querySelector(".submenu__head")) return;   // already done

    const label = toggleBtn.textContent.trim();
    const headerLi = document.createElement("li");
    headerLi.className = "submenu__head";
    headerLi.innerHTML = `
      <button type="button" class="submenu-back" aria-label="Volver atrás">
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
        <span>Atrás</span>
      </button>
      <span class="submenu__title">${label}</span>
    `;
    submenu.prepend(headerLi);
    headerLi.querySelector(".submenu-back")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllSubmenus();
    });
  });

  /* ── Category click on mobile → open sub-pane ──────────────── */
  nav.querySelectorAll(".menu-item.has-submenu .accordion-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
      if (window.innerWidth > 1180) return;     // desktop: hover handles dropdowns
      e.preventDefault();
      e.stopPropagation();
      openSubmenu(btn.closest(".menu-item"));
    });
  });

  /* ── Tapping a real link inside the panel closes the menu ──── */
  nav.addEventListener("click", (e) => {
    if (window.innerWidth > 1180) return;
    const a = e.target.closest("a");
    if (a && nav.classList.contains("open")) close();
  });

  /* ── ESC: go back if inside a sub-pane, otherwise close ────── */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !nav.classList.contains("open")) return;
    if (nav.classList.contains("has-open-submenu")) closeAllSubmenus();
    else close();
  });

  /* ── Reset everything when crossing the desktop breakpoint ─── */
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1180) {
      if (nav.classList.contains("open")) {
        nav.classList.remove("open", "closing");
        burger.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
        document.body.classList.remove("no-scroll");
      }
      closeAllSubmenus();
    }
  });
}

export function setupStickyNav({
  bgOn = 110,           // add .scrolled when > 110px
  bgOff = 80,           // remove .scrolled when < 80px (hysteresis)
  hideOnScroll = true,
  slideThreshold = 10   // start slide logic after a tiny nudge
} = {}) {
  const nav = document.querySelector('.nav-container');
  if (!nav) return;

  let lastY = window.scrollY;
  let ticking = false;
  let bgIsOn = false;

  // Background class with hysteresis (no CSS set via JS)
  const updateBg = (y) => {
    if (!bgIsOn && y > bgOn) {
      bgIsOn = true;
      nav.classList.add('scrolled');
    } else if (bgIsOn && y < bgOff) {
      bgIsOn = false;
      nav.classList.remove('scrolled');
    }
  };

  // Smooth hide/show on scroll direction
  const onScroll = () => {
    const y = window.scrollY;

    updateBg(y);

    if (hideOnScroll && y > slideThreshold) {
      if (y > lastY && y > slideThreshold + 100) {
        nav.classList.add('nav-hidden');      // scrolling down → hide
      } else if (y < lastY) {
        nav.classList.remove('nav-hidden');   // scrolling up → show
      }
    } else {
      nav.classList.remove('nav-hidden');     // near top → show
    }

    lastY = y;
    ticking = false;
  };

  const tick = () => {
    if (!ticking) {
      requestAnimationFrame(onScroll);
      ticking = true;
    }
  };

  // Initial state
  updateBg(window.scrollY);

  window.addEventListener('scroll', tick, { passive: true });

  // Keep things sane on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      nav.classList.remove('nav-hidden');
      updateBg(window.scrollY);
    }, 200);
  });
}

export function setupFAQAccordion() {
  const buttons = document.querySelectorAll('.accordion-faq__question');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const answer = button.nextElementSibling;
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', !isExpanded);
      answer.classList.toggle('open');
    });
  });
}

export function loadRandomVerse() {
  const url = "https://raw.githubusercontent.com/DanR978/IglesiaRestauracion/refs/heads/main/resources/verses/all-verses.json?nocache=" + new Date().getTime();
  fetch(url)
    .then(res => { if (!res.ok) throw new Error("No se pudo cargar el archivo JSON"); return res.json(); })
    .then(verses => {
      const index = Math.floor(Math.random() * verses.length);
      const verse = verses[index];
      const libros = {
        1:"Génesis",2:"Éxodo",3:"Levítico",4:"Números",5:"Deuteronomio",6:"Josué",7:"Jueces",8:"Rut",
        9:"1 Samuel",10:"2 Samuel",11:"1 Reyes",12:"2 Reyes",13:"1 Crónicas",14:"2 Crónicas",15:"Esdras",
        16:"Nehemías",17:"Ester",18:"Job",19:"Salmos",20:"Proverbios",21:"Eclesiastés",22:"Cantares",
        23:"Isaías",24:"Jeremías",25:"Lamentaciones",26:"Ezequiel",27:"Daniel",28:"Oseas",29:"Joel",
        30:"Amós",31:"Abdías",32:"Jonás",33:"Miqueas",34:"Nahúm",35:"Habacuc",36:"Sofonías",37:"Hageo",
        38:"Zacarías",39:"Malaquías",40:"Mateo",41:"Marcos",42:"Lucas",43:"Juan",44:"Hechos",45:"Romanos",
        46:"1 Corintios",47:"2 Corintios",48:"Gálatas",49:"Efesios",50:"Filipenses",51:"Colosenses",
        52:"1 Tesalonicenses",53:"2 Tesalonicenses",54:"1 Timoteo",55:"2 Timoteo",56:"Tito",57:"Filemón",
        58:"Hebreos",59:"Santiago",60:"1 Pedro",61:"2 Pedro",62:"1 Juan",63:"2 Juan",64:"3 Juan",
        65:"Judas",66:"Apocalipsis"
      };
      const cleanText = verse.text.replace(/\\n|\/n|\n/g, "<br>").replace(/["']/g, "").trim();
      const reference = `– ${libros[verse.book_id] || "Libro"} ${verse.chapter}:${verse.verse}`;
      const verseTextEl = document.getElementById("verse-text");
      const verseRefEl  = document.getElementById("verse-ref");
      if (verseTextEl && verseRefEl) {
        verseTextEl.innerHTML = `"${cleanText}"`;
        verseRefEl.innerText = reference;
      }
    })
    .catch(() => {
      const verseTextEl = document.getElementById("verse-text");
      const verseRefEl  = document.getElementById("verse-ref");
      if (verseTextEl) verseTextEl.innerText = "Error al cargar el versículo.";
      if (verseRefEl) verseRefEl.innerText = "";
    });
}

export function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });

  const observeTargets = () => {
    document.querySelectorAll('[class*="animate-"]:not(.visible)').forEach(el => observer.observe(el));
  };

  // initial pass
  observeTargets();

  // also watch DOM for new animate-* nodes
  const mo = new MutationObserver(observeTargets);
  mo.observe(document.body, { childList: true, subtree: true });
}

export function setupDirectionsButton({
  buttonId = "getDirections",
  destination = { lat: 38.014455, lon: -84.538253 },
  fallbackUrl = "https://www.google.com/maps?q=334+North+Broadway,+Lexington,+KY"
} = {}) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.addEventListener("click", () => {
    if (!navigator.geolocation) { window.open(fallbackUrl, "_blank"); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const url = isIOS
          ? `maps://maps.apple.com/?saddr=${latitude},${longitude}&daddr=${destination.lat},${destination.lon}`
          : `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destination.lat},${destination.lon}`;
        isIOS ? (window.location.href = url) : window.open(url, "_blank");
      },
      () => { alert("Unable to get your location. Opening default directions."); window.open(fallbackUrl, "_blank"); }
    );
  });
}
