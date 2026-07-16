import { esc } from '/js/utils/escape.js';
// js/pages/admin/gallery-tab.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin Galería tab — full CRUD for albums + photos.
//   • Library view: list albums (filters by year, type, published)
//   • Album editor: title/year/type/date/description + drag-drop upload
//   • Drag-drop / click upload, multi-file, with progress + parallel queue
//   • All uploads optimized via /js/lib/image-optimizer.js (1920px JPEG + WebP + 400px thumb)
//   • Photo grid: click to set as cover, delete, re-order (drag)
// ─────────────────────────────────────────────────────────────────────────────

import {
  EVENT_TYPES, EVENT_TYPE_LABEL,
  fetchAlbums, fetchAvailableYears, fetchAlbumByIdAdmin, fetchPhotos,
  upsertAlbum, deleteAlbum, uploadPhoto, deletePhoto,
  setAlbumCover, reorderPhotos,
  subscribePhotos,
} from '/js/lib/gallery.js';

import { toast, confirm } from './ui.js';
import { openGalleryWizard } from './gallery-wizard.js';
import { loadEventOptions, eventOptionsHtml } from './event-link.js';

const $ = (id) => document.getElementById(id);


let booted = false;
let albumsCache = [];
let currentAlbum = null;       // when in editor
let currentPhotos = [];
let unsubPhotos = null;

/* ── Entry ─────────────────────────────────────────────────────────────── */

export async function loadGallery() {
  if (!booted) { boot(); booted = true; }
  showLibrary();
  await refreshLibrary();
}

function boot() {
  // Populate type filter options
  const typeFilter = $('galAdmTypeFilter');
  if (typeFilter) {
    typeFilter.innerHTML = `<option value="">Todos los tipos</option>` +
      EVENT_TYPES.map(t => `<option value="${t.value}">${esc(t.label)}</option>`).join('');
    typeFilter.addEventListener('change', refreshLibrary);
  }
  $('galAdmYearFilter')?.addEventListener('change', refreshLibrary);
  $('galAdmShowUnpublished')?.addEventListener('change', refreshLibrary);
  // "Nuevo álbum" → step-by-step wizard, then jump into editor for photo uploads
  $('galNewAlbumBtn')?.addEventListener('click', () => {
    openGalleryWizard({
      onCreated: (album) => {
        if (album?.id) openEditor(album.id);
        else refreshLibrary();
      },
    });
  });
  $('galAdmBackBtn')?.addEventListener('click', showLibrary);
  $('galAdmSaveBtn')?.addEventListener('click', saveAlbumFromEditor);
  $('galAdmDeleteBtn')?.addEventListener('click', deleteCurrentAlbum);

  // Editor type dropdown
  const editorType = $('galAdmType');
  if (editorType) {
    editorType.innerHTML = `<option value="">— Sin tipo —</option>` +
      EVENT_TYPES.map(t => `<option value="${t.value}">${esc(t.label)}</option>`).join('');
  }

  // Drop zone + file input
  const dropZone = $('galDropZone');
  const fileInput = $('galFileInput');
  if (dropZone && fileInput) {
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    ['dragenter', 'dragover'].forEach(evt =>
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('gal-dropzone--active'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('gal-dropzone--active'); })
    );
    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files?.length) handleFiles(files);
    });
  }

  $('galAdmRefreshBtn')?.addEventListener('click', async () => {
    if (currentAlbum?.id) {
      currentPhotos = await fetchPhotos(currentAlbum.id);
      renderPhotoGrid();
    }
  });
}

/* ── View toggle ──────────────────────────────────────────────────────── */

function showLibrary() {
  $('gal-view-library')?.classList.add('active');
  $('gal-view-album')?.classList.remove('active');
  unsubPhotos?.(); unsubPhotos = null;
  currentAlbum = null; currentPhotos = [];
}

function showEditor() {
  $('gal-view-library')?.classList.remove('active');
  $('gal-view-album')?.classList.add('active');
}

/* ── Library view ─────────────────────────────────────────────────────── */

