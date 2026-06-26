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
import { generateQrDataUrl, downloadQrPng, copyText, slugifyTitle } from '/js/lib/qr.js';
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

// Generic show/hide for a toggle button + its panel (see admin-ux.md convention).
function wireCollapse(btnId, panelId) {
  const btn = $(btnId), panel = $(panelId);
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    const open = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('is-active', open);
  });
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

  // Collapsible panels — QR/share and filters stay tucked away until asked for.
  wireCollapse('seShareToggle', 'seSharePanel');
  wireCollapse('seFilterToggle', 'seFilterPanel');

  $('seQrDownload')?.addEventListener('click', onQrDownload);
  $('seQrCopy')?.addEventListener('click', onQrCopy);

  // Filters
  ['seFilterName','seFilterAge','seFilterSex','seFilterAllergies','seFilterMedical','seFilterFrom','seFilterTo']
    .forEach(id => $(id)?.addEventListener('input', renderRegistrations));
  $('seFilterClear')?.addEventListener('click', clearFilters);

  // Sort (clickable headers, delegated)
  $('seRegTable')?.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) { onSortClick(th.dataset.sort); return; }
    const pb = e.target.closest('[data-print-one]');
    if (pb) printOne(pb.dataset.printOne);
  });

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
  $('seDetailMeta').innerHTML = html`
    <span><i class="fas fa-calendar"></i> ${fmtDate(ev.event_at)}</span>
    ${ev.location ? html`<span><i class="fas fa-location-dot"></i> ${ev.location}</span>` : ''}
    ${ev.registration_open
      ? html`<span class="cat-badge cat--servicio">Registro abierto</span>`
      : html`<span class="cat-badge cat--otro">Registro cerrado</span>`}
  `.toString();

  // QR + public URL
  const url = publicUrl(ev);
  $('seQrUrl').value = url;
  try {
    $('seQrImg').src = await generateQrDataUrl(url, 320);
    $('seQrImg').style.display = '';
  } catch { $('seQrImg').style.display = 'none'; }

  clearFilters(true);
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

// ── Filter + sort ────────────────────────────────────────────────────────────
function clearFilters(silent) {
  ['seFilterName','seFilterAge','seFilterFrom','seFilterTo'].forEach(id => { if ($(id)) $(id).value = ''; });
  ['seFilterSex','seFilterAllergies','seFilterMedical'].forEach(id => { if ($(id)) $(id).value = ''; });
  if (!silent) renderRegistrations();
}

function getFiltered() {
  const name = ($('seFilterName')?.value || '').trim().toLowerCase();
  const ageV = ($('seFilterAge')?.value || '').trim();
  const sexV = $('seFilterSex')?.value || '';
  const allg = $('seFilterAllergies')?.value || '';
  const med  = $('seFilterMedical')?.value || '';
  const from = $('seFilterFrom')?.value || '';
  const to   = $('seFilterTo')?.value || '';
  const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null;
  const toTs   = to   ? new Date(to   + 'T23:59:59').getTime() : null;

  let rows = regsCache.filter(r => {
    if (name) {
      const full = `${r.first_name} ${r.last_name}`.toLowerCase();
      if (!full.includes(name)) return false;
    }
    if (ageV && String(r.age) !== ageV) return false;
    if (sexV && (r.sex || '') !== sexV) return false;
    if (allg === 'con' && !r.allergies) return false;
    if (allg === 'sin' &&  r.allergies) return false;
    if (med  === 'con' && !r.medical_conditions) return false;
    if (med  === 'sin' &&  r.medical_conditions) return false;
    if (fromTs || toTs) {
      const t = new Date(r.submitted_at).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs   && t > toTs)   return false;
    }
    return true;
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  rows = rows.slice().sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'age') { av = a.age; bv = b.age; }
    else if (sortKey === 'submitted_at') { av = new Date(a.submitted_at).getTime(); bv = new Date(b.submitted_at).getTime(); }
    else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
    if (av < bv) return -1 * dir;
    if (av > bv) return  1 * dir;
    return 0;
  });
  return rows;
}

function onSortClick(key) {
  if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortKey = key; sortDir = key === 'submitted_at' ? 'desc' : 'asc'; }
  renderRegistrations();
}

function sortIcon(key) {
  if (sortKey !== key) return '<i class="fas fa-sort se-sort"></i>';
  return sortDir === 'asc' ? '<i class="fas fa-sort-up se-sort"></i>' : '<i class="fas fa-sort-down se-sort"></i>';
}

