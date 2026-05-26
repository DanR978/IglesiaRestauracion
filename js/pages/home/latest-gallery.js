// js/pages/home/latest-gallery.js
// ─────────────────────────────────────────────────────────────────────────────
// Homepage "Galería" teaser — editorial split feature.
//
//   ┌──────────────────────┐  ┌──────────────┐
//   │                      │  │ Album title  │
//   │     Feature cover    │  │ Date · count │
//   │     (cinematic)      │  │ ──────────── │
//   │                      │  │ thumb thumb  │
//   │                      │  │ thumb thumb  │
//   │                      │  │              │
//   │                      │  │  Ver más  →  │
//   └──────────────────────┘  └──────────────┘
//
// One LARGE feature photo on the left (cover), and on the right: album meta +
// 4 small supporting thumbnails + a minimal underline CTA. Light background,
// editorial spacing — sits naturally between Discipulado and Donation.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchAlbums, fetchPhotos, formatEventDate, EVENT_TYPE_LABEL,
} from '/js/lib/gallery.js';

const THUMB_COUNT = 4;     // supporting thumbnails shown beside the feature

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function albumUrl(a) {
  return a.slug
    ? `/galeria/album/?slug=${encodeURIComponent(a.slug)}`
    : `/galeria/album/?id=${encodeURIComponent(a.id)}`;
}

function pickSrc(photo) {
  return photo?.webp_url || photo?.public_url || photo?.thumbnail_url || '';
}

function render(album, photos) {
  const root = document.getElementById('homeGallery');
  if (!root) return;

  const href      = albumUrl(album);
  const total     = album.photo_count ?? photos.length;
  const dateLabel = album.event_date ? formatEventDate(album.event_date) : `Año ${album.year}`;
  const typeLabel = album.event_type ? (EVENT_TYPE_LABEL[album.event_type] || '') : '';

  const feature  = photos[0];
  const sidekick = photos.slice(1, 1 + THUMB_COUNT);
  const extra    = Math.max(0, total - 1 - sidekick.length);

  root.innerHTML = `
    <div class="hg-spread">

      <!-- Feature cover -->
      <a class="hg-feature" href="${href}" aria-label="Ver álbum ${esc(album.title)}">
        <div class="hg-feature__frame">
          <img src="${esc(pickSrc(feature))}"
               alt="${esc(album.title)}"
               loading="lazy"
               decoding="async">
          <div class="hg-feature__shade"></div>
          ${typeLabel ? `<span class="hg-feature__tag">${esc(typeLabel)}</span>` : ''}
        </div>
      </a>

      <!-- Caption + supporting thumbs + CTA -->
      <aside class="hg-side">
        <p class="hg-side__meta">
          <span class="hg-side__dot" aria-hidden="true"></span>
          Álbum más reciente · ${esc(dateLabel)}
        </p>

        <h3 class="hg-side__title">${esc(album.title)}</h3>

        <p class="hg-side__count">
          ${total} ${total === 1 ? 'foto' : 'fotos'}${typeLabel ? ` · ${esc(typeLabel)}` : ''}
        </p>

        ${sidekick.length ? `
          <div class="hg-side__strip">
            ${sidekick.map((p, i) => `
              <a class="hg-thumb" href="${href}" aria-label="Ver más fotos">
                <img src="${esc(pickSrc(p))}" alt="" loading="lazy" decoding="async">
                ${(i === sidekick.length - 1 && extra > 0)
                    ? `<span class="hg-thumb__more">+${extra}</span>`
                    : ''}
              </a>
            `).join('')}
          </div>` : ''}

        <a class="hg-cta" href="/galeria">
          <span>Ver galería completa</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="13 6 19 12 13 18"/>
          </svg>
        </a>
      </aside>

    </div>`;
}

async function initHomeGallery() {
  const section = document.getElementById('homeGallerySection');
  if (!section) return;
  try {
    const albums = await fetchAlbums();
    const album  = albums[0];
    if (!album) { section.hidden = true; return; }

    const photos = await fetchPhotos(album.id);
    if (!photos.length) { section.hidden = true; return; }

    render(album, photos);

    // The kicker/title/showcase carry .animate-fade-in (opacity:0 until the
    // global scroll-reveal observer kicks in). Reveal them deterministically
    // once the layout is in place — avoids a blank section if the observer
    // hasn't fired yet on small viewports.
    section.querySelectorAll('.animate-fade-in')
      .forEach((el) => el.classList.add('visible'));
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
