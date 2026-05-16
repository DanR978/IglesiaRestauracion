// js/components/lightbox.js
// ─────────────────────────────────────────────────────────────────────────────
// Minimal photo lightbox.
//   • Fullscreen overlay, dim backdrop
//   • Prev / next via buttons, arrow keys, swipe (touch)
//   • Esc closes; backdrop click closes
//   • Share via Web Share API (falls back to clipboard)
//   • Download button (calls back to the original public_url)
//   • Browser Fullscreen API toggle
//
// Caller provides an array of photos:
//   openLightbox(photos, startIndex)
//     photos: [{ public_url, thumbnail_url, caption?, width?, height? }, ...]
// ─────────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

let state = {
  photos: [],
  index:  0,
  scrollY: 0,
};

function bind() {
  $('lbClose')?.addEventListener('click', close);
  $('lbPrev')?.addEventListener('click', prev);
  $('lbNext')?.addEventListener('click', next);
  $('lbShare')?.addEventListener('click', share);
  $('lbFullscreen')?.addEventListener('click', toggleFullscreen);

  const lb = $('lightbox');
  if (lb) {
    lb.addEventListener('click', (e) => {
      // Close when clicking the backdrop (not the inner stage or controls)
      if (e.target === lb) close();
    });

    // Touch swipe
    let startX = 0, startY = 0, swiping = false;
    lb.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      swiping = true;
    }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (!swiping) return;
      swiping = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Horizontal swipe wins; require a real intentional gesture
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) next(); else prev();
      } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
        close();   // swipe down → close
      }
    }, { passive: true });
  }
}

function onKey(e) {
  if ($('lightbox')?.hidden) return;
  if (e.key === 'Escape')     close();
  else if (e.key === 'ArrowLeft')  prev();
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
}

function render() {
  if (!state.photos.length) return;
  const p = state.photos[state.index];

  const img = $('lbImg');
  if (img) {
    img.src = p.public_url || p.thumbnail_url || '';
    img.alt = p.caption || '';
    if (p.width)  img.width  = p.width;
    if (p.height) img.height = p.height;
  }

  const caption = $('lbCaption');
  if (caption) caption.textContent = p.caption || '';

  const counter = $('lbCounter');
  if (counter) counter.textContent = `${state.index + 1} / ${state.photos.length}`;

  const download = $('lbDownload');
  if (download) {
    download.href = p.public_url || '#';
    download.download = `foto-${state.index + 1}.jpg`;
  }

  // Disable nav buttons at the edges (still navigates via wrap-around)
  $('lbPrev')?.toggleAttribute('aria-disabled', state.photos.length < 2);
  $('lbNext')?.toggleAttribute('aria-disabled', state.photos.length < 2);

  // Preload neighbors for snappy navigation
  const preload = (i) => {
    const ph = state.photos[(i + state.photos.length) % state.photos.length];
    if (ph?.public_url) { const im = new Image(); im.src = ph.public_url; }
  };
  preload(state.index + 1);
  preload(state.index - 1);
}

export function openLightbox(photos, startIndex = 0) {
  if (!Array.isArray(photos) || !photos.length) return;
  state.photos = photos;
  state.index  = Math.max(0, Math.min(startIndex, photos.length - 1));
  state.scrollY = window.scrollY;

  const lb = $('lightbox');
  if (!lb) { console.warn('[lightbox] No #lightbox container on the page'); return; }
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  document.body.style.top = `-${state.scrollY}px`;
  document.body.classList.add('lightbox-open');

  document.addEventListener('keydown', onKey);
  render();
}

export function close() {
  const lb = $('lightbox');
  if (!lb) return;
  lb.hidden = true;
  document.body.style.overflow = '';
  document.body.style.top = '';
  document.body.classList.remove('lightbox-open');
  window.scrollTo(0, state.scrollY || 0);
  document.removeEventListener('keydown', onKey);
  if (document.fullscreenElement) document.exitFullscreen?.();
}

export function next() {
  if (state.photos.length < 2) return;
  state.index = (state.index + 1) % state.photos.length;
  render();
}

export function prev() {
  if (state.photos.length < 2) return;
  state.index = (state.index - 1 + state.photos.length) % state.photos.length;
  render();
}

async function share() {
  const p = state.photos[state.index];
  if (!p) return;
  const url = p.public_url;
  const title = p.caption || 'Foto · Iglesia Restauración Divina';
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch (_) { /* user cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    // Reuse the existing toast if mounted, else alert
    if (window.__irdToast) window.__irdToast('Enlace copiado', 'success');
    else alert('Enlace copiado al portapapeles');
  } catch (_) {
    alert(url);
  }
}

async function toggleFullscreen() {
  const lb = $('lightbox');
  if (!lb) return;
  if (!document.fullscreenElement) {
    try { await lb.requestFullscreen({ navigationUI: 'hide' }); } catch (_) {}
  } else {
    try { await document.exitFullscreen(); } catch (_) {}
  }
}

// Auto-bind on script load (idempotent)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
}