const COLS = [
  { key: 'first_name', label: 'Nombre', sortable: true },
  { key: 'last_name',  label: 'Apellido', sortable: true },
  { key: 'age',        label: 'Edad', sortable: true },
  { key: 'sex',        label: 'Sexo' },
  { key: 'contact_name', label: 'Contacto' },
  { key: 'relationship', label: 'Parentesco' },
  { key: 'contact_phone', label: 'Teléfono' },
  { key: 'contact_email', label: 'Email' },
  { key: 'allergies',  label: 'Alergias' },
  { key: 'medical_conditions', label: 'Condiciones médicas' },
  { key: 'submitted_at', label: 'Enviado', sortable: true },
];

function renderRegistrations() {
  const el = $('seRegTable');
  if (!el || !currentEvent) return;
  const rows = getFiltered();

  $('seRegCount').textContent = `${rows.length} de ${regsCache.length} inscrito${regsCache.length === 1 ? '' : 's'}`;

  if (!regsCache.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-user-plus"></i><p>Aún no hay inscripciones para este evento.</p></div>`;
    return;
  }
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-filter"></i><p>Ninguna inscripción coincide con los filtros.</p></div>`;
    return;
  }

  const thead = COLS.map(c => c.sortable
    ? `<th data-sort="${c.key}" class="se-th-sort">${esc(c.label)} ${sortIcon(c.key)}</th>`
    : `<th>${esc(c.label)}</th>`).join('') + '<th style="width:48px"></th>';

  const body = rows.map(r => `
    <tr>
      <td data-label="Nombre">${esc(r.first_name)}</td>
      <td data-label="Apellido">${esc(r.last_name)}</td>
      <td data-label="Edad">${esc(r.age)}</td>
      <td data-label="Sexo">${esc(r.sex || '—')}</td>
      <td data-label="Contacto">${esc(r.contact_name)}</td>
      <td data-label="Parentesco">${esc(r.relationship)}</td>
      <td data-label="Teléfono" class="se-nowrap">${esc(formatUSPhoneNational(r.contact_phone))}</td>
      <td data-label="Email">${r.contact_email ? `<a class="se-email" href="mailto:${esc(r.contact_email)}">${esc(r.contact_email)}</a>` : '—'}</td>
      <td data-label="Alergias">${esc(r.allergies || '—')}</td>
      <td data-label="Condiciones">${esc(r.medical_conditions || '—')}</td>
      <td data-label="Enviado" class="se-nowrap">${esc(fmtDateTime(r.submitted_at))}</td>
      <td data-label="" class="se-rowact"><button class="icon-btn__admin" title="Imprimir registro" data-print-one="${esc(r.id)}"><i class="fas fa-print"></i></button></td>
    </tr>`).join('');

  el.innerHTML = `
    <table class="se-reg-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

// ── QR actions ───────────────────────────────────────────────────────────────
async function onQrDownload() {
  if (!currentEvent) return;
  const btn = $('seQrDownload');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    await downloadQrPng(publicUrl(currentEvent), `qr-${currentEvent.slug}.png`);
    toast('QR descargado', 'success');
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
function exportCsv() {
  if (!currentEvent) return;
  const rows = getFiltered();
  if (!rows.length) { toast('No hay inscripciones para exportar', 'error'); return; }
  const headers = COLS.map(c => c.label);
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach(r => {
    lines.push([
      r.first_name, r.last_name, r.age, r.sex || '',
      r.contact_name, r.relationship, formatUSPhoneNational(r.contact_phone), r.contact_email || '',
      r.allergies || '', r.medical_conditions || '', fmtDateTime(r.submitted_at),
    ].map(csvCell).join(','));
  });
  // BOM so Excel reads accents (UTF-8) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `registros-${currentEvent.slug}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${rows.length} inscripciones exportadas`, 'success');
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
  const rows = getFiltered();
  if (!rows.length) { toast('No hay inscripciones para exportar', 'error'); return; }
  const btn = $('seExportPdf');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
  try {
    await loadPdfMake();
    const head = ['Nombre','Apellido','Edad','Sexo','Contacto','Parentesco','Teléfono','Alergias','Condiciones','Enviado']
      .map(t => ({ text: t, style: 'th' }));
    const body = [head, ...rows.map(r => [
      r.first_name, r.last_name, String(r.age), r.sex || '—',
      r.contact_name, r.relationship, formatUSPhoneNational(r.contact_phone),
      r.allergies || '—', r.medical_conditions || '—', fmtDate(r.submitted_at),
    ].map(t => ({ text: String(t), style: 'td' })))];

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
        { table: { headerRows: 1, widths: ['auto','auto','auto','auto','*','auto','auto','*','*','auto'], body }, layout: 'lightHorizontalLines' },
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
    window.pdfMake.createPdf(docDef).download(`roster-${currentEvent.slug}.pdf`);
    toast('PDF generado', 'success');
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

function printHtml(title, bodyHtml) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`);
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

function printRoster() {
  if (!currentEvent) return;
  const rows = getFiltered();
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
