// /js/components/event-detail.js
// Reads ?id=<uuid> from URL, fetches event from Supabase, fills the page.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://snqwxgyhfiinouewxgiy.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXd4Z3loZmlpbm91ZXd4Z2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjMxNzAsImV4cCI6MjA3MTM5OTE3MH0.LgxKa56FGiHRZB24s8ikfg5epV5QXdG3aVkgPIRMneo";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

function buildGoogleCalUrl(event) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmtUTC = (d) =>
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z";

  const start = new Date(event.starts_at);
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + 3600000);

  const qs = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "Evento",
    dates: `${fmtUTC(start)}/${fmtUTC(end)}`,
    details: event.description || "",
    location: event.location || "",
  });
  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
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

  // Calendar button
  const calBtn = $("event-calendar-btn");
  if (calBtn) calBtn.href = buildGoogleCalUrl(event);

  // Description
  if (event.description) {
    const paragraphs = event.description
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    setHtml(
      "event-description",
      paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")
    );
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