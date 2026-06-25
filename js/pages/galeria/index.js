import { escapeHtml } from '/js/utils/escape.js';
import { richToPlain } from '/js/lib/sanitize-html.js';
// js/pages/galeria/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Public Galería page:
//   • Loads all published albums
//   • Filter popup — search + multi-select event-type checkboxes, behind a
//     filter icon button
//   • Year picker — iOS-style scrolling wheel, defaults to the current year
//   • "Más reciente" strip + albums grouped by year
//   • Realtime updates so new albums appear without a reload
// ─────────────────────────────────────────────────────────────────────────────

import {
  EVENT_TYPES, EVENT_TYPE_LABEL,
  fetchAlbums, fetchAvailableYears, subscribeAlbums,
  formatEventDate,
} from '/js/lib/gallery.js';

const CURRENT_YEAR = new Date().getFullYear();

const state = {
  year:   CURRENT_YEAR,   // a year number, or '' for "all years"
  types:  [],             // selected event_type values — empty means all types
  search: '',
  all:    [],
};

const $ = (id) => document.getElementById(id);


/* ── Filter bar ───────────────────────────────────────────────────────────── */

function updateBar() {
  const badge = $('galFilterBadge');
  if (badge) {
    badge.textContent = String(state.types.length);
    badge.hidden = state.types.length === 0;
  }
  const label = $('galYearLabel');
  if (label) label.textContent = state.year === '' ? 'Todos' : String(state.year);
}

/* ── Modal helpers ────────────────────────────────────────────────────────── */

function showModal(id) {
  const m = $(id);
  if (m) { m.hidden = false; document.body.classList.add('gal-modal-open'); }
}
function hideModals() {
  ['galFilterPop', 'galYearPop'].forEach(id => { const m = $(id); if (m) m.hidden = true; });
  document.body.classList.remove('gal-modal-open');
}

/* ── Filter popup (search + type checkboxes) ──────────────────────────────── */

function buildTypeChecks() {
  const root = $('galTypeChecks');
  if (!root) return;
  root.innerHTML = EVENT_TYPES.map(t => `
    <label class="gal-check">
      <input type="checkbox" value="${t.value}" ${state.types.includes(t.value) ? 'checked' : ''}>
      <span class="gal-check__box"><i class="fas fa-check"></i></span>
      <i class="fas ${t.icon} gal-check__type-icon" aria-hidden="true"></i>
      <span class="gal-check__label">${escapeHtml(t.label)}</span>
    </label>
  `).join('');
}

function openFilter() {
  buildTypeChecks();
  const s = $('galSearch');
  if (s) s.value = state.search;
  showModal('galFilterPop');
}

function applyFilter() {
  state.types  = [...$('galTypeChecks').querySelectorAll('input:checked')].map(i => i.value);
  state.search = ($('galSearch')?.value || '').trim();
  hideModals();
  updateBar();
  renderAlbums();
}

function clearFilter() {
  $('galTypeChecks')?.querySelectorAll('input').forEach(i => { i.checked = false; });
  const s = $('galSearch');
  if (s) s.value = '';
}

/* ── Year picker — iOS-style wheel ────────────────────────────────────────── */

const ROW_H = 44;
let wheelYears = [];   // e.g. ['', 2026, 2025, 2024]

function buildYearWheel(years) {
  // "Todos los años" first, then the current year, then any other years.
  wheelYears = ['', CURRENT_YEAR, ...years.filter(y => y !== CURRENT_YEAR)];
  const scroll = $('galYearScroll');
  if (!scroll) return;
  const spacer = '<div class="gal-wheel__spacer"></div>';
  scroll.innerHTML = spacer + wheelYears.map(y =>
    `<div class="gal-wheel__item" data-year="${y}">${y === '' ? 'Todos los años' : y}</div>`
  ).join('') + spacer;
}

function wheelIndexOf(year) {
  const i = wheelYears.findIndex(y => String(y) === String(year));
  return i < 0 ? 1 : i;   // fall back to the current-year row
}

