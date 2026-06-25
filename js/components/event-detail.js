import { renderRichText, htmlIsEmpty } from '/js/lib/sanitize-html.js';
// /js/components/event-detail.js
// Reads ?id=<uuid> from URL, fetches event from Supabase, fills the page.

import { sb } from '/js/lib/supabase.js';
import { buildGoogleCalUrl, downloadICS } from '/js/utils/calendar.js';
import { isIOS } from '/js/utils/detect-device.js';
const TZ = "America/New_York";



// ── Helpers ──────────────────────────────────────────────
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: TZ,
    });
  } catch {
    return dateStr || "";
  }
}

function formatTime(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TZ,
    });
  } catch {
    return "";
  }
}

function formatTimeRange(startsAt, endsAt) {
  const start = formatTime(startsAt);
  if (!endsAt) return start;
  const end = formatTime(endsAt);
  return `${start} – ${end}`;
}


// ── DOM helpers ──────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.style.display = ""; };
const hide = (id) => { const el = $(id); if (el) el.style.display = "none"; };
const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const setHtml = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

// ── Fetch & Render ───────────────────────────────────────
async function loadEvent() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!eventId) {
    showError();
    return;
  }

  try {
    const { data, error } = await sb
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (error || !data) {
      console.error("[event-detail] fetch error:", error);
      showError();
      return;
    }

    renderEvent(data);
  } catch (err) {
    console.error("[event-detail] error:", err);
    showError();
  }
}

function showError() {
  hide("event-loading");
  show("event-error");
}

function renderEvent(event) {
  hide("event-loading");
  show("event-content");

  document.title = `${event.title || "Evento"} — Iglesia Restauración Divina`;

  // Hero image
  const heroImg = $("ed-hero-img");
  if (heroImg && event.image_url) {
    heroImg.src = event.image_url;
    heroImg.alt = event.title || "Evento";
  } else if (heroImg) {
    const header = $("header");
    const fallback = header?.getAttribute("data-hero");
    if (fallback) heroImg.src = fallback;
  }

  // Tag & Title
  setText("event-tag", event.tag || "");
  setText("event-title", event.title || "Evento");

  // Date
  if (event.starts_at) {
    setText("event-date", formatDate(event.starts_at));
  }

  // Time (12-hour AM/PM)
  if (event.starts_at) {
    const timeStr = formatTimeRange(event.starts_at, event.ends_at);
    if (timeStr) {
      setText("event-time", timeStr);
      show("event-time-row");
    }
  }

  // Location
  if (event.location) {
    setText("event-location", event.location);
    show("event-location-row");
  }

  // Calendar button — native Apple Calendar (.ics) on iOS/iPadOS, Google elsewhere.
  const calBtn = $("event-calendar-btn");
  if (calBtn) {
    calBtn.href = buildGoogleCalUrl(event);   // fallback + non-iOS behaviour
    if (isIOS()) {
      calBtn.removeAttribute("target");
      calBtn.addEventListener("click", (e) => {
        e.preventDefault();
        downloadICS(event);
      });
    }
  }

  // Description (rich text — sanitized; legacy plain text still supported)
  if (event.description && !htmlIsEmpty(event.description)) {
    setHtml("event-description", renderRichText(event.description));
    show("event-description-section");
  }

  // Organizer
  if (event.organizer_name || event.organizer_email) {
    if (event.organizer_name) {
      setText("event-organizer-name", event.organizer_name);
    }
    if (event.organizer_email) {
      const emailEl = $("event-organizer-email");
      if (emailEl) {
        emailEl.textContent = event.organizer_email;
        emailEl.href = `mailto:${event.organizer_email}`;
      }
    }
    show("event-organizer-section");
  }

  // Re-trigger animations
  if (window.initAnimations) {
    requestAnimationFrame(() => window.initAnimations());
  }
}

// ── Boot ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const heroImg = $("ed-hero-img");
  const header = $("header");
  const fallback = header?.getAttribute("data-hero");
  if (heroImg && fallback && !heroImg.src) {
    heroImg.src = fallback;
  }
});

document.addEventListener("includes:ready", loadEvent);
if (document.documentElement.classList.contains("ready")) {
  loadEvent();
}