// js/pages/galeria/album.js
// ─────────────────────────────────────────────────────────────────────────────
// Public album detail page:
//   • Reads ?slug=… or ?id=… from URL
//   • Fetches album + photos
//   • Renders a responsive masonry-style grid (CSS column-count)
//   • Click → opens shared lightbox component
//   • Realtime: re-renders when photos are added/removed
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchAlbumBy, fetchPhotos, subscribePhotos,
  formatEventDate, EVENT_TYPE_LABEL,
} from '/js/lib/gallery.js';
import { openLightbox } from '/js/components/lightbox.js';

const params = new URLSearchParams(location.search);
const SLUG = params.get('slug') || '';
const ID   = params.get('id')   || '';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let currentAlbum  = null;
let currentPhotos = [];

function renderHero(album) {
  $('galAlbumTitle').textContent = (album.title || 'ÁLBUM').toUpperCase();
  $('galAlbumSubtitle').textContent =
    (album.event_type ? `${(EVENT_TYPE_LABEL[album.event_type] || '').toUpperCase()} · ` : '')
    + `${album.year}`;
  document.title = `${album.title} | Galería · Iglesia Restauración Divina`;

  if (album.cover_url) {
    const headerEl = document.getElementById('header');
    if (headerEl) headerEl.setAttribute('data-hero', album.cover_url);
  }
}

function renderDetail(album, photos) {
  const root = $('galAlbumDetail');
  if (!root) return;
  const dateLabel = album.event_date ? formatEventDate(album.event_date) : `Año ${album.year}`;
  const typeLabel = album.event_type ? EVENT_TYPE_LABEL[album.event_type] : '';
  root.innerHTML = `
    <div class="gal-detail-card glass-card animate-fade-in" data-threshold="0.3">
      <div class="gal-detail-card__head">
        ${typeLabel ? `<span class="gal-detail-card__tag">${esc(typeLabel)}</span>` : ''}
        ${album.is_featured ? `<span class="gal-detail-card__featured"><i class="fas fa-star"></i> Destacado</span>` : ''}
      </div>
      <h2 class="gal-detail-card__title">${esc(album.title)}</h2>
      <p class="gal-detail-card__meta">
        <span><i class="far fa-calendar-alt"></i> ${esc(dateLabel)}</span>
        <span><i class="fas fa-image"></i> ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}</span>
      </p>
      ${album.description ? `<p class="gal-detail-card__desc">${esc(album.description)}</p>` : ''}
    </div>
  `;
}

function renderGrid(photos) {
  const root = $('galGrid');
  if (!root) return;
  if (!photos.length) {
    root.innerHTML = `
      <div class="gal-empty">
        <i class="fas fa-camera-retro"></i>
        <p>Este álbum aún no tiene fotos.</p>
      </div>`;
    return;
  }
  root.innerHTML = photos.map((p, i) => {
    const ratio = p.width && p.height ? `${p.width}/${p.height}` : '4/3';
    return `
      <button class="gal-tile" data-gal-photo="${i}" aria-label="Ver foto ${i + 1}">
        <picture>
          ${p.webp_url ? `<source srcset="${esc(p.webp_url)}" type="image/webp">` : ''}
          <img src="${esc(p.thumbnail_url || p.public_url)}"
               alt="${esc(p.caption || '')}"
               loading="lazy"
               decoding="async"
               style="aspect-ratio: ${ratio};" />
        </picture>
      </button>`;
  }).join('');

  root.querySelectorAll('[data-gal-photo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.galPhoto);
      openLightbox(currentPhotos, i);
    });
  });
}

function notFound(msg = 'Este álbum no está disponible.') {
  $('galAlbumTitle').textContent = 'ÁLBUM NO DISPONIBLE';
  $('galAlbumSubtitle').textContent = '';
  $('galAlbumDetail').innerHTML = `
    <div class="gal-empty">
      <i class="fas fa-camera-retro"></i>
      <p>${esc(msg)}</p>
      <p style="margin-top:1rem">
        <a href="/galeria" class="ird-btn ird-btn--teal">Volver a la galería</a>
      </p>
    </div>`;
  $('galGrid').innerHTML = '';
}

async function load() {
  if (!SLUG && !ID) { notFound('Este enlace no apunta a un álbum válido.'); return; }
  const album = await fetchAlbumBy({ slug: SLUG || undefined, id: ID || undefined });
  if (!album) { notFound(); return; }
  currentAlbum = album;
  renderHero(album);

  const photos = await fetchPhotos(album.id);
  currentPhotos = photos;
  renderDetail(album, photos);
  renderGrid(photos);
}

document.addEventListener('DOMContentLoaded', async () => {
  await load();
  // Realtime: refresh photos when admin uploads or deletes
  if (currentAlbum) {
    subscribePhotos(currentAlbum.id, async () => {
      const photos = await fetchPhotos(currentAlbum.id);
      currentPhotos = photos;
      renderDetail(currentAlbum, photos);
      renderGrid(photos);
    });
  }
});
