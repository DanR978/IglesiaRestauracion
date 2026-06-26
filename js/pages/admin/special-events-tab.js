// js/pages/admin/special-events-tab.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin tab: "Registraciones" (Eventos con Registro).
// Three local views:
//   • list   — all special events + registration counts
//   • form   — create / edit a special event (title, image, info, date, …)
//   • detail — one event: QR panel + registrations table (filter/sort/export/print)
//
// Reuses existing admin UI utilities (toast, confirm, action-sheet), the events
// table styling, the shared QR helpers, and the pdfmake export pattern.
// Restricted to admins (nav button is data-admin-only; RLS enforces server-side).
// ─────────────────────────────────────────────────────────────────────────────

import { sb, currentUser, isAdmin } from './state.js';
import { toast, confirm } from './ui.js';
import { html, esc } from '/js/utils/escape.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { generateQrDataUrl, generateQrBlob, copyText, slugifyTitle } from '/js/lib/qr.js';
import { formatUSPhoneNational } from '/js/lib/validators.js';
import { mountRichText } from '/js/lib/rich-text.js';
import { htmlIsEmpty } from '/js/lib/sanitize-html.js';

const DEFAULT_LOC = '2601 Clays Mill Rd, Lexington, KY 40503';
const PUBLIC_ORIGIN = 'https://www.irdlex.org';

// ── Module state ─────────────────────────────────────────────────────────────
let booted        = false;
let eventsCache   = [];
let currentEvent  = null;
let regsCache     = [];                 // all registrations for currentEvent
let sortKey       = 'submitted_at';
let sortDir       = 'desc';
let imgUrl        = '';                  // selected image for the form
let unsubRegs     = null;
let descEditor    = null;                // rich-text editors (mounted once)
let infoEditor    = null;

// ── DOM helpers ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function seShowView(name) {
  ['list', 'form', 'detail'].forEach(v => {
    const el = $(`se-view-${v}`);
    if (el) el.classList.toggle('active', v === name);
  });
  window.scrollTo(0, 0);
}

function publicUrl(ev) {
  return `${PUBLIC_ORIGIN}/eventos/evento-especial.html?e=${encodeURIComponent(ev.slug)}`;
}

// Save a file the right way per device: on phones use the native share sheet
// (Web Share API w/ files) so the user can Save to Files / Save Image to Photos;
// on desktop fall back to a normal download.
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; /* else fall through */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}