function markWheel() {
  const scroll = $('galYearScroll');
  if (!scroll) return;
  const idx = Math.round(scroll.scrollTop / ROW_H);
  scroll.querySelectorAll('.gal-wheel__item').forEach((el, i) =>
    el.classList.toggle('is-active', i === idx));
}

function openYear() {
  showModal('galYearPop');
  const scroll = $('galYearScroll');
  if (!scroll) return;
  // Let the modal lay out, then centre the wheel on the active year.
  setTimeout(() => {
    scroll.scrollTop = wheelIndexOf(state.year) * ROW_H;
    markWheel();
  }, 40);
}

function applyYear() {
  const scroll = $('galYearScroll');
  if (scroll) {
    const idx = Math.min(wheelYears.length - 1,
                Math.max(0, Math.round(scroll.scrollTop / ROW_H)));
    state.year = wheelYears[idx];
  }
  hideModals();
  updateBar();
  renderAlbums();
}

/* ── Album card ───────────────────────────────────────────────────────────── */

const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect fill="%23eef5f6" width="400" height="300"/><text x="50%25" y="50%25" font-family="sans-serif" font-size="14" fill="%23736960" text-anchor="middle" dominant-baseline="middle">Sin foto de portada</text></svg>`)}`;

function albumCard(a, { isRecent = false } = {}) {
  const detailUrl = a.slug
    ? `/galeria/album/?slug=${encodeURIComponent(a.slug)}`
    : `/galeria/album/?id=${encodeURIComponent(a.id)}`;

  const cover = a.cover_url || PLACEHOLDER;
  const typeLabel = a.event_type ? EVENT_TYPE_LABEL[a.event_type] : '';
  const dateLabel = a.event_date ? formatEventDate(a.event_date) : `Año ${a.year}`;
  const photoCount = a.photo_count ?? 0;

  return `
    <a class="gal-album animate-fade-in" data-threshold="0.2" href="${detailUrl}">
      <div class="gal-album__cover">
        <img loading="lazy" decoding="async"
             src="${escapeHtml(cover)}"
             alt="${escapeHtml(a.title)}"
             sizes="(min-width: 1180px) 360px, (min-width: 720px) 33vw, 90vw" />
        <div class="gal-album__overlay"></div>
        ${typeLabel ? `<span class="gal-album__tag">${escapeHtml(typeLabel)}</span>` : ''}
        ${isRecent ? `<span class="gal-album__featured"><i class="fas fa-clock"></i> Más reciente</span>` : ''}
      </div>
      <div class="gal-album__body">
        <h3 class="gal-album__title">${escapeHtml(a.title)}</h3>
        <p class="gal-album__meta">
          <span><i class="far fa-calendar-alt"></i> ${escapeHtml(dateLabel)}</span>
          <span class="gal-album__count">${photoCount} ${photoCount === 1 ? 'foto' : 'fotos'}</span>
        </p>
        ${richToPlain(a.description) ? `<p class="gal-album__desc">${escapeHtml(richToPlain(a.description))}</p>` : ''}
      </div>
    </a>`;
}

/* ── Filtering + rendering ────────────────────────────────────────────────── */

