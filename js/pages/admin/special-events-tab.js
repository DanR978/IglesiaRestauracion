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
// Available to admins AND to any ministry_leader whose preset grants the
// "Registraciones" (special-events) page — e.g. Medios. RLS (pp_special_events /
// pp_event_registrations, keyed on has_tab('special-events')) enforces access
// server-side; the nav button only appears when the tab is granted.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, currentUser } from './state.js';
import { toast, confirm } from './ui.js';
import { html, esc } from '/js/utils/escape.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { generateQrDataUrl, generateQrBlob, copyText, slugifyTitle } from '/js/lib/qr.js';
import { formatUSPhoneNational } from '/js/lib/validators.js';
import { mountRichText } from '/js/lib/rich-text.js';
import { htmlIsEmpty } from '/js/lib/sanitize-html.js';
import { buildWaiverDocDef } from '/js/lib/waiver.js';
import { savePdf, imageDataUrl, churchDocDef, th } from '/js/lib/pdf.js';

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
let ageGroupsDraft = [];                 // working copy of the form's age groups

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
// Effective lifecycle state for display: an explicit status, but an event whose
// date has passed reads as "Finalizado" even if it was left open (the INSERT gate
// also refuses past-date registrations — see 20260627_event_lifecycle.sql).
function isPast(ev) {
  if (!ev?.event_at) return false;
  try { return new Date(ev.event_at).getTime() < Date.now(); } catch { return false; }
}
function effectiveStatus(ev) {
  const s = ev?.status || (ev?.registration_open === false ? 'closed' : 'open');
  if (s === 'open' && isPast(ev)) return 'finished';
  return s;
}
function statusBadge(ev) {
  const map = {
    open:      ['cat--servicio', 'Abierto'],
    closed:    ['cat--otro',     'Cerrado'],
    completed: ['cat--otro',     'Completado'],
    finished:  ['cat--otro',     'Finalizado'],
  };
  const [cls, label] = map[effectiveStatus(ev)] || map.open;
  return `<span class="cat-badge ${cls}">${label}</span>`;
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
  $('sePrintRoster')?.addEventListener('click', printRoster);
  $('sePrintWaiver')?.addEventListener('click', printWaiver);

  $('seAgeGroupAdd')?.addEventListener('click', addAgeGroup);

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
    const openBadge = statusBadge(ev);
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
  $('seStatus').value   = 'open';
  ageGroupsDraft = [];
  renderAgeGroupEditor();
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
  $('seStatus').value   = ev.status || (ev.registration_open === false ? 'closed' : 'open');
  ageGroupsDraft = normalizeAgeGroups(ev.age_groups);
  renderAgeGroupEditor();
  clearImg();
  if (ev.image_url) setImg(ev.image_url);
  $('seFormError').style.display = 'none';
  seShowView('form');
}

// ── Age groups editor (stored as JSON on the event) ──────────────────────────
const AGE_GROUP_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#14b8a6'];

// Map stored rows → editable draft (ages may already be numbers).
function normalizeAgeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(g => ({
    name:  typeof g?.name === 'string' ? g.name : '',
    min:   g?.min ?? '',
    max:   g?.max ?? '',
    color: typeof g?.color === 'string' ? g.color : AGE_GROUP_COLORS[0],
  }));
}

// Draft → persistable: drop incomplete rows, coerce ages to ints, sort by min.
function cleanAgeGroups(draft) {
  return (draft || [])
    .map(g => ({
      name:  String(g.name || '').trim().slice(0, 60),
      min:   parseInt(g.min, 10),
      max:   parseInt(g.max, 10),
      color: /^#[0-9a-fA-F]{6}$/.test(g.color) ? g.color : AGE_GROUP_COLORS[0],
    }))
    .filter(g => g.name && Number.isInteger(g.min) && Number.isInteger(g.max) && g.min <= g.max)
    .sort((a, b) => a.min - b.min);
}

