import { createEventFetcher } from "../components/events-fetcher.js";

const EF = createEventFetcher({
  url:  import.meta.env.VITE_SUPABASE_URL,
  anon: import.meta.env.VITE_SUPABASE_ANON_KEY
});

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

async function loadEvents() {
  const listEl = $("#admin-events-list");
  listEl.innerHTML = "Cargando…";

  try {
    const rows = await EF.fetchEvents({ upcomingOnly: false });
    if (!rows.length) { listEl.innerHTML = "<p>No hay eventos.</p>"; return; }

    listEl.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>Título</th><th>Fecha</th><th>Hora</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-id="${r.id}">
              <td>${r.title ?? ""}</td>
              <td>${new Date(r.starts_at).toLocaleDateString()}</td>
              <td>${new Date(r.starts_at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</td>
              <td>
                <button class="ird-btn ird-btn--outline" data-action="delete">Eliminar</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  } catch (err) {
    listEl.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action='delete']");
  if (!btn) return;

  const row = btn.closest("tr");
  const id = row?.dataset?.id;
  if (!id) return;

  const title = row.querySelector("td")?.textContent?.trim() || "este evento";
  const ok = confirm(`¿Eliminar "${title}"? Esta acción no se puede deshacer.`);
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = "Eliminando…";
  try {
    await EF.deleteEvent(id);
    row.remove(); // optimistic UI
  } catch (err) {
    alert("No se pudo eliminar: " + err.message);
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
});

// live updates if someone else changes things
EF.subscribeRealtime(loadEvents);

document.addEventListener("DOMContentLoaded", loadEvents);
