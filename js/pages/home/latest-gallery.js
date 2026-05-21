// js/pages/home/latest-gallery.js
// ─────────────────────────────────────────────────────────────────────────────
// Homepage "Galería" teaser — features the most recent album as a centered,
// swipeable photo carousel: big tiles, one always snapped to centre, scroll
// left/right (arrows on desktop, swipe on touch).
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchAlbums, fetchPhotos, formatEventDate, EVENT_TYPE_LABEL,
} from '/js/lib/gallery.js';

const MAX_TILES = 8;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function albumUrl(a) {
  return a.slug
    ? `/galeria/album/?slug=${encodeURIComponent(a.slug)}`
    : `/galeria/album/?id=${encodeURIComponent(a.id)}`;
}

function tile(photo, href, overlay = '') {
  const src = photo.webp_url || photo.public_url || photo.thumbnail_url;
  return `
    <a class="hg-tile" href="${href}" aria-label="Ver álbum">
      <img src="${esc(src)}" alt="" loading="lazy" decoding="async">
      ${overlay}
    </a>`;
}

function render(album, photos) {
  const root = document.getElementById('homeGallery');
  if (!root) return;

  const href      = albumUrl(album);
  const total     = album.photo_count ?? photos.length;
  const dateLabel = album.event_date ? formatEventDate(album.event_date) : `Año ${album.year}`;
  const typeLabel = album.event_type ? (EVENT_TYPE_LABEL[album.event_type] || '') : '';

  const shown = photos.slice(0, MAX_TILES);
  const extra = photos.length - shown.length;
  const tiles = shown.map((p, i) => tile(p, href,
    (i === shown.length - 1 && extra > 0)
      ? `<span class="hg-tile__more">+${extra}<small>fotos</small></span>`
      : ''
  )).join('');

  root.innerHTML = `
    <div class="hg-rail-wrap">
      <button type="button" class="hg-arrow hg-arrow--prev" aria-label="Foto anterior">
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="hg-rail" id="hgRail">${tiles}</div>
      <button type="button" class="hg-arrow hg-arrow--next" aria-label="Foto siguiente">
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="hg-caption">
      <span class="hg-caption__tag"><i class="fas fa-clock"></i> Lo más reciente</span>
      <h3 class="hg-caption__album">${esc(album.title)}</h3>
      <p class="hg-caption__meta">
        ${typeLabel ? esc(typeLabel) + ' · ' : ''}${esc(dateLabel)}
        · ${total} ${total === 1 ? 'foto' : 'fotos'}
      </p>
      <a class="ird-btn ird-btn--teal" href="galeria">VER TODA LA GALERÍA</a>
    </div>`;

  wireRail();
}

function wireRail() {
  const rail = document.getElementById('hgRail');
  if (!rail) return;
  const wrap = rail.closest('.hg-rail-wrap');

  const stepBy = () => {
    const t = rail.querySelector('.hg-tile');
    return (t ? t.getBoundingClientRect().width : rail.clientWidth * 0.8) + 14;
  };
  document.querySelector('.hg-arrow--prev')
    ?.addEventListener('click', () => rail.scrollBy({ left: -stepBy(), behavior: 'smooth' }));
  document.querySelector('.hg-arrow--next')
    ?.addEventListener('click', () => rail.scrollBy({ left:  stepBy(), behavior: 'smooth' }));

  // Hide the arrows when every photo already fits (nothing to scroll).
  const syncArrows = () => {
    const scrollable = rail.scrollWidth - rail.clientWidth > 4;
    if (wrap) wrap.classList.toggle('hg-rail-wrap--static', !scrollable);
  };
  requestAnimationFrame(syncArrows);
  window.addEventListener('resize', syncArrows);
}

async function initHomeGallery() {
  const section = document.getElementById('homeGallerySection');
  if (!section) return;
  try {
    const albums = await fetchAlbums();          // published, newest first
    const album  = albums[0];
    if (!album) { section.hidden = true; return; }

    const photos = await fetchPhotos(album.id);
    if (!photos.length) { section.hidden = true; return; }

    render(album, photos);
  } catch (e) {
    console.warn('[home-gallery]', e);
    section.hidden = true;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomeGallery);
} else {
  initHomeGallery();
}
