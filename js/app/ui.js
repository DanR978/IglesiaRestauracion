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
  const burger    = document.getElementById("burgerToggle");
  const nav       = document.getElementById("mainNav");
  const menuItems = document.querySelectorAll(".menu-item.has-submenu");
  if (!burger || !nav) return;

  const resetMenu = () => { menuItems.forEach(i => i.classList.remove("open")); };

  const toggleNav = () => {
    if (!nav.classList.contains("open")) {
      nav.classList.add("open"); burger.classList.add("open"); document.body.classList.add("no-scroll");
    } else {
      nav.classList.add("closing"); burger.classList.remove("open"); document.body.classList.remove("no-scroll"); resetMenu();
      nav.addEventListener("transitionend", function handler(e) {
        if (e.propertyName === "transform") {
          nav.classList.remove("open", "closing");
          nav.removeEventListener("transitionend", handler);
        }
      });
    }
  };
  burger.addEventListener("click", toggleNav);

  document.querySelectorAll(".accordion-toggle").forEach(btn => {
    btn.addEventListener("click", e => {
      if (window.innerWidth > 768) return;
      e.preventDefault(); e.stopPropagation();
      const li = btn.closest(".menu-item");
      document.querySelectorAll(".menu-item.open").forEach(i => i !== li && i.classList.remove("open"));
      li.classList.toggle("open");
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      nav.classList.remove("open", "closing");
      burger.classList.remove("open");
      document.body.classList.remove("no-scroll");
      resetMenu();
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
