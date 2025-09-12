// If you want Supabase Auth + DB, set these:
const SUPABASE_URL = ""; // e.g. "https://xxxx.supabase.co"
const SUPABASE_ANON_KEY = ""; // your anon key

// ---- Utility: dom ----
const $ = (sel, root = document) => root.querySelector(sel);

// ---- Supabase client (lazy) ----
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const authPanel = $("#auth-panel");
const eventsPanel = $("#events-panel");
const authUser = $("#auth-user");
const btnLogout = $("#btn-logout");

// Login form
const loginForm = $("#login-form");
const loginMsg = $("#login-msg");

// Event form + preview handles
const form = $("#event-form");
const fields = {
  title: $("#ev-title"),
  date: $("#ev-date"),
  time: $("#ev-time"),
  location: $("#ev-location"),
  desc: $("#ev-desc"),
  image: $("#ev-image"),
};
const pv = {
  title: $("#pv-title"),
  date: $("#pv-date"),
  time: $("#pv-time"),
  location: $("#pv-location"),
  desc: $("#pv-desc"),
  image: $("#pv-image"),
};
const saveMsg = $("#save-msg");

// ------- Navbar section switching -------
document.querySelectorAll('[data-section="events"]').forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.hash = "events";
    showSection("events");
  });
});
function showSection(section) {
  // Only one section now; expand later
  if (section === "events") eventsPanel?.scrollIntoView({ behavior: "smooth" });
}

// ------- Auth state handling -------
async function initAuth() {
  if (!supabase) {
    // No keys: run in demo-mode (no auth), show everything
    authPanel.hidden = true;
    eventsPanel.hidden = false;
    authUser.textContent = "Demo (no auth)";
    btnLogout.hidden = true;
    return;
  }

  const { data } = await supabase.auth.getSession();
  toggleUI(!!data.session, data.session?.user?.email);

  // listen to auth changes
  supabase.auth.onAuthStateChange((_evt, session) => {
    toggleUI(!!session, session?.user?.email);
  });
}

function toggleUI(isAuthed, email = "") {
  authPanel.hidden = isAuthed;
  eventsPanel.hidden = !isAuthed;
  authUser.textContent = isAuthed ? email : "";
  btnLogout.hidden = !isAuthed;
}

// login
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginMsg.textContent = "";
  if (!supabase) {
    loginMsg.textContent = "Este entorno está en modo demo (sin auth).";
    return;
    }
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginMsg.textContent = error.message;
  } else {
    loginMsg.textContent = "¡Bienvenido!";
  }
});

// logout
btnLogout?.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
});

// ------- Live Preview -------
function formatDate(value) {
  if (!value) return "Fecha";
  try {
    const d = new Date(value);
    return d.toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch { return value; }
}
function formatTime(value) {
  return value ? value : "Hora";
}

function updatePreview() {
  pv.title.textContent = fields.title.value || "Título del Evento";
  pv.date.textContent = formatDate(fields.date.value);
  pv.time.textContent = formatTime(fields.time.value);
  pv.location.textContent = fields.location.value || "Ubicación";
  pv.desc.textContent = fields.desc.value || "Descripción breve aparecerá aquí…";
  if (fields.image.value) {
    pv.image.src = fields.image.value;
    pv.image.style.display = "";
  } else {
    pv.image.removeAttribute("src");
    pv.image.style.display = "none";
  }
}
Object.values(fields).forEach(el => el.addEventListener("input", updatePreview));
updatePreview();

// ------- Save Event -------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveMsg.textContent = "";

  // Build payload
  const payload = {
    title: fields.title.value.trim(),
    date: fields.date.value,
    time: fields.time.value,
    location: fields.location.value.trim(),
    description: fields.desc.value.trim(),
    image_url: fields.image.value.trim() || null,
    created_at: new Date().toISOString(),
  };

  // If no Supabase, just show the JSON result for now
  if (!supabase) {
    console.log("Demo save:", payload);
    saveMsg.textContent = "Guardado (demo). Conecta Supabase para persistir.";
    return;
  }

  // Create table `events` in Supabase with columns:
  // id (uuid, default), title (text), date (date), time (text), location (text),
  // description (text), image_url (text), created_at (timestamptz)
  const { error } = await supabase.from("events").insert(payload);
  if (error) {
    saveMsg.textContent = error.message;
  } else {
    saveMsg.textContent = "Evento guardado ✅";
    form.reset();
    updatePreview();
  }
});

// Boot
initAuth();