async function refreshLibrary() {
  const list = $('galAdmAlbumsList');
  if (!list) return;

  const yearFilter = $('galAdmYearFilter')?.value || '';
  const typeFilter = $('galAdmTypeFilter')?.value || '';
  const showUnpub  = $('galAdmShowUnpublished')?.checked || false;

  albumsCache = await fetchAlbums({
    year: yearFilter ? Number(yearFilter) : undefined,
    eventType: typeFilter || undefined,
    includeUnpublished: showUnpub,
  });

  // Year filter dropdown population
  const yearSel = $('galAdmYearFilter');
  if (yearSel) {
    const allYears = await fetchAvailableYears({ includeUnpublished: true });
    const current = yearSel.value;
    yearSel.innerHTML = `<option value="">Todos los años</option>` +
      allYears.map(y => `<option value="${y}">${y}</option>`).join('');
    if (current && allYears.includes(Number(current))) yearSel.value = current;
  }

  if (!albumsCache.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-images"></i>
        <p>Aún no hay álbumes. Crea el primero con el botón <strong>Nuevo álbum</strong>.</p>
      </div>`;
    return;
  }

  list.innerHTML = albumsCache.map(a => {
    const cover = a.cover_url || '';
    const typeLabel = a.event_type ? EVENT_TYPE_LABEL[a.event_type] : '';
    return `
      <div class="gal-adm-card" data-gal-album="${a.id}">
        <div class="gal-adm-card__cover">
          ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<div class="gal-adm-card__empty"><i class="fas fa-image"></i></div>`}
          ${!a.is_published ? `<span class="gal-adm-card__badge gal-adm-card__badge--draft">Borrador</span>` : ''}
          ${a.is_featured  ? `<span class="gal-adm-card__badge gal-adm-card__badge--featured"><i class="fas fa-star"></i></span>` : ''}
        </div>
        <div class="gal-adm-card__body">
          <h3>${esc(a.title)}</h3>
          <p class="gal-adm-card__meta">
            <span>${a.year}</span>
            ${typeLabel ? `<span>· ${esc(typeLabel)}</span>` : ''}
            <span>· ${a.photo_count ?? 0} ${a.photo_count === 1 ? 'foto' : 'fotos'}</span>
          </p>
        </div>
        <button class="btn btn--ghost" data-gal-edit="${a.id}"><i class="fas fa-pen"></i> Editar</button>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-gal-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditor(btn.dataset.galEdit));
  });
}

/* ── Editor view ──────────────────────────────────────────────────────── */

async function openEditor(albumId) {
  // Reset fields
  const fields = {
    galAdmId: '', galAdmTitle: '', galAdmYear: new Date().getFullYear(),
    galAdmDate: '', galAdmDesc: '',
  };
  Object.entries(fields).forEach(([k, v]) => { const el = $(k); if (el) el.value = v ?? ''; });
  $('galAdmType').value = '';
  $('galAdmPublished').checked = true;
  $('galAdmFeatured').checked = false;
  $('galAdmError').style.display = 'none';

  // Awaited before the picker renders: an empty select would save as "no event"
  // and silently drop an album's existing link.
  const eventOptions = await loadEventOptions();
  if ($('galAdmEvent')) $('galAdmEvent').innerHTML = eventOptionsHtml(eventOptions, null);

  unsubPhotos?.(); unsubPhotos = null;

  if (albumId) {
    const a = await fetchAlbumByIdAdmin(albumId);
    if (!a) { toast('Álbum no encontrado', 'error'); return; }
    currentAlbum = a;
    $('galAdmEditorTitle').textContent = 'Editar álbum';
    $('galAdmId').value     = a.id;
    $('galAdmTitle').value  = a.title || '';
    $('galAdmYear').value   = a.year ?? new Date().getFullYear();
    $('galAdmType').value   = a.event_type || '';
    $('galAdmDate').value   = a.event_date || '';
    $('galAdmDesc').value   = a.description || '';
    $('galAdmPublished').checked = a.is_published !== false;
    $('galAdmFeatured').checked  = !!a.is_featured;
    if ($('galAdmEvent')) $('galAdmEvent').innerHTML = eventOptionsHtml(eventOptions, a.special_event_id);
    $('galAdmDeleteBtn').style.display = '';

    // Show photos section
    $('galAdmPhotosWrap').hidden = false;
    currentPhotos = await fetchPhotos(a.id);
    renderPhotoGrid();

    // Realtime
    unsubPhotos = subscribePhotos(a.id, async () => {
      currentPhotos = await fetchPhotos(a.id);
      renderPhotoGrid();
    });
  } else {
    currentAlbum = null;
    currentPhotos = [];
    $('galAdmEditorTitle').textContent = 'Nuevo álbum';
    $('galAdmDeleteBtn').style.display = 'none';
    // Photo section is visible even before save — handleFiles() will auto-create the album
    // the first time someone drops/picks a file.
    $('galAdmPhotosWrap').hidden = false;
    renderPhotoGrid();
  }

  showEditor();
  window.scrollTo(0, 0);
}

/**
 * Persist whatever is in the editor form to gallery_albums.
 * Returns { data, error, isNew, silent } so callers can decide whether to toast.
 *
 * When `silent` is true we skip the success toast (the calling flow will show
 * its own — e.g. handleFiles auto-saving on first drop).
 */
async function saveAlbumFromEditor({ silent = false } = {}) {
  const errEl = $('galAdmError');
  errEl.style.display = 'none';

  const title = $('galAdmTitle').value.trim();
  const year  = Number($('galAdmYear').value);
  if (!title) {
    errEl.textContent = 'El título es obligatorio.'; errEl.style.display = '';
    $('galAdmTitle').focus();
    return { error: 'missing-title' };
  }
  if (!year || year < 2000 || year > 2100) {
    errEl.textContent = 'Año inválido.'; errEl.style.display = '';
    $('galAdmYear').focus();
    return { error: 'bad-year' };
  }

  const payload = {
    id:               $('galAdmId').value || undefined,
    title,
    year,
    event_type:       $('galAdmType').value || null,
    event_date:       $('galAdmDate').value || null,
    special_event_id: $('galAdmEvent')?.value || null,
    description:      $('galAdmDesc').value.trim() || null,
    is_published:     $('galAdmPublished').checked,
    is_featured:      $('galAdmFeatured').checked,
  };
  if (!payload.id) delete payload.id;

  const btn = $('galAdmSaveBtn');
  if (btn) btn.disabled = true;
  const { data, error } = await upsertAlbum(payload);
  if (btn) btn.disabled = false;
  if (error) { errEl.textContent = error; errEl.style.display = ''; return { error }; }

  const isNew = !payload.id;
  currentAlbum = data;
  $('galAdmId').value = data.id;
  $('galAdmDeleteBtn').style.display = '';
  $('galAdmPhotosWrap').hidden = false;
  $('galAdmEditorTitle').textContent = 'Editar álbum';

  if (!silent) {
    toast(isNew ? 'Álbum creado — ahora puedes subir fotos' : 'Álbum guardado', 'success');
  }

  // Refresh photo list (might already have photos if editing)
  currentPhotos = await fetchPhotos(data.id);
  renderPhotoGrid();

  if (isNew) {
    // Wire realtime for the new album
    unsubPhotos?.();
    unsubPhotos = subscribePhotos(data.id, async () => {
      currentPhotos = await fetchPhotos(data.id);
      renderPhotoGrid();
    });
  }

  return { data, isNew };
}

async function deleteCurrentAlbum() {
  if (!currentAlbum?.id) return;
  const ok = await confirm('Eliminar álbum',
    `¿Eliminar "${currentAlbum.title}" con todas sus fotos? Esto no se puede deshacer.`);
  if (!ok) return;
  const { error } = await deleteAlbum(currentAlbum.id);
  if (error) { toast(error, 'error'); return; }
  toast('Álbum eliminado', 'success');
  showLibrary();
  refreshLibrary();
}

/* ── Photo upload ─────────────────────────────────────────────────────── */

async function handleFiles(files) {
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!list.length) { toast('Solo imágenes', 'error'); return; }

  // If the album hasn't been saved yet, auto-save it now so the user doesn't
  // have to click "Guardar álbum" before they can upload. Requires title + year
  // to be filled — saveAlbumFromEditor handles validation and focuses the field.
  if (!currentAlbum?.id) {
    const inp = $('galFileInput');
    if (inp) inp.value = '';   // clear so the user can re-pick after fixing form
    const res = await saveAlbumFromEditor({ silent: true });
    if (res?.error || !currentAlbum?.id) {
      toast('Pon un título y año antes de subir fotos', 'error');
      return;
    }
    toast('Álbum creado — subiendo fotos…', 'info');
  }

  const queue = $('galUploadQueue');
  if (!queue) return;
  queue.hidden = false;
  queue.innerHTML = list.map((f, i) => `
    <div class="gal-upload-item" data-up="${i}">
      <span class="gal-upload-item__name">${esc(f.name)}</span>
      <span class="gal-upload-item__status" data-status>Preparando…</span>
    </div>`).join('');

  // Upload sequentially (so the UI is predictable and storage isn't slammed)
  let ok = 0, fail = 0;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const row = queue.querySelector(`[data-up="${i}"] [data-status]`);
    try {
      if (row) row.textContent = 'Optimizando…';
      const { data, error } = await uploadPhoto(f, currentAlbum.id);
      if (error) throw new Error(error);
      if (row) { row.textContent = '✓ Subida'; row.classList.add('gal-upload-item__status--ok'); }
      ok++;
    } catch (e) {
      console.warn('[gallery upload]', f.name, e);
      if (row) { row.textContent = `✗ ${e.message || 'Error'}`; row.classList.add('gal-upload-item__status--err'); }
      fail++;
    }
  }

  if (ok) toast(`${ok} foto${ok === 1 ? '' : 's'} subida${ok === 1 ? '' : 's'}${fail ? `, ${fail} con error` : ''}`, fail ? 'info' : 'success');
  else if (fail) toast(`Error al subir ${fail} foto${fail === 1 ? '' : 's'}`, 'error');

  // Hide the queue after a moment so it doesn't pile up
  setTimeout(() => { queue.hidden = true; queue.innerHTML = ''; }, 3000);

  // Reset the input so re-selecting the same file fires change again
  const inp = $('galFileInput');
  if (inp) inp.value = '';

  // Refresh photos
  currentPhotos = await fetchPhotos(currentAlbum.id);
  renderPhotoGrid();
}

/* ── Photo grid ───────────────────────────────────────────────────────── */

function renderPhotoGrid() {
  const grid = $('galAdmPhotoGrid');
  const count = $('galAdmPhotoCount');
  if (!grid) return;
  if (count) count.textContent = `(${currentPhotos.length})`;

  if (!currentPhotos.length) {
    grid.innerHTML = `<div class="gal-adm-grid__empty">Aún no hay fotos. Arrastra arriba para subir.</div>`;
    return;
  }

  grid.innerHTML = currentPhotos.map((p) => {
    const isCover = currentAlbum?.cover_photo_id === p.id;
    return `
      <div class="gal-adm-photo${isCover ? ' is-cover' : ''}" data-photo="${p.id}" draggable="true">
        <img src="${esc(p.thumbnail_url || p.public_url)}" alt="${esc(p.caption || '')}" loading="lazy">
        ${isCover ? `<span class="gal-adm-photo__badge"><i class="fas fa-star"></i> Portada</span>` : ''}
        <div class="gal-adm-photo__actions">
          ${!isCover ? `<button class="gal-adm-photo__btn" data-photo-cover="${p.id}" title="Usar como portada"><i class="fas fa-star"></i></button>` : ''}
          <button class="gal-adm-photo__btn gal-adm-photo__btn--danger" data-photo-del="${p.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-photo-cover]').forEach(b =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = b.dataset.photoCover;
      const photo = currentPhotos.find(x => x.id === id);
      if (!photo) return;
      const { error } = await setAlbumCover(currentAlbum.id, id, photo.webp_url || photo.public_url || photo.thumbnail_url);
      if (error) { toast(error, 'error'); return; }
      toast('Portada actualizada', 'success');
      currentAlbum = await fetchAlbumByIdAdmin(currentAlbum.id);
      renderPhotoGrid();
    })
  );

  grid.querySelectorAll('[data-photo-del]').forEach(b =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = b.dataset.photoDel;
      const photo = currentPhotos.find(x => x.id === id);
      if (!photo) return;
      const ok = await confirm('Eliminar foto', '¿Eliminar esta foto? No se puede recuperar.');
      if (!ok) return;
      const { error } = await deletePhoto(photo);
      if (error) { toast(error, 'error'); return; }
      toast('Foto eliminada', 'success');
      currentPhotos = await fetchPhotos(currentAlbum.id);
      renderPhotoGrid();
    })
  );

  // Drag-to-reorder (desktop)
  let draggingId = null;
  grid.querySelectorAll('[data-photo]').forEach(el => {
    el.addEventListener('dragstart', () => { draggingId = el.dataset.photo; el.classList.add('is-dragging'); });
    el.addEventListener('dragend',   () => { el.classList.remove('is-dragging'); });
    el.addEventListener('dragover',  (e) => { e.preventDefault(); el.classList.add('is-drop-target'); });
    el.addEventListener('dragleave', () => { el.classList.remove('is-drop-target'); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('is-drop-target');
      const targetId = el.dataset.photo;
      if (!draggingId || draggingId === targetId) return;
      const ids = currentPhotos.map(p => p.id);
      const fromIdx = ids.indexOf(draggingId);
      const toIdx   = ids.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const moved = ids.splice(fromIdx, 1)[0];
      ids.splice(toIdx, 0, moved);
      const { error } = await reorderPhotos(currentAlbum.id, ids);
      if (error) { toast(error, 'error'); return; }
      currentPhotos = await fetchPhotos(currentAlbum.id);
      renderPhotoGrid();
    });
  });
}