// Single overflow menu (kebab "Opciones"). Opens on click, closes on item
// click, outside click, or Escape. Item actions stay wired by their own IDs.
function wireOptionsMenu() {
  const toggle = $('seOptionsToggle'), menu = $('seOptionsMenu');
  if (!toggle || !menu) return;
  const close = () => {
    menu.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('is-active');
  };
  const open = () => {
    menu.removeAttribute('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-active');
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hasAttribute('hidden') ? open() : close();
  });
  menu.addEventListener('click', close);            // any item closes the menu
  document.addEventListener('click', (e) => {
    if (!menu.hasAttribute('hidden') && !e.target.closest('#seOptionsWrap')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    });
  } catch { return iso; }
}
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/New_York',
    });
  } catch { return iso; }
}
function toLocalDTInput(iso) {
  try {
    const d = new Date(iso), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function loadSpecialEvents() {
  if (!isAdmin()) return;
  if (!booted) { boot(); booted = true; }
  seShowView('list');
  await renderList();
}

function boot() {
  $('seNewBtn')?.addEventListener('click', openNewEvent);
  $('seFormBack')?.addEventListener('click', () => seShowView('list'));
  $('seFormCancel')?.addEventListener('click', () => seShowView('list'));
  $('seSaveBtn')?.addEventListener('click', saveEvent);

  $('seDetailBack')?.addEventListener('click', () => { stopRegsRealtime(); seShowView('list'); renderList(); });
  $('seEditBtn')?.addEventListener('click', () => currentEvent && openEditEvent(currentEvent.id));

  // Overflow "Opciones" menu — folds share/export/print behind one button.
  wireOptionsMenu();

  // Share / QR opens as a popup (desktop + mobile).
  const shareModal = $('seShareModal');
  $('seShareToggle')?.addEventListener('click', () => shareModal?.classList.add('open'));
  $('seShareClose')?.addEventListener('click', () => shareModal?.classList.remove('open'));
  shareModal?.addEventListener('click', e => { if (e.target === shareModal) shareModal.classList.remove('open'); });

  $('seQrDownload')?.addEventListener('click', onQrDownload);
  $('seQrCopy')?.addEventListener('click', onQrCopy);
  $('seQrPrint')?.addEventListener('click', printQrFlyer);

  // Exports
  $('seExportCsv')?.addEventListener('click', exportCsv);
  $('seExportPdf')?.addEventListener('click', exportPdf);
  $('sePrintRoster')?.addEventListener('click', printRoster);

  mountImgPicker();
  if ($('seDescEditor')) descEditor = mountRichText($('seDescEditor'), { placeholder: 'De qué se trata el evento...' });
  if ($('seInfoEditor')) infoEditor = mountRichText($('seInfoEditor'), { placeholder: 'Detalles logísticos: qué traer, horarios, edades, etc.' });
}

// ── LIST view ────────────────────────────────────────────────────────────────
async function renderList() {
  const el = $('seList');
  if (!el) return;
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

  const { data: events, error } = await sb
    .from('special_events')
    .select('*')
    .order('event_at', { ascending: false, nullsFirst: false });
  if (error) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error: ${esc(error.message)}</p></div>`;
    return;
  }
  eventsCache = events || [];

  // Registration counts (one grouped query)
  const counts = {};
  if (eventsCache.length) {
    const { data: regs } = await sb.from('event_registrations').select('event_id');
    (regs || []).forEach(r => { counts[r.event_id] = (counts[r.event_id] || 0) + 1; });
  }

  if (!eventsCache.length) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard-list"></i>
        <p>Aún no hay eventos con registro. Crea el primero con el botón de arriba.</p>
      </div>`;
    return;
  }

  const cards = eventsCache.map(ev => {
    const n = counts[ev.id] || 0;
    const img = ev.image_url
      ? `<img class="se-evcard__img" src="${esc(ev.image_url)}" alt="">`
      : `<div class="se-evcard__img se-evcard__img--empty"><i class="fas fa-calendar-star"></i></div>`;
    const openBadge = ev.registration_open
      ? `<span class="cat-badge cat--servicio">Abierto</span>`
      : `<span class="cat-badge cat--otro">Cerrado</span>`;
    return `
      <div class="se-evcard" data-se-row="${esc(ev.id)}">
        ${img}
        <div class="se-evcard__body">
          <div class="se-evcard__title">${esc(ev.title)}</div>
          <div class="se-evcard__meta">${esc(fmtDate(ev.event_at))} · ${n} inscrito${n === 1 ? '' : 's'}</div>
          <div class="se-evcard__badges">${openBadge}</div>
        </div>
        <button class="kebab-btn se-evcard__menu" title="Opciones" aria-label="Más opciones" data-se-menu="${esc(ev.id)}">
          <i class="fas fa-ellipsis-vertical"></i>
        </button>
      </div>`;
  }).join('');

  el.innerHTML = `<div class="se-evlist">${cards}</div>`;

  // Row click → open detail; kebab → action sheet
  el.querySelectorAll('[data-se-row]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.kebab-btn')) return;
      openDetail(tr.dataset.seRow);
    });
  });
  el.querySelectorAll('.kebab-btn[data-se-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.seMenu;
      const ev = eventsCache.find(x => x.id === id);
      showActionSheet({
        trigger: btn,
        title: ev?.title || 'Evento',
        actions: [
          { label: 'Ver registros', icon: 'fa-clipboard-list', onClick: () => openDetail(id) },
          { label: 'Editar evento',  icon: 'fa-pen',            onClick: () => openEditEvent(id) },
          { label: 'Eliminar evento', icon: 'fa-trash', variant: 'danger', onClick: () => deleteEvent(id) },
        ],
      });
    });
  });
}