function addAgeGroup() {
  ageGroupsDraft.push({ name: '', min: '', max: '', color: AGE_GROUP_COLORS[ageGroupsDraft.length % AGE_GROUP_COLORS.length] });
  renderAgeGroupEditor();
  // Focus the new row's name field.
  requestAnimationFrame(() => $('seAgeGroups')?.querySelector('.se-agrow:last-child input[data-ag="name"]')?.focus());
}

function renderAgeGroupEditor() {
  const host = $('seAgeGroups');
  if (!host) return;
  if (!ageGroupsDraft.length) {
    host.innerHTML = `<p style="font-size:.72rem;color:var(--color-muted);margin:.2rem 0 0">Sin grupos. Las inscripciones se mostrarán en una sola lista.</p>`;
    return;
  }
  host.innerHTML = ageGroupsDraft.map((g, i) => `
    <div class="se-agrow" style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin-bottom:.4rem">
      <input type="color" data-ag="color" data-i="${i}" value="${esc(g.color || AGE_GROUP_COLORS[0])}" title="Color" style="width:38px;height:38px;padding:0;border:none;background:none;cursor:pointer">
      <input type="text" data-ag="name" data-i="${i}" value="${esc(g.name || '')}" placeholder="Nombre (ej. Exploradores)" style="flex:1;min-width:140px">
      <input type="number" data-ag="min" data-i="${i}" value="${esc(g.min ?? '')}" placeholder="Mín" min="0" max="120" inputmode="numeric" aria-label="Edad mínima" style="width:70px">
      <span style="color:var(--color-muted)">–</span>
      <input type="number" data-ag="max" data-i="${i}" value="${esc(g.max ?? '')}" placeholder="Máx" min="0" max="120" inputmode="numeric" aria-label="Edad máxima" style="width:70px">
      <button type="button" class="icon-btn__admin" data-ag-remove="${i}" title="Quitar grupo" aria-label="Quitar grupo"><i class="fas fa-trash"></i></button>
    </div>`).join('');

  // Live-bind inputs without re-rendering (keeps focus while typing).
  host.querySelectorAll('[data-ag]').forEach(inp => inp.addEventListener('input', (e) => {
    const i = Number(e.target.dataset.i);
    if (ageGroupsDraft[i]) ageGroupsDraft[i][e.target.dataset.ag] = e.target.value;
  }));
  host.querySelectorAll('[data-ag-remove]').forEach(btn => btn.addEventListener('click', () => {
    ageGroupsDraft.splice(Number(btn.dataset.agRemove), 1);
    renderAgeGroupEditor();
  }));
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
  const status = $('seStatus').value || 'open';
  const descHtml = descEditor?.getHtml() || '';   // already sanitized by the editor
  const infoHtml = infoEditor?.getHtml() || '';
  const payload = {
    title,
    image_url:         imgUrl || null,
    description:       htmlIsEmpty(descHtml) ? null : descHtml,
    information:       htmlIsEmpty(infoHtml) ? null : infoHtml,
    event_at:          dateVal ? new Date(dateVal).toISOString() : null,
    location:          $('seLocation').value.trim() || null,
    status:            status,
    // `registration_open` stays the RLS gate; keep it in sync with status.
    registration_open: status === 'open',
    age_groups:        cleanAgeGroups(ageGroupsDraft),
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
  ['Exoneración',           r => (r.signature_image || r.signature_name) ? `Firmada ${fmtDate(r.waiver_signed_at)}` : 'Sin firma'],
];

function renderRegistrations() {
  const el = $('seRegTable');
  if (!el || !currentEvent) return;
  $('seRegCount').textContent = `${regsCache.length} inscrito${regsCache.length === 1 ? '' : 's'}`;

  if (!regsCache.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-user-plus"></i><p>Aún no hay inscripciones para este evento.</p></div>`;
    return;
  }

  const groups = Array.isArray(currentEvent.age_groups) ? currentEvent.age_groups : [];
  el.innerHTML = groups.length ? groupedRegsHtml(groups) : flatRegsHtml();

  el.querySelectorAll('[data-reg-info]').forEach(b =>
    b.addEventListener('click', () => showRegInfo(b.dataset.regInfo)));
}

// Compact row: first + last name, with an info button for everything else.
function regRowHtml(r) {
  return `
    <div class="se-regrow">
      <span class="se-regrow__name">${esc(r.first_name)} ${esc(r.last_name)}</span>
      <button class="icon-btn__admin se-regrow__info" data-reg-info="${esc(r.id)}" title="Ver detalles" aria-label="Ver detalles">
        <i class="fas fa-circle-info"></i>
      </button>
    </div>`;
}

function flatRegsHtml() {
  return `<div class="se-reglist">` + currentRows().map(regRowHtml).join('') + `</div>`;
}

// Bucket each registration into the first matching age group; anything outside
// every range (or with a missing age) falls into "Sin grupo".
function groupedRegsHtml(groups) {
  const buckets = groups.map(() => []);
  const ungrouped = [];
  currentRows().forEach(r => {
    const age = Number(r.age);
    const gi = Number.isFinite(age)
      ? groups.findIndex(g => age >= g.min && age <= g.max)
      : -1;
    (gi >= 0 ? buckets[gi] : ungrouped).push(r);
  });

  const section = (label, color, list) => !list.length ? '' : `
    <div style="margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:.5rem;font-weight:700;font-size:.9rem;padding:.35rem .55rem;border-left:4px solid ${esc(color)};margin-bottom:.4rem">
        <span style="width:10px;height:10px;border-radius:50%;background:${esc(color)};display:inline-block;flex:none"></span>
        ${esc(label)} <span style="color:var(--color-muted);font-weight:400">· ${list.length}</span>
      </div>
      <div class="se-reglist">${list.map(regRowHtml).join('')}</div>
    </div>`;

  return groups.map((g, i) => section(`${g.name} (${g.min}–${g.max})`, g.color || '#64748b', buckets[i])).join('')
    + section('Sin grupo', '#64748b', ungrouped);
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
    ${line('Padre / Madre / Tutor', r.parent_name)}
    ${line('Parentesco', r.parent_relationship || r.relationship)}
    ${(r.parent_phone || r.contact_phone) ? `<div class="se-reginfo__row"><span class="se-reginfo__label">Teléfono</span><a href="tel:${esc(r.parent_phone || r.contact_phone)}">${esc(formatUSPhoneNational(r.parent_phone || r.contact_phone))}</a></div>` : ''}
    ${(r.parent_email || r.contact_email) ? `<div class="se-reginfo__row"><span class="se-reginfo__label">Email</span><a href="mailto:${esc(r.parent_email || r.contact_email)}">${esc(r.parent_email || r.contact_email)}</a></div>` : ''}
    ${line('Contacto de emergencia', r.contact_name)}
    <div class="se-reginfo__row"><span class="se-reginfo__label">Tel. emergencia</span><a href="tel:${esc(r.contact_phone)}">${esc(phone)}</a></div>
    ${line('Alergias', r.allergies)}
    ${line('Condiciones médicas', r.medical_conditions)}
    ${line('Notas', r.notes)}
    ${line('Inscrito', fmtDateTime(r.submitted_at))}
    <div class="se-reginfo__row"><span class="se-reginfo__label">Exoneración</span><span>${
      regSignature(r)
        ? `<i class="fas fa-circle-check" style="color:#16a34a"></i> Firmada · ${esc(fmtDate(r.waiver_signed_at))}`
        : '<span style="color:var(--color-muted)">Sin firma</span>'
    }</span></div>`;

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
          <button class="btn btn--ghost" id="seRegInfoWaiver"><i class="fas fa-file-signature"></i> Exoneración</button>
          <span style="flex:1"></span>
          <button class="btn btn--danger" id="seRegInfoDelete"><i class="fas fa-trash"></i> Eliminar</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    $('seRegInfoClose').addEventListener('click', () => m.classList.remove('open'));
  }
  $('seRegInfoTitle').textContent = `${r.first_name} ${r.last_name}`;
  $('seRegInfoBody').innerHTML = body;
  $('seRegInfoPrint').onclick = () => printOne(id);
  // Signed waiver: only offer it when one was actually captured.
  const waiverBtn = $('seRegInfoWaiver');
  if (waiverBtn) {
    const hasWaiver = !!regSignature(r);
    waiverBtn.style.display = hasWaiver ? '' : 'none';
    waiverBtn.onclick = hasWaiver ? () => printSignedWaiver(id) : null;
  }
  $('seRegInfoDelete').onclick = () => deleteRegistration(id, m);
  m.classList.add('open');
}

// Remove a single inscription (admin-only; RLS enforces server-side).
async function deleteRegistration(id, modal) {
  const r = regsCache.find(x => x.id === id);
  if (!r) return;
  const ok = await confirm('¿Eliminar inscripción?',
    `Se eliminará permanentemente la inscripción de "${r.first_name} ${r.last_name}".`);
  if (!ok) return;
  const { error } = await sb.from('event_registrations').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  modal?.classList.remove('open');
  toast('Inscripción eliminada', 'success');
  // Realtime will also refresh, but update immediately for snappiness.
  regsCache = regsCache.filter(x => x.id !== id);
  renderRegistrations();
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

// ── Printable documents (PDF via the app-wide standard: /js/lib/pdf.js) ───────
// Every "imprimir" action builds a pdfmake document and downloads a real PDF —
// consistent with the treasury report, no reliance on the browser print dialog.

// Compose the event photo + a dark gradient scrim into ONE full-page background
// image (baked in a canvas so it embeds reliably — no pdfmake opacity needed).
async function composeFlyerBg(imgDataUrl) {
  const W = 1275, H = 1650;                       // Letter portrait @ ~150dpi
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0e2d38'; ctx.fillRect(0, 0, W, H);
  if (imgDataUrl) {
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = imgDataUrl;
      });
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);   // cover-fit
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch { /* keep the solid fallback */ }
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(7,26,33,.72)'); g.addColorStop(0.42, 'rgba(7,26,33,.52)'); g.addColorStop(1, 'rgba(7,26,33,.88)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  return c.toDataURL('image/jpeg', 0.9);
}

// Draw the QR inside a white, rounded-corner card (transparent outside the
// radius) so the poster background shows through the rounded corners.
function roundedQrCard(qrDataUrl) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const size = 760, pad = 66, r = 88;        // card px; QR fills the inset
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(size, 0, size, size, r);
      ctx.arcTo(size, size, 0, size, r);
      ctx.arcTo(0, size, 0, 0, r);
      ctx.arcTo(0, 0, size, 0, r);
      ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.imageSmoothingEnabled = false;         // keep the QR modules crisp
      const qs = size - pad * 2;
      ctx.drawImage(im, pad, pad, qs, qs);
      resolve(c.toDataURL('image/png'));
    };
    im.onerror = () => resolve(qrDataUrl);
    im.src = qrDataUrl;
  });
}

// Full-bleed poster: event photo background + QR in a white rounded card.
async function printQrFlyer() {
  if (!currentEvent) return;
  const btn = $('seQrPrint');
  const original = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    const url = publicUrl(currentEvent);
    const [qr, rawBg] = await Promise.all([
      generateQrDataUrl(url, 1024),
      currentEvent.image_url ? imageDataUrl(currentEvent.image_url) : Promise.resolve(''),
    ]);
    const bg = await composeFlyerBg(rawBg);
    const qrCard = await roundedQrCard(qr);
    const noPad = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };
    const center = (node) => ({ columns: ['*', node, '*'], columnGap: 0 });
    // White line-icons (no FontAwesome inside the PDF).
    const calIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    const pinIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
    // Centered row: icon on the left, bold white text beside it, spaced out.
    const iconRow = (icon, textStr) => ({ columns: [
      '*',
      { width: 20, svg: icon, margin: [0, 1, 0, 0] },
      { width: 'auto', text: textStr, bold: true, color: '#ffffff', fontSize: 15, margin: [0, 2, 0, 0] },
      '*',
    ], columnGap: 10, margin: [0, 0, 0, 8] });
    const dateStr = currentEvent.event_at ? fmtDate(currentEvent.event_at) : '';
    const locStr = currentEvent.location || '';
    const detailRows = [];
    if (dateStr) detailRows.push(iconRow(calIcon, dateStr));
    if (locStr) detailRows.push(iconRow(pinIcon, locStr));
    if (detailRows.length) detailRows[0].margin = [0, 22, 0, 8];   // space the first row below the QR
    const def = {
      pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: [56, 58, 56, 44],
      info: { title: `Cartel — ${currentEvent.title || 'Evento'}` },
      background: (cp, ps) => ({ image: bg, width: ps.width, height: ps.height, absolutePosition: { x: 0, y: 0 } }),
      content: [
        // Church name ~65% of the page width — the dominant header.
        { text: 'IGLESIA RESTAURACIÓN DIVINA', alignment: 'center', color: '#f0c98a', bold: true, characterSpacing: 1, fontSize: 24, lineHeight: 1.05, margin: [0, 2, 0, 16] },
        center({ width: 'auto', table: { body: [[{ text: 'INSCRIPCIONES ABIERTAS', color: '#0e2d38', bold: true, fontSize: 11, characterSpacing: 1, margin: [14, 5, 14, 5] }]] }, layout: { fillColor: () => '#e7b765', ...noPad } }),
        { text: currentEvent.title || 'Evento', alignment: 'center', color: '#ffffff', bold: true, fontSize: 38, margin: [0, 14, 0, 8] },
        { text: '¡Escanéame!', alignment: 'center', color: '#ffffff', bold: true, fontSize: 42, characterSpacing: 0.5, margin: [0, 0, 0, 6] },
        { columns: ['*', { width: 300, image: qrCard }, '*'], columnGap: 0, margin: [0, 10, 0, 0] },
        ...detailRows,
        { text: 'Apunta la cámara de tu teléfono al código para registrarte.', alignment: 'center', color: '#eaf2f4', fontSize: 13, margin: [0, 12, 0, 0] },
        { text: url, alignment: 'center', color: '#cdd9dc', fontSize: 10, margin: [0, 12, 0, 0] },
      ],
    };
    await savePdf(def, `cartel-${currentEvent.slug}.pdf`);
    toast('Cartel PDF generado', 'success');
  } catch (e) {
    console.error(e); toast('No se pudo generar el cartel', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

// Full registration roster for the event (landscape table).
async function printRoster() {
  if (!currentEvent) return;
  const rows = currentRows();
  if (!rows.length) { toast('No hay inscripciones para imprimir', 'error'); return; }
  const heads = ['#', 'Nombre', 'Apellido', 'Edad', 'Sexo', 'Contacto', 'Parentesco', 'Teléfono', 'Email', 'Alergias', 'Condiciones'];
  const cell = (v, right) => ({ text: (v == null || v === '') ? '—' : String(v), fontSize: 8.5, alignment: right ? 'right' : 'left' });
  const body = [heads.map((h, i) => th(h, i === 0))];
  rows.forEach((r, i) => body.push([
    cell(i + 1, true), cell(r.first_name), cell(r.last_name), cell(r.age), cell(r.sex),
    cell(r.contact_name), cell(r.relationship), cell(formatUSPhoneNational(r.contact_phone)),
    cell(r.contact_email), cell(r.allergies), cell(r.medical_conditions),
  ]));
  const meta = `${fmtDate(currentEvent.event_at)}${currentEvent.location ? ' · ' + currentEvent.location : ''} · ${rows.length} inscrito${rows.length === 1 ? '' : 's'}`;
  const content = [
    { text: currentEvent.title || 'Evento', fontSize: 16, bold: true, alignment: 'center', margin: [0, 2, 0, 2] },
    { text: meta, alignment: 'center', color: '#8a979c', fontSize: 9, margin: [0, 0, 0, 12] },
    { table: { headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*', 'auto', 'auto', '*', '*', '*'], body },
      layout: { hLineWidth: (i, node) => (i <= 1 || i >= node.table.body.length) ? 0.8 : 0.4, hLineColor: () => '#e7ecec',
        vLineWidth: () => 0, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 5, paddingRight: () => 5 } },
  ];
  await savePdf(churchDocDef({ title: `Roster — ${currentEvent.title}`, headRight: 'Inscritos', content, orientation: 'landscape', margins: [36, 54, 36, 40] }),
    `roster-${currentEvent.slug}.pdf`);
}

// One registration's full details.
async function printOne(id) {
  const r = regsCache.find(x => x.id === id);
  if (!r || !currentEvent) return;
  const fields = [
    ['Nombre', `${r.first_name} ${r.last_name}`], ['Edad', r.age], ['Sexo', r.sex],
    ['Contacto de emergencia', r.contact_name], ['Parentesco', r.relationship],
    ['Teléfono', formatUSPhoneNational(r.contact_phone)], ['Email', r.contact_email],
    ['Alergias', r.allergies], ['Condiciones médicas', r.medical_conditions],
    ['Notas', r.notes], ['Inscrito', fmtDateTime(r.submitted_at)],
  ];
  const body = fields.map(([k, v]) => [
    { text: k, bold: true, color: '#5f6c71', fontSize: 9.5 },
    { text: (v == null || v === '') ? '—' : String(v), fontSize: 9.5 },
  ]);
  const content = [
    { text: currentEvent.title || 'Evento', fontSize: 15, bold: true, color: '#0e2d38', margin: [0, 2, 0, 10] },
    { table: { widths: [155, '*'], body },
      layout: { hLineWidth: () => 0.4, hLineColor: () => '#eef1f2', vLineWidth: () => 0,
        paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 0, paddingRight: () => 6 } },
  ];
  await savePdf(churchDocDef({ title: `${r.first_name} ${r.last_name}`, headRight: currentEvent.title || 'Evento', content }),
    `inscripcion-${r.last_name}-${r.first_name}.pdf`.replace(/\s+/g, '-'));
}

// ── Liability waiver (shared with the public wizard via js/lib/waiver.js) ─────
// Same clause text + fields the attendee signed; buildWaiverDocDef renders the
// PDF from the same source so the blank form and the signed copy never drift.
function waiverEventCtx() {
  return {
    title: currentEvent.title || 'Evento',
    date: fmtDate(currentEvent.event_at),
    location: currentEvent.location || DEFAULT_LOC,
  };
}

// Blank, fillable form for a whole event (print a stack to hand out).
function printWaiver() {
  if (!currentEvent) return;
  savePdf(buildWaiverDocDef({ event: waiverEventCtx(), blank: true }), `exoneracion-${currentEvent.slug}.pdf`);
}

// One registration's signed waiver, reproduced from the stored signature.
function regSignature(r) {
  return (r && (r.signature_image || r.signature_name))
    ? { image: r.signature_image || '', name: r.signature_name || '' }
    : null;
}
function printSignedWaiver(id) {
  const r = regsCache.find(x => x.id === id);
  if (!r || !currentEvent) return;
  const signature = regSignature(r);
  if (!signature) { toast('Esta inscripción no tiene exoneración firmada', 'error'); return; }
  // If this sign-up registered several children together, list all siblings.
  const siblings = r.registration_group_id
    ? regsCache.filter(x => x.registration_group_id === r.registration_group_id)
    : [r];
  savePdf(buildWaiverDocDef({
    event: waiverEventCtx(),
    participants: siblings.map(s => ({ name: `${s.first_name} ${s.last_name}`.trim(), age: s.age })),
    guardian: {
      name: r.parent_name || r.contact_name,
      relationship: r.parent_relationship || r.relationship,
      phone: formatUSPhoneNational(r.parent_phone || r.contact_phone),
      email: r.parent_email || r.contact_email || '',
    },
    emergency: { name: r.contact_name, phone: formatUSPhoneNational(r.contact_phone) },
    signature,
    signedDate: fmtDate(r.waiver_signed_at),
    blank: false,
  }), `exoneracion-firmada-${r.last_name}-${r.first_name}.pdf`.replace(/\s+/g, '-'));
}
