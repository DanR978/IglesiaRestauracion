// =============================
// 🔧 GLOBAL SCRIPT LOADER
// =============================

// Load jQuery and Bootstrap if needed (comment out if already in HTML)
const loadExternalScripts = () => {
  const jqueryScript = document.createElement("script");
  jqueryScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js";
  document.head.appendChild(jqueryScript);

  const bootstrapScript = document.createElement("script");
  bootstrapScript.src = "https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.1.3/js/bootstrap.bundle.min.js";
  document.head.appendChild(bootstrapScript);
};

// =============================
// 🕒 SET CURRENT YEAR IN FOOTER
// =============================

const setCurrentYear = () => {
  const yearSpan = document.getElementById('currentYear');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
};

// =============================
// 🍔 BURGER MENU LOGIC
// =============================

const setupBurgerMenu = () => {
  const burger = document.getElementById("burgerToggle");
  const nav = document.getElementById("mainNav");
  console.log({ burger, nav });

  if (!burger || !nav) {
    console.error("Burger or Nav element not found");
    return;
  }
  const mainMenu = document.getElementById("main-menu");
  const submenuViews = document.querySelectorAll(".submenu-view");
  const openSubmenuLinks = document.querySelectorAll(".open-submenu");
  const backButtons = document.querySelectorAll(".back-to-main");

  const closeAllSubmenus = () => {
    submenuViews.forEach(menu => menu.classList.remove("active"));
    mainMenu?.classList.add("active");
  };

  burger?.addEventListener("click", () => {
    burger.classList.toggle("open");
    nav?.classList.toggle("open");
    document.body.classList.toggle("no-scroll");
    closeAllSubmenus();
  });

  openSubmenuLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const targetId = link.getAttribute("data-target");
      const submenu = document.getElementById(targetId);
      if (submenu) {
        mainMenu?.classList.remove("active");
        submenu.classList.add("active");
      }
    });
  });

  backButtons.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      closeAllSubmenus();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 769) {
      nav?.classList.remove("open");
      burger?.classList.remove("open");
      document.body.classList.remove("no-scroll");
      closeAllSubmenus();
    }
  });

  console.log("✅ Burger menu initialized");
};



// =============================
// 📚 FAQ ACCORDION LOGIC (Multi-Open)
// =============================

const setupFAQAccordion = () => {
  const buttons = document.querySelectorAll('.accordion-faq__question');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const answer = button.nextElementSibling;
      const isExpanded = button.getAttribute('aria-expanded') === 'true';

      button.setAttribute('aria-expanded', !isExpanded);
      answer.classList.toggle('open');
    });
  });
};



// =============================
// 📖 LOAD RANDOM BIBLE VERSE
// =============================

const loadRandomVerse = () => {
  const url = "https://raw.githubusercontent.com/DanR978/IglesiaRestauracion/refs/heads/main/resources/verses/all-verses.json?nocache=" + new Date().getTime();

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error("No se pudo cargar el archivo JSON");
      return res.json();
    })
    .then(verses => {
      const index = Math.floor(Math.random() * verses.length);
      const verse = verses[index];

      const libros = {
        1: "Génesis", 2: "Éxodo", 3: "Levítico", 4: "Números", 5: "Deuteronomio",
        6: "Josué", 7: "Jueces", 8: "Rut", 9: "1 Samuel", 10: "2 Samuel",
        11: "1 Reyes", 12: "2 Reyes", 13: "1 Crónicas", 14: "2 Crónicas", 15: "Esdras",
        16: "Nehemías", 17: "Ester", 18: "Job", 19: "Salmos", 20: "Proverbios",
        21: "Eclesiastés", 22: "Cantares", 23: "Isaías", 24: "Jeremías", 25: "Lamentaciones",
        26: "Ezequiel", 27: "Daniel", 28: "Oseas", 29: "Joel", 30: "Amós",
        31: "Abdías", 32: "Jonás", 33: "Miqueas", 34: "Nahúm", 35: "Habacuc",
        36: "Sofonías", 37: "Hageo", 38: "Zacarías", 39: "Malaquías", 40: "Mateo",
        41: "Marcos", 42: "Lucas", 43: "Juan", 44: "Hechos", 45: "Romanos",
        46: "1 Corintios", 47: "2 Corintios", 48: "Gálatas", 49: "Efesios", 50: "Filipenses",
        51: "Colosenses", 52: "1 Tesalonicenses", 53: "2 Tesalonicenses", 54: "1 Timoteo",
        55: "2 Timoteo", 56: "Tito", 57: "Filemón", 58: "Hebreos", 59: "Santiago",
        60: "1 Pedro", 61: "2 Pedro", 62: "1 Juan", 63: "2 Juan", 64: "3 Juan",
        65: "Judas", 66: "Apocalipsis"
      };

      const cleanText = verse.text.replace(/\\n|\/n|\n/g, "<br>").replace(/["']/g, "").trim();
      const reference = `– ${libros[verse.book_id] || "Libro"} ${verse.chapter}:${verse.verse}`;

      const verseTextEl = document.getElementById("verse-text");
      const verseRefEl = document.getElementById("verse-ref");

      if (verseTextEl && verseRefEl) {
        verseTextEl.innerHTML = `"${cleanText}"`;
        verseRefEl.innerText = reference;
      }
    })
    .catch(err => {
      console.error("❌ Error al cargar el versículo:", err);
      const verseTextEl = document.getElementById("verse-text");
      const verseRefEl = document.getElementById("verse-ref");
      if (verseTextEl) verseTextEl.innerText = "Error al cargar el versículo.";
      if (verseRefEl) verseRefEl.innerText = "";
    });
};

// =============================
// ✨ VIEWPORT ANIMATION
// =============================

const initAnimations = () => {
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('[class*="animate-"]').forEach(el => {
    observer.observe(el);
  });
};

// =============================
// 🚀 MASTER INIT
// =============================

document.addEventListener("DOMContentLoaded", () => {
  loadExternalScripts();     // jQuery + Bootstrap
  setCurrentYear();          // Footer copyright year
  loadRandomVerse();         // Daily verse logic
  initAnimations();          // IntersectionObserver for fade-ins
  setupFAQAccordion();       // NEW: FAQ Accordion logic

  setTimeout(() => {
    setupBurgerMenu();
    setupFAQAccordion();
  }, 100);
});