async function deleteEvent(id) {
  const ev = eventsCache.find(x => x.id === id);
  const ok = await confirm('¿Eliminar evento?',
    `"${ev?.title || 'Este evento'}" y todas sus inscripciones se eliminarán permanentemente.`);
  if (!ok) return;
  const { error } = await sb.from('special_events').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento eliminado', 'success');
  renderList();
}

// ── FORM view ────────────────────────────────────────────────────────────────
function openNewEvent() {
  $('seFormTitle').textContent = 'Nuevo Evento con Registro';
  $('seId').value       = '';
  $('seTitle').value    = '';
  descEditor?.setHtml('');
  infoEditor?.setHtml('');
  $('seDate').value     = '';
  $('seLocation').value = DEFAULT_LOC;
  $('seRegOpen').checked = true;
  clearImg();
  $('seFormError').style.display = 'none';
  seShowView('form');
}

function openEditEvent(id) {
  const ev = eventsCache.find(x => x.id === id) || currentEvent;
  if (!ev) return;
  $('seFormTitle').textContent = 'Editar Evento';
  $('seId').value       = ev.id;
  $('seTitle').value    = ev.title || '';
  descEditor?.setHtml(ev.description || '');
  infoEditor?.setHtml(ev.information || '');
  $('seDate').value     = ev.event_at ? toLocalDTInput(ev.event_at) : '';
  $('seLocation').value = ev.location || DEFAULT_LOC;
  $('seRegOpen').checked = ev.registration_open !== false;
  clearImg();
  if (ev.image_url) setImg(ev.image_url);
  $('seFormError').style.display = 'none';
  seShowView('form');
}