function filtered() {
  const q = state.search.trim().toLowerCase();
  return state.all.filter(a => {
    if (state.year !== '' && String(a.year) !== String(state.year)) return false;
    if (state.types.length && !state.types.includes(a.event_type)) return false;
    if (q) {
      const hay = `${a.title || ''} ${richToPlain(a.description)} ${EVENT_TYPE_LABEL[a.event_type] || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Most recent album by event_date (falls back to created_at when missing). */
function mostRecentAlbumId(albums) {
  if (!albums.length) return null;
  const key = (a) => a.event_date || a.created_at || `${a.year}-01-01`;
  return [...albums].sort((x, y) => String(key(y)).localeCompare(String(key(x))))[0]?.id || null;
}

function renderAlbums() {
  const root = $('galYears');
  if (!root) return;

  const recentId = mostRecentAlbumId(state.all);
  // The most-recent album has its own "Más reciente" strip, so it is excluded
  // from the year grid here — it is never shown twice.
  const visible = filtered().filter(a => a.id !== recentId);

  if (!visible.length) {
    let msg = 'Aún no hay álbumes en la galería.';
    if (state.all.length) {
      msg = (state.year !== '' && !state.types.length && !state.search.trim())
        ? `No hay álbumes de ${state.year}.`
        : 'No hay álbumes que coincidan con tu filtro.';
    }
    root.innerHTML = `
      <div class="gal-empty">
        <i class="fas fa-camera-retro"></i>
        <p>${escapeHtml(msg)}</p>
      </div>`;
    renderRecent(state.all, recentId);
    return;
  }

  // Group by year (descending)
  const byYear = new Map();
  visible.forEach(a => {
    if (!byYear.has(a.year)) byYear.set(a.year, []);
    byYear.get(a.year).push(a);
  });
  const years = [...byYear.keys()].sort((a, b) => b - a);

  root.innerHTML = years.map(y => `
    <div class="gal-year-block" data-year="${y}">
      <header class="gal-year-block__head">
        <h2 class="gal-year-block__title">
          <span class="gal-year-block__num">${y}</span>
        </h2>
        <span class="gal-year-block__count">
          ${byYear.get(y).length} ${byYear.get(y).length === 1 ? 'álbum' : 'álbumes'}
        </span>
      </header>
      <div class="gal-album-grid">
        ${byYear.get(y).map(a => albumCard(a)).join('')}
      </div>
    </div>
  `).join('');

  renderRecent(state.all, recentId);
}

/** Highlight the single most-recent album at the top of the page. */
function renderRecent(albums, recentId) {
  const wrap  = $('galFeatured');
  const strip = $('galFeaturedStrip');
  if (!wrap || !strip) return;
  const recent = albums.find(a => a.id === recentId);
  if (!recent) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const heading = wrap.querySelector('.centered-text-block__subtitle');
  if (heading) heading.textContent = 'EL EVENTO MÁS RECIENTE';
  strip.innerHTML = albumCard(recent, { isRecent: true });
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */

function initFilters() {
  $('galFilterBtn')?.addEventListener('click', openFilter);
  $('galYearBtn')?.addEventListener('click', openYear);
  $('galFilterApply')?.addEventListener('click', applyFilter);
  $('galFilterClear')?.addEventListener('click', clearFilter);
  $('galYearApply')?.addEventListener('click', applyYear);
  $('galSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyFilter(); });

  document.querySelectorAll('[data-gal-close]').forEach(el =>
    el.addEventListener('click', hideModals));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideModals(); });

  const scroll = $('galYearScroll');
  if (scroll) {
    let raf = 0;
    scroll.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(markWheel);
    });
    scroll.addEventListener('click', e => {
      const item = e.target.closest('.gal-wheel__item');
      if (!item) return;
      const items = [...scroll.querySelectorAll('.gal-wheel__item')];
      scroll.scrollTo({ top: items.indexOf(item) * ROW_H, behavior: 'smooth' });
    });
  }
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */

async function reload() {
  state.all = await fetchAlbums();
  buildYearWheel(await fetchAvailableYears());
  renderAlbums();
}

document.addEventListener('DOMContentLoaded', async () => {
  initFilters();
  updateBar();
  try {
    await reload();
  } catch (err) {
    console.warn('[galeria] load failed:', err);
    // Replace the spinner so it never spins forever on a failed fetch.
    const root = document.getElementById('galYears');
    if (root) root.innerHTML = `
      <div class="gal-empty">
        <i class="fas fa-camera-retro" aria-hidden="true"></i>
        <p>No pudimos cargar la galería en este momento. Vuelve a intentarlo más tarde.</p>
      </div>`;
  }
  subscribeAlbums(reload);
});
