// js/pages/home/latest-gallery.js
// ─────────────────────────────────────────────────────────────────────────────
// Homepage "Galería" teaser — features the most recent album as an editorial
// photo mosaic (one lead photo + supporting tiles, with a "+N fotos" tile when
// the album holds more). Links through to the album and the full gallery.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchAlbums, fetchPhotos, formatEventDate, EVENT_TYPE_LABEL,
} from '/js/lib/gallery.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function albumUrl(a) {
  return a.slug
    ? `/galeria/album/?slug=${encodeURIComponent(a.slug)}`
    : `/galeria/album/?id=${encodeURIComponent(a.id)}`;
}

function tile(photo, href, { lead = false, overlay = '' } = {}) {
  const src = lead
    ? (photo.webp_url || photo.public_url || photo.thumbnail_url)
    : (photo.thumbnail_url || photo.webp_url || photo.public_url);
  return `
    <a class="hg-tile${lead ? ' hg-tile--lead' : ''}" href="${href}" aria-label="Ver álbum">
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

  let photoHtml;
  if (photos.length >= 5) {
    const shown = photos.slice(0, 5);
    const extra = total - 5;
    photoHtml = `<div class="hg-mosaic">` + shown.map((p, i) => tile(p, href, {
      lead: i === 0,
      overlay: (i === 4 && extra > 0)
        ? `<span class="hg-tile__more">+${extra}<small>fotos</small></span>`
        : '',
    })).join('') + `</div>`;
  } else {
    photoHtml = `<div class="hg-grid">` +
      photos.slice(0, 4).map(p => tile(p, href)).join('') + `</div>`;
  }

  root.innerHTML = `
    ${photoHtml}
    <div class="hg-caption">
      <div class="hg-caption__text">
        <span class="hg-caption__tag"><i class="fas fa-clock"></i> Lo más reciente</span>
        <h3 class="hg-caption__album">${esc(album.title)}</h3>
        <p class="hg-caption__meta">
          ${typeLabel ? esc(typeLabel) + ' · ' : ''}${esc(dateLabel)}
          · ${total} ${total === 1 ? 'foto' : 'fotos'}
        </p>
      </div>
      <a class="ird-btn ird-btn--teal" href="galeria">VER TODA LA GALERÍA</a>
    </div>`;
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