async function uniqueSlug(title, currentId) {
  const base = slugifyTitle(title);
  for (let attempt = 0; attempt < 6; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const slug = `${base}-${suffix}`;
    const { data } = await sb.from('special_events').select('id').eq('slug', slug).maybeSingle();
    if (!data || data.id === currentId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function saveEvent() {
  const title = $('seTitle').value.trim();
  const errEl = $('seFormError');
  errEl.style.display = 'none';
  if (!title) { errEl.textContent = 'El título es obligatorio.'; errEl.style.display = ''; return; }

  const id = $('seId').value;
  const dateVal = $('seDate').value;
  const descHtml = descEditor?.getHtml() || '';   // already sanitized by the editor
  const infoHtml = infoEditor?.getHtml() || '';
  const payload = {
    title,
    image_url:         imgUrl || null,
    description:       htmlIsEmpty(descHtml) ? null : descHtml,
    information:       htmlIsEmpty(infoHtml) ? null : infoHtml,
    event_at:          dateVal ? new Date(dateVal).toISOString() : null,
    location:          $('seLocation').value.trim() || null,
    registration_open: $('seRegOpen').checked,
  };

  const btn = $('seSaveBtn');
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  let savedId = id;
  let error;
  if (id) {
    ({ error } = await sb.from('special_events').update(payload).eq('id', id));
  } else {
    payload.slug = await uniqueSlug(title, null);
    payload.created_by = currentUser?.id || null;
    const { data, error: insErr } = await sb.from('special_events').insert(payload).select('id').single();
    error = insErr;
    savedId = data?.id;
  }

  btn.disabled = false;
  btn.innerHTML = original;
  if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }

  toast(id ? 'Evento actualizado' : 'Evento creado', 'success');
  if (savedId) openDetail(savedId);
  else { seShowView('list'); renderList(); }
}

// ── Image picker (upload to event-images bucket + pick existing) ──────────────
let imgPickerMounted = false;
function mountImgPicker() {
  const section = $('seImgSection');
  if (!section || imgPickerMounted) return;
  imgPickerMounted = true;
  section.innerHTML = `
    <div class="img-grid">
      <div class="img-opt" id="se-opt-upload">
        <i class="fas fa-upload" style="font-size:1.4rem;margin-bottom:.3rem;color:var(--color-muted)"></i>
        <div style="font-size:.78rem;font-weight:600">Subir nueva</div>
        <div style="font-size:.68rem;color:var(--color-muted)">JPG, PNG, WebP</div>
        <input type="file" accept="image/*" id="se-file">
      </div>
      <div class="img-opt" id="se-opt-gallery">
        <i class="fas fa-images" style="font-size:1.4rem;margin-bottom:.3rem;color:var(--color-muted)"></i>
        <div style="font-size:.78rem;font-weight:600">Usar existente</div>
        <div style="font-size:.68rem;color:var(--color-muted)">Del almacén</div>
      </div>
    </div>
    <div class="img-gallery" id="se-gallery" style="display:none"></div>
    <div class="img-preview-wrap" id="se-preview-wrap" style="display:none">
      <img class="img-preview" id="se-preview" alt="">
      <button type="button" class="img-del-btn" id="se-del"><i class="fas fa-trash"></i></button>
    </div>
    <div style="font-size:.7rem;color:var(--color-muted);margin-top:.3rem" id="se-img-status"></div>`;
  $('se-opt-gallery').onclick = toggleGallery;
  $('se-file').onchange = handleUpload;
  $('se-del').onclick = clearImg;
}

function setImg(url) {
  imgUrl = url;
  $('se-preview').src = url;
  $('se-preview-wrap').style.display = 'inline-block';
}
function clearImg() {
  imgUrl = '';
  if ($('se-preview')) $('se-preview').src = '';
  if ($('se-preview-wrap')) $('se-preview-wrap').style.display = 'none';
  if ($('se-img-status')) $('se-img-status').textContent = '';
  const f = $('se-file'); if (f) f.value = '';
  const g = $('se-gallery'); if (g) { g.style.display = 'none'; }
}

async function handleUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  $('se-preview').src = URL.createObjectURL(file);
  $('se-preview-wrap').style.display = 'inline-block';
  $('se-img-status').textContent = 'Subiendo...';
  const fn = `special-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${file.name.split('.').pop()}`;
  const { error } = await sb.storage.from('event-images').upload(fn, file, { cacheControl: '3600', upsert: false });
  if (error) { $('se-img-status').textContent = 'Error al subir.'; return; }
  const { data: u } = sb.storage.from('event-images').getPublicUrl(fn);
  imgUrl = u.publicUrl;
  $('se-img-status').textContent = 'Subida ✓';
}

let galleryLoaded = false;
async function toggleGallery() {
  const g = $('se-gallery');
  const show = g.style.display === 'none';
  g.style.display = show ? 'grid' : 'none';
  if (show && !galleryLoaded) {
    galleryLoaded = true;
    g.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-muted)">Cargando...</div>';
    const { data, error } = await sb.storage.from('event-images')
      .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
    if (error || !data) { g.innerHTML = '<div style="padding:1rem;color:var(--color-danger)">Error al cargar.</div>'; return; }
    const imgs = data.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
    if (!imgs.length) { g.innerHTML = '<div style="padding:1rem;color:var(--color-muted)">No hay imágenes.</div>'; return; }
    g.innerHTML = imgs.map(img => {
      const { data: u } = sb.storage.from('event-images').getPublicUrl(img.name);
      return `<div class="img-gal-item" data-url="${esc(u.publicUrl)}"><img src="${esc(u.publicUrl)}" alt="" loading="lazy"></div>`;
    }).join('');
    g.querySelectorAll('.img-gal-item').forEach(item => item.onclick = () => {
      g.querySelectorAll('.img-gal-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      setImg(item.dataset.url);
      $('se-img-status').textContent = 'Seleccionada ✓';
    });
  }
}

// ── DETAIL view (QR + registrations) ─────────────────────────────────────────
async function openDetail(id) {
  const { data: ev, error } = await sb.from('special_events').select('*').eq('id', id).single();
  if (error || !ev) { toast('No se pudo cargar el evento', 'error'); return; }
  currentEvent = ev;
  seShowView('detail');

  $('seDetailTitle').textContent = ev.title || 'Evento';

  // QR + public URL
  const url = publicUrl(ev);
  try {
    $('seQrImg').src = await generateQrDataUrl(url, 320);
    $('seQrImg').style.display = '';
  } catch { $('seQrImg').style.display = 'none'; }

  await loadRegistrations();
  startRegsRealtime(ev.id);
}

async function loadRegistrations() {
  const el = $('seRegTable');
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando inscripciones...</div>';
  const { data, error } = await sb.from('event_registrations')
    .select('*').eq('event_id', currentEvent.id);
  if (error) { el.innerHTML = `<div class="empty-state"><p>Error: ${esc(error.message)}</p></div>`; return; }
  regsCache = data || [];
  renderRegistrations();
}

function startRegsRealtime(eventId) {
  stopRegsRealtime();
  if (!sb?.channel) return;
  unsubRegs = sb.channel(`event-regs-${eventId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'event_registrations', filter: `event_id=eq.${eventId}` },
      () => loadRegistrations())
    .subscribe();
}
function stopRegsRealtime() {
  if (unsubRegs) { try { sb.removeChannel(unsubRegs); } catch {} unsubRegs = null; }
}

// ── Rows (alphabetical by last name; no filtering) ───────────────────────────
function currentRows() {
  return regsCache.slice().sort((a, b) => {
    const an = `${a.last_name} ${a.first_name}`.toLowerCase();
    const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

// Columns shared by the CSV + PDF exports (label, value-getter).
const EXPORT_COLS = [
  ['Nombre',                r => r.first_name],
  ['Apellido',              r => r.last_name],
  ['Edad',                  r => r.age],
  ['Sexo',                  r => r.sex || ''],
  ['Contacto de emergencia',r => r.contact_name],
  ['Parentesco',            r => r.relationship],
  ['Teléfono',              r => formatUSPhoneNational(r.contact_phone)],
  ['Email',                 r => r.contact_email || ''],
  ['Alergias',              r => r.allergies || ''],
  ['Condiciones médicas',   r => r.medical_conditions || ''],
  ['Notas',                 r => r.notes || ''],
  ['Inscrito',              r => fmtDateTime(r.submitted_at)],
];

function renderRegistrations() {
  const el = $('seRegTable');
  if (!el || !currentEvent) return;
  $('seRegCount').textContent = `${regsCache.length} inscrito${regsCache.length === 1 ? '' : 's'}`;

  if (!regsCache.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-user-plus"></i><p>Aún no hay inscripciones para este evento.</p></div>`;
    return;
  }

  // Compact: first + last name, with an info button for everything else.
  el.innerHTML = `<div class="se-reglist">` + currentRows().map(r => `
    <div class="se-regrow">
      <span class="se-regrow__name">${esc(r.first_name)} ${esc(r.last_name)}</span>
      <button class="icon-btn__admin se-regrow__info" data-reg-info="${esc(r.id)}" title="Ver detalles" aria-label="Ver detalles">
        <i class="fas fa-circle-info"></i>
      </button>
    </div>`).join('') + `</div>`;

  el.querySelectorAll('[data-reg-info]').forEach(b =>
    b.addEventListener('click', () => showRegInfo(b.dataset.regInfo)));
}

// Modal with one registration's full details (+ print).
function showRegInfo(id) {
  const r = regsCache.find(x => x.id === id);
  if (!r) return;
  const phone = formatUSPhoneNational(r.contact_phone);
  const line = (label, val) => (val || val === 0)
    ? `<div class="se-reginfo__row"><span class="se-reginfo__label">${esc(label)}</span><span>${esc(val)}</span></div>` : '';
  const body = `
    ${line('Edad', r.age)}
    ${line('Sexo', r.sex)}
    ${line('Contacto de emergencia', r.contact_name)}
    ${line('Parentesco', r.relationship)}
    <div class="se-reginfo__row"><span class="se-reginfo__label">Teléfono</span><a href="tel:${esc(r.contact_phone)}">${esc(phone)}</a></div>
    ${r.contact_email ? `<div class="se-reginfo__row"><span class="se-reginfo__label">Email</span><a href="mailto:${esc(r.contact_email)}">${esc(r.contact_email)}</a></div>` : ''}
    ${line('Alergias', r.allergies)}
    ${line('Condiciones médicas', r.medical_conditions)}
    ${line('Notas', r.notes)}
    ${line('Inscrito', fmtDateTime(r.submitted_at))}`;

  let m = $('seRegInfoModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'seRegInfoModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title" id="seRegInfoTitle"></h2>
          <button class="modal__close" id="seRegInfoClose" aria-label="Cerrar">×</button>
        </div>
        <div class="modal__body" id="seRegInfoBody"></div>
        <div class="modal__footer">
          <button class="btn btn--ghost" id="seRegInfoPrint"><i class="fas fa-print"></i> Imprimir</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    $('seRegInfoClose').addEventListener('click', () => m.classList.remove('open'));
  }
  $('seRegInfoTitle').textContent = `${r.first_name} ${r.last_name}`;
  $('seRegInfoBody').innerHTML = body;
  $('seRegInfoPrint').onclick = () => printOne(id);
  m.classList.add('open');
}

// ── QR actions ───────────────────────────────────────────────────────────────
async function onQrDownload() {
  if (!currentEvent) return;
  const btn = $('seQrDownload');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const blob = await generateQrBlob(publicUrl(currentEvent), 1024);
    if (!blob || blob.size < 500) throw new Error('Imagen QR vacía');
    await saveFile(blob, `qr-${currentEvent.slug}.png`);
    toast(isMobile() ? 'Guárdalo en Fotos o Archivos' : 'QR descargado', 'success');
  } catch (e) {
    console.error(e); toast('No se pudo generar el QR', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = original;
  }
}
async function onQrCopy() {
  if (!currentEvent) return;
  const ok = await copyText(publicUrl(currentEvent));
  toast(ok ? 'Enlace copiado al portapapeles' : 'No se pudo copiar el enlace', ok ? 'success' : 'error');
}

// ── CSV export (currently filtered rows) ─────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function exportCsv() {
  if (!currentEvent) return;
  const rows = currentRows();
  if (!rows.length) { toast('No hay inscripciones para exportar', 'error'); return; }
  const lines = [EXPORT_COLS.map(c => csvCell(c[0])).join(',')];
  rows.forEach(r => lines.push(EXPORT_COLS.map(c => csvCell(c[1](r))).join(',')));
  // BOM so Excel reads accents (UTF-8) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  await saveFile(blob, `inscritos-${currentEvent.slug}.csv`);
  toast(isMobile() ? 'Elige dónde guardar el CSV' : `${rows.length} inscripciones exportadas`, 'success');
}

