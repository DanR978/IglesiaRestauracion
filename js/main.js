// Load jQuery and Bootstrap if needed (comment out if already in HTML)
const loadExternalScripts = () => {
  const jqueryScript = document.createElement("script");
  jqueryScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.4/jquery.min.js";

  jqueryScript.onload = () => {
    // Load Bootstrap only after jQuery is fully loaded
    const bootstrapScript = document.createElement("script");
    bootstrapScript.src = "https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.2/js/bootstrap.bundle.min.js";
    document.head.appendChild(bootstrapScript);
  };

  document.head.appendChild(jqueryScript);
};

// =============================
// 🕒 SET CURRENT YEAR IN FOOTER
// =============================
const setCurrentYear = () => {
  const yearSpan = document.getElementById('currentYear');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
};

// ————————————————————————————————————————————
//  MOBILE MENU JS
// ————————————————————————————————————————————
const setupBurgerMenu = () => {
  const burger    = document.getElementById("burgerToggle");
  const nav       = document.getElementById("mainNav");
  const menuItems = document.querySelectorAll(".menu-item.has-submenu");
  if (!burger || !nav) return;

  const resetMenu = () => { menuItems.forEach(i => i.classList.remove("open")); };

  const toggleNav = () => {
    if (!nav.classList.contains("open")) {
      nav.classList.add("open");
      burger.classList.add("open");
      document.body.classList.add("no-scroll");
    } else {
      nav.classList.add("closing");
      burger.classList.remove("open");
      document.body.classList.remove("no-scroll");
      resetMenu();

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
      e.preventDefault();
      e.stopPropagation();
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
    .catch(err => {
      console.error("❌ Error al cargar el versículo:", err);
      const verseTextEl = document.getElementById("verse-text");
      const verseRefEl  = document.getElementById("verse-ref");
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
  }, { threshold: 0.4 });

  document.querySelectorAll('[class*="animate-"]').forEach(el => observer.observe(el));
};

// =============================
// ✨ DIRECTIONS BUTTON LOGIC
// =============================
function setupDirectionsButton({
  buttonId = "getDirections",
  destination = { lat: 38.014455, lon: -84.538253 }, // Your church address
  fallbackUrl = "https://www.google.com/maps?q=334+North+Broadway,+Lexington,+KY"
} = {}) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.addEventListener("click", () => {
    if (!navigator.geolocation) {
      window.open(fallbackUrl, "_blank");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIOS) {
          const mapsUrl = `maps://maps.apple.com/?saddr=${latitude},${longitude}&daddr=${destination.lat},${destination.lon}`;
          window.location.href = mapsUrl;
        } else {
          const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destination.lat},${destination.lon}`;
          window.open(mapsUrl, "_blank");
        }
      },
      () => {
        alert("Unable to get your location. Opening default directions.");
        window.open(fallbackUrl, "_blank");
      }
    );
  });
}



/* ============================
   🔔 Toast with close (×) — animated
   ============================ */
function showToast(msg, { ok = true, ms = 2400 } = {}) {
  const root =
    document.getElementById("toast-root") ||
    document.body.appendChild(
      Object.assign(document.createElement("div"), {
        id: "toast-root",
        "aria-live": "polite",
        "aria-atomic": "true",
      })
    );

  const el = document.createElement("div");
  el.className = `toast ${ok ? "ok" : "err"}`;
  el.setAttribute("role", "status");

  const text = document.createElement("p");
  text.className = "toast__msg";
  text.textContent = msg;

  const btn = document.createElement("button");
  btn.className = "toast__close";
  btn.type = "button";
  btn.setAttribute("aria-label", "Cerrar");
  btn.textContent = "×";

  el.appendChild(text);
  el.appendChild(btn);
  root.appendChild(el);

  // enter animation
  requestAnimationFrame(() => el.classList.add("show"));

  const timer = ms ? setTimeout(remove, ms) : null;
  btn.addEventListener("click", remove);

  function remove() {
    if (timer) clearTimeout(timer);
    // leave animation
    el.classList.remove("show");
    el.classList.add("hide");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

/* ============================
   🧩 Checkbox CAPTCHA popup — animated
   ============================ */
function runCheckboxCaptchaModal() {
  return new Promise((resolve) => {
    const bd = document.createElement("div");
    bd.className = "cap-backdrop";

    const md = document.createElement("div");
    md.className = "cap-modal";
    md.innerHTML = `
      <div class="cap-header">
        <h3 class="cap-title">Verificación rápida</h3>
        <button class="cap-close" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="cap-body">
        <div class="cap-row">
          <input id="cap-check" class="cap-checkbox" type="checkbox" />
          <label for="cap-check" class="cap-label">No soy un robot</label>
        </div>
        <p class="cap-note">Marcando esta casilla nos ayudas a evitar spam.</p>
        <div class="cap-actions">
          <button class="ird-btn" type="button" data-cancel style="font-size: 1rem; padding: 0; color: var(--color-black);">Cancelar</button>
          <button class="ird-btn ird-btn--teal" type="button" data-accept disabled style="font-size: 1rem; padding: 12px 18px;">Confirmar</button>
        </div>
      </div>
    `;

    const check  = md.querySelector("#cap-check");
    const accept = md.querySelector("[data-accept]");
    const cancel = md.querySelector("[data-cancel]");
    const close  = md.querySelector(".cap-close");

    function setEnabled(on) {
      accept.disabled = !on;
      accept.classList.toggle("enabled", !!on);
    }
    check.addEventListener("change", () => setEnabled(check.checked));

    function cleanup(ok) {
      // trigger leave animations on both backdrop and modal
      bd.classList.remove("show");
      bd.classList.add("hide");
      md.classList.add("leaving"); // (not strictly needed, but explicit)

      // remove after modal spin-out ends
      md.addEventListener("animationend", () => bd.remove(), { once: true });
      document.removeEventListener("keydown", onEsc);
      resolve(!!ok);
    }
    function onEsc(e) { if (e.key === "Escape") cleanup(false); }

    bd.addEventListener("click", (e) => { if (e.target === bd) cleanup(false); });
    accept.addEventListener("click", () => cleanup(true));
    cancel.addEventListener("click", () => cleanup(false));
    close.addEventListener("click", () => cleanup(false));
    document.addEventListener("keydown", onEsc);

    bd.appendChild(md);
    document.body.appendChild(bd);

    // enter animation
    requestAnimationFrame(() => bd.classList.add("show"));
    check.focus();
  });
}


/* ============================
   ✅ Validators (Email/Name/Phone)
   ============================ */

// Email
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());

// US phone helpers (NANP basic rules, no deps)
// → returns "+1XXXXXXXXXX" or null
function normalizeUSPhone(v) {
  if (!v) return null;
  let digits = String(v).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;

  const area = digits.slice(0, 3);
  const exch = digits.slice(3, 6);
  const line = digits.slice(6);

  // NANP basics: area & exchange can't start with 0 or 1
  if (!/^[2-9]\d{2}$/.test(area)) return null;
  if (!/^[2-9]\d{2}$/.test(exch)) return null;

  return `+1${area}${exch}${line}`;
}

// Boolean validator using the normalizer
const isValidUSPhone = (v) => normalizeUSPhone(v) !== null;

// Allows letters (incl. accents), spaces, apostrophes, hyphens; min 3 chars.
const isValidName = (v) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]{3,}$/.test((v || "").trim());

/* Optional: format US phone for display (national) */
function formatUSPhoneNational(v) {
  const e164 = normalizeUSPhone(v);
  if (!e164) return v ?? "";
  const d = e164.slice(2); // strip +1
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

/* ============================
   ✍️ Character counter helper
   ============================ */
function setupMessageCounter(form, { minChars = 20, defaultMax = 300 } = {}) {
  const field = form.querySelector("#message");
  if (!field) return;

  // Ensure maxLength
  if (!field.maxLength || field.maxLength < 1) {
    field.maxLength = defaultMax;
  }

  // Make parent relative for positioning
  const parent = field.parentNode;
  if (window.getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }

  // Counter element
  const counter = document.createElement("div");
  counter.style.position = "absolute";
  counter.style.bottom = "6px";
  counter.style.right = "10px";
  counter.style.fontSize = "12px";
  counter.style.color = "var(--color-black)";
  counter.style.opacity = "0.8";
  counter.style.pointerEvents = "none";
  counter.textContent = `0 / ${field.maxLength}`;
  parent.appendChild(counter);

  // Update counter
  const update = () => {
    const len = field.value.length;
    counter.textContent = `${len} / ${field.maxLength}`;
  };
  field.addEventListener("input", update);
  update();

  return { minChars };
}

/* ============================
   ✉️  AJAX wiring for FormSubmit
   ============================ */
function attachAjaxToForm(form) {
  if (!form || form.__wiredAjax) return;
  form.__wiredAjax = true;

  // avoid native validation bubbles
  form.setAttribute("novalidate", "");

  // ensure hidden fields exist
  let cap = form.querySelector('input[name="_captcha"]');
  if (!cap) {
    cap = document.createElement("input");
    cap.type = "hidden";
    cap.name = "_captcha";
    form.appendChild(cap);
  }
  cap.value = "false";

  if (!form.querySelector('input[name="_honey"]')) {
    const honey = document.createElement("input");
    honey.type = "text";
    honey.name = "_honey";
    honey.style.display = "none";
    honey.tabIndex = -1;
    form.appendChild(honey);
  }

  // setup live counter for message (min 20 chars by default)
  const { minChars: MIN_MSG_CHARS = 20 } = setupMessageCounter(form) || {};

  let busy = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;

    const emailEl = form.querySelector('input[type="email"]');
    const phoneEl = form.querySelector('input[type="tel"]');
    const nameEl  = form.querySelector("#first-name");
    const msgEl   = form.querySelector("#message");

    const email = emailEl?.value || "";
    const phone = phoneEl?.value || "";
    const name  = nameEl?.value || "";
    const msg   = msgEl?.value || "";

    // ✅ Enhanced validations
    if (!isValidName(name)) {
      showToast("Por favor ingresa un nombre válido (mínimo 3 letras).", { ok: false });
      busy = false; return;
    }
    if (!isValidUSPhone(phone)) {
      showToast("El teléfono debe ser un número válido de EE. UU. (10 dígitos).", { ok: false });
      busy = false; return;
    }
    if (!isValidEmail(email)) {
      showToast("Por favor ingresa un correo electronico válido.", { ok: false });
      busy = false; return;
    }
    if (msg.trim().length < MIN_MSG_CHARS) {
      showToast(`El mensaje debe tener al menos ${MIN_MSG_CHARS} caracteres.`, { ok: false });
      busy = false; return;
    }

    // Normalize phone to E.164 before submit so your backend/spreadsheet gets a clean value
    const normalizedPhone = normalizeUSPhone(phone);
    if (!normalizedPhone) {
      showToast("El teléfono no es válido.", { ok: false });
      busy = false; return;
    }
    if (phoneEl) phoneEl.value = normalizedPhone;

    // Run CAPTCHA popup
    const human = await runCheckboxCaptchaModal();
    if (!human) {
      showToast("Verificación cancelada.", { ok: false });
      busy = false; return;
    }

    // AJAX submit
    const ajaxUrl = form.action.replace("https://formsubmit.co/", "https://formsubmit.co/ajax/");
    const body    = new FormData(form);

    try {
      const res  = await fetch(ajaxUrl, { method: "POST", headers: { Accept: "application/json" }, body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        showToast("¡Mensaje enviado! Gracias por contactarnos.", { ok: true });
        form.reset();
      } else {
        showToast("No se pudo enviar. Inténtalo de nuevo.", { ok: false });
      }
    } catch {
      showToast("Error de red. Revisa tu conexión.", { ok: false });
    } finally {
      busy = false;
    }
  });
}

/* ============================
   🔎 Init wiring
   ============================ */
function initContactFormWiring() {
  const immediate = document.querySelector(
    '#contact-form form[action*="formsubmit.co"], form[action*="formsubmit.co"]'
  );
  if (immediate) attachAjaxToForm(immediate);

  const host = document.getElementById("contact-form") || document.body;
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches?.('form[action*="formsubmit.co"]')) attachAjaxToForm(n);
        n.querySelectorAll?.('form[action*="formsubmit.co"]').forEach(attachAjaxToForm);
      });
    }
  });
  mo.observe(host, { childList: true, subtree: true });
}



// =============================
// 🚀 MASTER INIT
// =============================
document.addEventListener("DOMContentLoaded", () => {
  loadExternalScripts();     // jQuery + Bootstrap
  setCurrentYear();          // Footer copyright year
  loadRandomVerse();         // Daily verse logic
  initAnimations();          // IntersectionObserver for fade-ins
  setupFAQAccordion();       // FAQ Accordion logic
  setupDirectionsButton();   // Directions button logic

  setTimeout(() => { setupBurgerMenu(); }, 100);

  initContactFormWiring();   // Contact form AJAX wiring
});