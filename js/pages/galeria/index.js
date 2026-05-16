// js/pages/galeria/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Public Galería page:
//   • Loads all published albums
//   • Year pill filter + event-type pill filter + search-by-title
//   • Featured strip (albums with is_featured=true)
//   • Albums grouped by year, each as a responsive card grid
//   • Subscribes to realtime so newly-published albums appear without reload
// ─────────────────────────────────────────────────────────────────────────────

import {
  EVENT_TYPES, EVENT_TYPE_LABEL,
  fetchAlbums, fetchAvailableYears, subscribeAlbums,
  formatEventDate,
} from '/js/lib/gallery.js';

const state = {
  year:   '',
  type:   '',
  search: '',
  all:    [],
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── Filter rendering ─────────────────────────────────────────────────── */

function renderYearPills(years) {
  const root = $('galYearPills');
  if (!root) return;
  // Hide the whole year row when there are no real years yet — keeps the bar uncluttered.
  if (!years || years.length === 0) { root.hidden = true; root.innerHTML = ''; return; }
  root.hidden = false;

  const chips = [`<button class="gal-chip ${state.year === '' ? 'active' : ''}" data-gal-year="">Todos los años</button>`]
    .concat(years.map(y =>
      `<button class="gal-chip ${String(state.year) === String(y) ? 'active' : ''}" data-gal-year="${y}">${y}</button>`
    ));
  root.innerHTML = chips.join('');
  root.querySelectorAll('[data-gal-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.year = btn.dataset.galYear;
      root.querySelectorAll('.gal-chip').forEach(b => b.classList.toggle('active', b === btn));
      renderAlbums();
    });
  });
}

function renderTypePills() {
  const root = $('galTypePills');
  if (!root) return;
  const chips = [`<button class="gal-chip active" data-gal-type="">Todos</button>`]
    .concat(EVENT_TYPES.map(t =>
      `<button class="gal-chip ${state.type === t.value ? 'active' : ''}" data-gal-type="${t.value}">${escapeHtml(t.label)}</button>`
    ));
  root.innerHTML = chips.join('');
  root.querySelectorAll('[data-gal-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.type = btn.dataset.galType;
      root.querySelectorAll('.gal-chip').forEach(b => b.classList.toggle('active', b === btn));
      renderAlbums();
    });
  });
}

/* ── Albums rendering ─────────────────────────────────────────────────── */

const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect fill="%23eef5f6" width="400" height="300"/><text x="50%25" y="50%25" font-family="sans-serif" font-size="14" fill="%23736960" text-anchor="middle" dominant-baseline="middle">Sin foto de portada</text></svg>`)}`;

function albumCard(a, { isRecent = false } = {}) {
  const detailUrl = a.slug
    ? `/galeria/album/?slug=${encodeURIComponent(a.slug)}`
    : `/galeria/album/?id=${encodeURIComponent(a.id)}`;

  // Pick the highest-quality cover available. Older albums may still have a
  // 400px thumbnail in cover_url — that's fine, it will still render here.
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
        ${a.description ? `<p class="gal-album__desc">${escapeHtml(a.description)}</p>` : ''}
      </div>
    </a>`;
}

function filtered() {
  const q = state.search.trim().toLowerCase();
  return state.all.filter(a => {
    if (state.year && String(a.year) !== String(state.year)) return false;
    if (state.type && a.event_type !== state.type) return false;
    if (q) {
      const haystack = `${a.title || ''} ${a.description || ''} ${EVENT_TYPE_LABEL[a.event_type] || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
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

  const visible = filtered();
  const recentId = mostRecentAlbumId(state.all);

  if (!visible.length) {
    root.innerHTML = `
      <div class="gal-empty">
        <i class="fas fa-camera-retro"></i>
        <p>Aún no hay álbumes que coincidan con tu búsqueda.</p>
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
        ${byYear.get(y).map(a => albumCard(a, { isRecent: a.id === recentId })).join('')}
      </div>
    </div>
  `).join('');

  renderRecent(state.all, recentId);
}

/** Highlight the single most-recent album (by event_date) at the top of the page. */
function renderRecent(albums, recentId) {
  const wrap   = $('galFeatured');
  const strip  = $('galFeaturedStrip');
  if (!wrap || !strip) return;
  const recent = albums.find(a => a.id === recentId);
  if (!recent) { wrap.hidden = true; return; }
  wrap.hidden = false;
  // Update the section heading from "DESTACADOS" → "MÁS RECIENTE"
  const heading = wrap.querySelector('.centered-text-block__subtitle');
  if (heading) heading.textContent = 'EL EVENTO MÁS RECIENTE';
  strip.innerHTML = albumCard(recent, { isRecent: true });
}

/* ── Search input ────────────────────────────────────────────────────── */
function wireSearch() {
  const input = $('galSearch');
  if (!input) return;
  let t;
  input.addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.search = e.target.value || '';
      renderAlbums();
    }, 150);
  });
}

/* ── Boot ─────────────────────────────────────────────────────────────── */

async function reload() {
  state.all = await fetchAlbums();
  const years = await fetchAvailableYears();
  renderYearPills(years);
  renderAlbums();
}

document.addEventListener('DOMContentLoaded', async () => {
  renderTypePills();
  wireSearch();
  await reload();
  subscribeAlbums(reload);
});