// ── PDF roster export (pdfmake) ──────────────────────────────────────────────
let _pm = null;
function loadPdfMake() {
  if (window.pdfMake && window.pdfMake.vfs) return Promise.resolve();
  if (_pm) return _pm;
  const load = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el generador de PDF.'));
    document.head.appendChild(s);
  });
  _pm = load('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js')
    .then(() => load('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js'));
  return _pm;
}

async function exportPdf() {
  if (!currentEvent) return;
  const rows = currentRows();
  if (!rows.length) { toast('No hay inscripciones para exportar', 'error'); return; }
  const btn = $('seExportPdf');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
  try {
    await loadPdfMake();
    // Drop Notas + submission date from the printed roster so columns fit cleanly.
    const dropCols = new Set(['Notas', 'Inscrito']);
    const flexCols = new Set(['Contacto de emergencia', 'Email', 'Alergias', 'Condiciones médicas']);
    const cols = EXPORT_COLS.filter(c => !dropCols.has(c[0]));
    const widths = cols.map(c => (flexCols.has(c[0]) ? '*' : 'auto'));
    const head = cols.map(c => ({ text: c[0], style: 'th' }));
    const body = [head, ...rows.map(r => cols.map(c => ({ text: String(c[1](r) ?? '') || '—', style: 'td' })))];

    const docDef = {
      pageSize: 'LETTER',
      pageOrientation: 'landscape',
      pageMargins: [28, 64, 28, 40],
      header: {
        margin: [28, 22, 28, 0],
        columns: [
          { text: currentEvent.title || 'Evento', style: 'title' },
          { text: 'Iglesia Restauración Divina', style: 'brand', alignment: 'right' },
        ],
      },
      footer: (cur, total) => ({
        margin: [28, 0, 28, 0],
        columns: [
          { text: `${fmtDate(currentEvent.event_at)}${currentEvent.location ? '  ·  ' + currentEvent.location : ''}`, style: 'foot' },
          { text: `Página ${cur} de ${total}`, alignment: 'right', style: 'foot' },
        ],
      }),
      content: [
        { text: `Lista de inscritos — ${rows.length} persona${rows.length === 1 ? '' : 's'}`, style: 'sub', margin: [0, 0, 0, 8] },
        { table: { headerRows: 1, widths, body }, layout: 'lightHorizontalLines' },
      ],
      styles: {
        title: { fontSize: 15, bold: true, color: '#0e2d38' },
        brand: { fontSize: 9, color: '#9a6a2c' },
        sub:   { fontSize: 11, color: '#394548' },
        th:    { fontSize: 8, bold: true, color: '#ffffff', fillColor: '#394548', margin: [0, 3, 0, 3] },
        td:    { fontSize: 8, color: '#222', margin: [0, 2, 0, 2] },
        foot:  { fontSize: 8, color: '#888' },
      },
    };
    // getBlob (not .download) so iOS can hand it to the share sheet → Save to Files.
    const blob = await new Promise(res => window.pdfMake.createPdf(docDef).getBlob(res));
    await saveFile(blob, `roster-${currentEvent.slug}.pdf`);
    toast(isMobile() ? 'Elige dónde guardar el PDF' : 'PDF generado', 'success');
  } catch (e) {
    console.error(e); toast(e.message || 'No se pudo generar el PDF', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = original;
  }
}

// ── Print (browser-friendly) ─────────────────────────────────────────────────
const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Lexend Deca', system-ui, sans-serif; color: #222; margin: 28px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #0e2d38; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #394548; color: #fff; text-align: left; padding: 6px 8px; }
  td { border-bottom: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
  .card { border: 1px solid #ccc; border-radius: 8px; padding: 18px; max-width: 560px; }
  .card h2 { margin: 0 0 10px; font-size: 16px; color: #0e2d38; }
  .row { display: flex; padding: 5px 0; border-bottom: 1px solid #eee; font-size: 13px; }
  .row b { width: 180px; color: #555; font-weight: 600; }
  @page { margin: 14mm; }
`;

function printHtml(title, bodyHtml, css = PRINT_CSS) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { console.error(e); }
    setTimeout(() => iframe.remove(), 1500);
  };
  // onload is reliable for written docs; fall back to a short timer.
  iframe.onload = go;
  setTimeout(go, 600);
}

// ── Printable QR flyer (standard paper poster) ───────────────────────────────
const FLYER_CSS = `
  @page { size: portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Lexend Deca', 'Signika', system-ui, sans-serif; }
  .flyer {
    width: 100%; min-height: 100vh; padding: 56px 52px 44px;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .flyer__brand {
    font-size: 14px; letter-spacing: .26em; font-weight: 700;
    color: #9a6a2c; text-transform: uppercase; margin-bottom: 34px;
  }
  .flyer__kicker {
    display: inline-block; font-size: 14px; letter-spacing: .12em; font-weight: 700;
    text-transform: uppercase; color: #fff; background: #9a6a2c;
    padding: 6px 16px; border-radius: 999px; margin-bottom: 16px;
  }
  .flyer__title { font-size: 42px; line-height: 1.06; font-weight: 800; color: #0e2d38; margin: 0 0 12px; }
  .flyer__meta { font-size: 17px; color: #555; margin: 0 0 28px; }
  .flyer__scan {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    font-size: 40px; font-weight: 800; letter-spacing: .03em; color: #0e2d38; margin: 4px 0 14px;
  }
  .flyer__scan svg { width: 38px; height: 38px; }
  .flyer__qrwrap {
    padding: 22px; background: #fff; border: 3px solid #0e2d38;
    border-radius: 26px; box-shadow: 0 10px 30px rgba(14,45,56,.18);
  }
  .flyer__qr { display: block; width: 330px; height: 330px; }
  .flyer__instr { font-size: 18px; color: #394548; margin: 22px 0 0; max-width: 460px; line-height: 1.4; }
  .flyer__url { margin-top: auto; padding-top: 30px; font-size: 14px; color: #8a8a8a; word-break: break-all; }
`;

async function printQrFlyer() {
  if (!currentEvent) return;
  const btn = $('seQrPrint');
  const original = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    const url = publicUrl(currentEvent);
    const qr = await generateQrDataUrl(url, 1024);
    const metaBits = [fmtDate(currentEvent.event_at), currentEvent.location].filter(b => b && b !== '—');
    // Down-chevron pointing at the QR — inline SVG (no FontAwesome in the print doc).
    const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="#0e2d38" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    printHtml(`Cartel — ${currentEvent.title || 'Evento'}`, `
      <div class="flyer">
        <div class="flyer__brand">Iglesia Restauración Divina</div>
        <div class="flyer__kicker">Inscripciones abiertas</div>
        <h1 class="flyer__title">${esc(currentEvent.title || 'Evento')}</h1>
        ${metaBits.length ? `<div class="flyer__meta">${esc(metaBits.join('  ·  '))}</div>` : ''}
        <div class="flyer__scan">¡Escanéame! ${arrow}</div>
        <div class="flyer__qrwrap"><img class="flyer__qr" src="${esc(qr)}" alt="Código QR"></div>
        <div class="flyer__instr">Apunta la cámara de tu teléfono al código para registrarte.</div>
        <div class="flyer__url">${esc(url)}</div>
      </div>`, FLYER_CSS);
  } catch (e) {
    console.error(e); toast('No se pudo generar el cartel', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

function printRoster() {
  if (!currentEvent) return;
  const rows = currentRows();
  if (!rows.length) { toast('No hay inscripciones para imprimir', 'error'); return; }
  const head = ['#','Nombre','Apellido','Edad','Sexo','Contacto','Parentesco','Teléfono','Email','Alergias','Condiciones','Enviado'];
  const body = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(r.first_name)}</td><td>${esc(r.last_name)}</td><td>${esc(r.age)}</td>
      <td>${esc(r.sex || '—')}</td><td>${esc(r.contact_name)}</td><td>${esc(r.relationship)}</td>
      <td>${esc(formatUSPhoneNational(r.contact_phone))}</td><td>${esc(r.contact_email || '—')}</td>
      <td>${esc(r.allergies || '—')}</td><td>${esc(r.medical_conditions || '—')}</td>
      <td>${esc(fmtDateTime(r.submitted_at))}</td>
    </tr>`).join('');
  printHtml(`Roster — ${currentEvent.title}`, `
    <h1>${esc(currentEvent.title || 'Evento')}</h1>
    <div class="meta">${esc(fmtDate(currentEvent.event_at))}${currentEvent.location ? ' · ' + esc(currentEvent.location) : ''} · ${rows.length} inscrito${rows.length === 1 ? '' : 's'}</div>
    <table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`);
}

function printOne(id) {
  const r = regsCache.find(x => x.id === id);
  if (!r || !currentEvent) return;
  const row = (label, val) => `<div class="row"><b>${esc(label)}</b><span>${esc(val || '—')}</span></div>`;
  printHtml(`${r.first_name} ${r.last_name} — ${currentEvent.title}`, `
    <div class="card">
      <h2>${esc(currentEvent.title || 'Evento')}</h2>
      ${row('Nombre', `${r.first_name} ${r.last_name}`)}
      ${row('Edad', r.age)}
      ${row('Sexo', r.sex)}
      ${row('Contacto de emergencia', r.contact_name)}
      ${row('Parentesco', r.relationship)}
      ${row('Teléfono', formatUSPhoneNational(r.contact_phone))}
      ${row('Email', r.contact_email)}
      ${row('Alergias', r.allergies)}
      ${row('Condiciones médicas', r.medical_conditions)}
      ${row('Notas', r.notes)}
      ${row('Inscrito', fmtDateTime(r.submitted_at))}
    </div>`);
}
