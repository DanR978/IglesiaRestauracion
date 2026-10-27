// js/pages/admin/event-form.js
// All form logic: single event form, bulk form, tag picker, image picker, location override.

import {
  sb, pad2, currentUser, currentProfile, editingEventId, setEditingEventId,
  galleryImages, setGalleryImages,
} from './state.js';
import { toast, openModal, closeModal, showView } from './ui.js';
import { loadUpcoming } from './events-tab.js';
import { loadCalendario } from './calendar-tab.js';
import { goToTab } from './event-views.js';
import { fetchEventPresets } from '/js/lib/event-presets.js';
import { isoDate } from '/js/utils/date.js';

// ─── Constants ────────────────────────────────────────────────────────────────
export const DEFAULT_LOC_ADDR = '2601 Clays Mill Road';
const TAG_OPTIONS = ['Servicio','Convivio','Celebración','Evangelismo','Ministerio','Oración','Adoración','Jóvenes','Niños'];

// ─── Picker instances ─────────────────────────────────────────────────────────
let fTagPicker, bTagPicker;
let presets = [];   // event_presets rows behind the "Tipo de evento" selects

// ─── Init ────────────────────────────────────────────────────────────────────
export function initForms() {
  _populateTypeSelect('fType');
  _populateTypeSelect('bType');
  fTagPicker = mountTagPicker('fTagPicker', 'fTag');
  bTagPicker = mountTagPicker('bTagPicker', 'bTag');
  mountImgPicker(document.getElementById('fImgSection'), 'f');
  mountImgPicker(document.getElementById('bImgSection'), 'b');
  _wireTypeSelect('f', fTagPicker);
  _wireTypeSelect('b', bTagPicker);
  _wireLocOverride('fLoc','fLocBtn');
  _wireLocOverride('bLoc','bLocBtn');
  _initSingleForm();
  _initBulkForm();
  _initEventModal();
}

// ─── Event modal (calendar_events) ───────────────────────────────────────────
function _initEventModal() {
  document.getElementById('eventModalSave')?.addEventListener('click', async () => {
    const title = (document.getElementById('evTitle').value || '').trim();
    const date  = document.getElementById('evDate').value;
    const errEl = document.getElementById('eventModalError');
    if (!title || !date) { errEl.textContent = 'El título y la fecha son obligatorios.'; errEl.style.display = ''; return; }
    errEl.style.display = 'none';
    const btn = document.getElementById('eventModalSave');
    btn.disabled = true;
    const timeRaw = document.getElementById('evTime').value;
    let fmtT = null;
    if (timeRaw) { const [h, m] = timeRaw.split(':').map(Number); fmtT = `${(h%12)||12}:${pad2(m)} ${h>=12?'PM':'AM'}`; }
    const payload = {
      title, date, time: fmtT,
      location:    document.getElementById('evLocation').value.trim()   || null,
      description: document.getElementById('evDescription').value.trim() || null,
      category:    document.getElementById('evCategory').value,
      cancelled:   document.getElementById('evCancelled').checked,
      ministry_id: document.getElementById('evMinistry').value || currentProfile?.ministry_id || null,
      created_by:  currentUser.id,
    };
    const { error } = editingEventId
      ? await sb.from('calendar_events').update(payload).eq('id', editingEventId)
      : await sb.from('calendar_events').insert(payload);
    btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }
    closeModal('eventModal');
    toast(editingEventId ? 'Evento actualizado' : 'Evento agregado', 'success');
    loadUpcoming();
    if (document.getElementById('tab-calendario')?.classList.contains('active')) loadCalendario();
  });
  document.getElementById('eventModalClose')?.addEventListener('click',  () => closeModal('eventModal'));
  document.getElementById('eventModalCancel')?.addEventListener('click', () => closeModal('eventModal'));
}

export function openNewRegular() {
  setEditingEventId(null);
  document.getElementById('eventModalTitle').textContent = 'Agregar Actividad';
  document.getElementById('evTitle').value       = '';
  document.getElementById('evTime').value        = '19:00';
  document.getElementById('evLocation').value    = '2601 Clays Mill Rd, Lexington, KY 40503';
  document.getElementById('evDescription').value = '';
  document.getElementById('evCategory').value    = 'otro';
  document.getElementById('evCancelled').checked = false;
  document.getElementById('eventModalError').style.display = 'none';
  openModal('eventModal');
}

export async function openEditRegular(id) {
  // id may be a 'cal' UUID or 'evt-*' — find in calEventsList
  const { calEventsList } = await import('./state.js');
  const ev = calEventsList.find(e => e.id === id);
  if (!ev) return;
  setEditingEventId(id);
  document.getElementById('eventModalTitle').textContent = 'Editar Actividad';
  document.getElementById('evTitle').value    = ev.title;
  document.getElementById('evDate').value     = ev.date;
  let t24 = '';
  if (ev.time) {
    if (/[AP]M$/i.test(ev.time)) {
      const [tm, ap] = ev.time.split(' ');
      const [h, m]   = tm.split(':').map(Number);
      const h2 = ap === 'PM' && h !== 12 ? h+12 : ap === 'AM' && h === 12 ? 0 : h;
      t24 = `${String(h2).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    } else t24 = ev.time;
  }
  document.getElementById('evTime').value        = t24;
  document.getElementById('evLocation').value    = ev.location    || '';
  document.getElementById('evDescription').value = ev.description || '';
  document.getElementById('evCategory').value    = ev.category    || 'otro';
  document.getElementById('evCancelled').checked = ev.cancelled   || false;
  document.getElementById('evMinistry').value    = ev.ministry_id || '';
  document.getElementById('eventModalError').style.display = 'none';
  openModal('eventModal');
}

// ─── Single event form (events table) ────────────────────────────────────────
function _initSingleForm() {
  document.getElementById('newEventBtn')?.addEventListener('click', async () => {
    await refreshPresetSelects();
    document.getElementById('formTitle').textContent = 'Nuevo Evento';
    document.getElementById('fId').value = '';
    document.getElementById('fType').value = '';
    document.getElementById('fTitleCustom').value = '';
    _syncTypeUi('f');
    fTagPicker.reset();
    document.getElementById('fDesc').value    = '';
    document.getElementById('fStarts').value  = '';
    document.getElementById('fEnds').value    = '';
    document.getElementById('fOrgName').value  = '';
    document.getElementById('fOrgEmail').value = '';
    clearImg('f'); _resetLoc('fLoc','fLocBtn');
    document.getElementById('fError').style.display = 'none';
    showView('form');
  });

  document.getElementById('formBack')?.addEventListener('click',   () => showView('list'));
  document.getElementById('formCancel')?.addEventListener('click', () => showView('list'));

  document.getElementById('fSaveBtn')?.addEventListener('click', async () => {
    const title = _getTitle('fType','fTitleCustom');
    if (!title) { toast('Selecciona o escribe un título', 'error'); return; }
    const starts = document.getElementById('fStarts').value;
    if (!starts) { toast('La fecha de inicio es obligatoria', 'error'); return; }
    const errEl = document.getElementById('fError');
    errEl.style.display = 'none';
    const payload = {
      title,
      tag:             document.getElementById('fTag').value    || null,
      location:        document.getElementById('fLoc').value.trim() || null,
      starts_at:       new Date(starts).toISOString(),
      ends_at:         document.getElementById('fEnds').value ? new Date(document.getElementById('fEnds').value).toISOString() : null,
      description:     document.getElementById('fDesc').value.trim() || null,
      organizer_name:  document.getElementById('fOrgName').value.trim()  || null,
      organizer_email: document.getElementById('fOrgEmail').value.trim() || null,
      image_url:       document.getElementById('f-url').value || null,
    };
    const btn = document.getElementById('fSaveBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const id = document.getElementById('fId').value;
    let error;
    if (id) ({ error } = await sb.from('events').update(payload).eq('id', id));
    else    ({ error } = await sb.from('events').insert(payload));
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Evento';
    if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }
    toast(id ? 'Evento actualizado' : 'Evento creado', 'success');
    showView('list'); loadUpcoming();
  });
}

export async function openEditSpecial(rawId) {
  const { data: ev } = await sb.from('events').select('*').eq('id', rawId).single();
  if (!ev) return;
  await refreshPresetSelects();

  // Open Eventos → Próximos so the form (inside #tab-upcoming) is visible.
  goToTab('upcoming');

  document.getElementById('formTitle').textContent = 'Editar Evento';
  document.getElementById('fId').value = ev.id;
  // Select the matching preset WITHOUT applying it: every field below comes
  // from the saved event, never from the preset.
  const preset = presets.find(p => p.title === ev.title);
  document.getElementById('fType').value = preset ? preset.id : (ev.title ? '__custom__' : '');
  document.getElementById('fTitleCustom').value = preset ? '' : (ev.title || '');
  _syncTypeUi('f');
  fTagPicker.reset();
  if (ev.tag) fTagPicker.setTags(ev.tag.split('/').map(t => t.trim()).filter(Boolean));
  document.getElementById('fDesc').value   = ev.description || '';
  document.getElementById('fStarts').value = ev.starts_at ? _toLocalDT(ev.starts_at) : '';
  document.getElementById('fEnds').value   = ev.ends_at   ? _toLocalDT(ev.ends_at)   : '';
  _setLoc('f', ev.location);
  document.getElementById('fOrgName').value  = ev.organizer_name  || '';
  document.getElementById('fOrgEmail').value = ev.organizer_email || '';
  clearImg('f');
  if (ev.image_url) setImg('f', ev.image_url);
  document.getElementById('fError').style.display = 'none';
  showView('form');
}

// Expose for inline onclick
window.__adminEditSpecial = rawId => openEditSpecial(rawId);

// ─── Bulk form ────────────────────────────────────────────────────────────────
function _initBulkForm() {
  document.getElementById('bulkEventBtn')?.addEventListener('click', async () => {
    await refreshPresetSelects();
    document.getElementById('bType').value = '';
    document.getElementById('bTitleCustom').value = '';
    _syncTypeUi('b');
    bTagPicker.reset();
    document.getElementById('bDesc').value    = '';
    clearImg('b'); _resetLoc('bLoc','bLocBtn');
    document.getElementById('bulkDates').innerHTML = '';
    _addBulkDate(); _addBulkDate(); _updateBulkSummary();
    document.getElementById('bError').style.display = 'none';
    showView('bulk');
  });

  document.getElementById('bulkBack')?.addEventListener('click',    () => showView('list'));
  document.getElementById('bulkCancel')?.addEventListener('click',  () => showView('list'));
  document.getElementById('bulkAddDate')?.addEventListener('click', _addBulkDate);

  document.getElementById('bSaveBtn')?.addEventListener('click', async () => {
    const title = _getTitle('bType','bTitleCustom');
    if (!title) { toast('Selecciona un título', 'error'); return; }
    const ts = document.getElementById('bTimeStart').value;
    if (!ts) { toast('La hora es obligatoria', 'error'); return; }
    const dates = [...document.getElementById('bulkDates').querySelectorAll('input[type=date]')]
      .map(i => i.value).filter(Boolean);
    if (!dates.length) { toast('Agrega al menos una fecha', 'error'); return; }
    const te   = document.getElementById('bTimeEnd').value;
    const base = {
      tag:             document.getElementById('bTag').value        || null,
      location:        document.getElementById('bLoc').value.trim() || null,
      description:     document.getElementById('bDesc').value.trim()|| null,
      organizer_name:  document.getElementById('bOrgName').value.trim()  || null,
      organizer_email: document.getElementById('bOrgEmail').value.trim() || null,
      image_url:       document.getElementById('b-url').value || null,
    };
    const events = dates.map(d => ({
      ...base, title,
      starts_at: new Date(`${d}T${ts}`).toISOString(),
      ends_at:   te ? new Date(`${d}T${te}`).toISOString() : null,
    }));
    const btn = document.getElementById('bSaveBtn');
    btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Creando ${events.length}...`;
    const { error } = await sb.from('events').insert(events);
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-layer-group"></i> Crear eventos';
    if (error) { document.getElementById('bError').textContent = error.message; document.getElementById('bError').style.display = ''; return; }
    toast(`${events.length} eventos creados`, 'success');
    showView('list'); loadUpcoming();
  });
}

function _addBulkDate() {
  const c = document.getElementById('bulkDates');
  const r = document.createElement('div');
  r.className = 'bulk-date-row';
  r.innerHTML = `<input type="date" required><button type="button" class="bulk-date-remove">✕</button>`;
  r.querySelector('.bulk-date-remove').onclick = () => { if (c.children.length > 1) { r.remove(); _updateBulkSummary(); } };
  r.querySelector('input').onchange = _updateBulkSummary;
  c.appendChild(r); _updateBulkSummary();
}

function _updateBulkSummary() {
  const n = [...document.getElementById('bulkDates').querySelectorAll('input[type=date]')]
    .map(i => i.value).filter(Boolean).length;
  document.getElementById('bulkSummary').textContent = n ? `${n} evento${n > 1 ? 's' : ''} serán creados` : '';
}

// ─── Type select + preset wiring ─────────────────────────────────────────────
// Reload the presets (cached in the repo module) and rebuild both selects.
// Before the event_presets migration is applied this leaves "Otro" only.
export async function refreshPresetSelects() {
  const { data } = await fetchEventPresets();
  presets = data || [];
  _populateTypeSelect('fType');
  _populateTypeSelect('bType');
}

function _populateTypeSelect(selId) {
  const s = document.getElementById(selId);
  const keep = s.value;
  s.innerHTML = '<option value="">— Seleccionar tipo —</option>';
  presets.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.title; s.appendChild(o);
  });
  const c = document.createElement('option');
  c.value = '__custom__'; c.textContent = 'Otro / Personalizado'; s.appendChild(c);
  if ([...s.options].some(o => o.value === keep)) s.value = keep;
}

// Picking a preset fills every field it has a value for. Nothing is locked:
// the admin can still change any field for this one event.
function _wireTypeSelect(prefix, tagPicker) {
  document.getElementById(`${prefix}Type`).onchange = () => {
    _syncTypeUi(prefix);
    const v = document.getElementById(`${prefix}Type`).value;
    if (v === '__custom__') document.getElementById(`${prefix}TitleCustom`).focus();
    const p = presets.find(x => x.id === v);
    if (p) _applyPreset(prefix, p, tagPicker);
  };
}

// Custom-title input + preset note for the current choice. Changes no field.
function _syncTypeUi(prefix) {
  const v = document.getElementById(`${prefix}Type`).value;
  document.getElementById(`${prefix}TitleCustom`).classList.toggle('show', v === '__custom__');
  const note = document.getElementById(`${prefix}PresetNote`);
  const p = presets.find(x => x.id === v);
  note.textContent = p ? `✓ Preset: ${p.title}` : '';
  note.classList.toggle('show', !!p);
}

function _applyPreset(prefix, p, tagPicker) {
  if (p.tag) tagPicker.setTags(p.tag.split('/').map(t => t.trim()).filter(Boolean));
  if (p.description) document.getElementById(`${prefix}Desc`).value = p.description;
  if (p.location) _setLoc(prefix, p.location);
  if (p.organizer_name)  document.getElementById(`${prefix}OrgName`).value  = p.organizer_name;
  if (p.organizer_email) document.getElementById(`${prefix}OrgEmail`).value = p.organizer_email;
  if (p.image_url) setImg(prefix, p.image_url);
  if (prefix === 'b') {
    if (p.start_time) document.getElementById('bTimeStart').value = p.start_time;
    if (p.end_time)   document.getElementById('bTimeEnd').value   = p.end_time;
    return;
  }
  // Single form: put the preset's times on the day already chosen.
  const starts = document.getElementById('fStarts');
  const day = starts.value.slice(0, 10);
  if (!day) return;
  if (p.start_time) starts.value = `${day}T${p.start_time}`;
  if (p.end_time) {
    const endDay = new Date(`${day}T00:00`);
    if (p.end_time < starts.value.slice(11, 16)) endDay.setDate(endDay.getDate() + 1);   // past midnight
    document.getElementById('fEnds').value = `${isoDate(endDay)}T${p.end_time}`;
  }
}

function _getTitle(selId, customId) {
  const v = document.getElementById(selId).value;
  if (v === '__custom__') return document.getElementById(customId).value.trim();
  if (v === '') return '';
  return presets.find(p => p.id === v)?.title || '';
}

// ─── Tag picker ───────────────────────────────────────────────────────────────
// Max-2 category picker writing "A/B" into the hidden input `hiddenId`.
export function mountTagPicker(containerId, hiddenId) {
  const container = document.getElementById(containerId);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'tag-picker-btn'; btn.id = `${hiddenId}-btn`;
  btn.innerHTML = `<span class="tag-pills" id="${hiddenId}-pills"><span style="color:var(--color-muted)">Seleccionar...</span></span><span style="font-size:9px">▼</span>`;
  container.appendChild(btn);
  const dd = document.createElement('div');
  dd.className = 'tag-dropdown'; dd.id = `${hiddenId}-dd`;
  TAG_OPTIONS.forEach(tag => {
    const l = document.createElement('label'); l.className = 'tag-opt';
    l.innerHTML = `<input type="checkbox" value="${tag}"><span>${tag}</span>`; dd.appendChild(l);
  });
  const cw = document.createElement('div'); cw.className = 'tag-custom-wrap';
  cw.innerHTML = `<input type="text" placeholder="Categoría personalizada..." id="${hiddenId}-custom">`; dd.appendChild(cw);
  container.appendChild(dd); container.classList.add('tag-picker');
  const upd = () => {
    const checks = [...dd.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
    const cv = document.getElementById(`${hiddenId}-custom`).value.trim();
    if (cv && checks.length < 2) checks.push(cv);
    document.getElementById(hiddenId).value = checks.join('/');
    const pills = document.getElementById(`${hiddenId}-pills`);
    pills.innerHTML = checks.length
      ? checks.map(t => `<span class="tag-pill">${t}</span>`).join('')
      : `<span style="color:var(--color-muted)">Seleccionar...</span>`;
    dd.querySelectorAll('.tag-opt').forEach(o => {
      const cb = o.querySelector('input[type=checkbox]');
      if (cb && !cb.checked && checks.length >= 2) o.classList.add('disabled');
      else if (cb) o.classList.remove('disabled');
    });
  };
  dd.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', upd));
  document.getElementById(`${hiddenId}-custom`).addEventListener('input', upd);
  btn.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!container.contains(e.target)) dd.classList.remove('open'); });
  return {
    setTags(tags) {
      dd.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = tags.includes(cb.value));
      document.getElementById(`${hiddenId}-custom`).value = '';
      const cu = tags.filter(t => !TAG_OPTIONS.includes(t));
      if (cu.length) document.getElementById(`${hiddenId}-custom`).value = cu[0];
      upd();
    },
    reset() {
      dd.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
      document.getElementById(`${hiddenId}-custom`).value = ''; upd();
    },
  };
}

// ─── Location override ────────────────────────────────────────────────────────
function _wireLocOverride(inputId, btnId) {
  const input = document.getElementById(inputId), btn = document.getElementById(btnId);
  btn.onclick = () => {
    if (input.readOnly) {
      input.readOnly = false; input.value = ''; input.focus();
      btn.textContent = 'Restaurar'; btn.classList.add('active');
    } else {
      input.readOnly = true; input.value = DEFAULT_LOC_ADDR;
      btn.textContent = 'Cambiar'; btn.classList.remove('active');
    }
  };
}
function _resetLoc(inputId, btnId) {
  document.getElementById(inputId).value    = DEFAULT_LOC_ADDR;
  document.getElementById(inputId).readOnly = true;
  document.getElementById(btnId).textContent = 'Cambiar';
  document.getElementById(btnId).classList.remove('active');
}
// Any address other than the church's unlocks the override.
function _setLoc(prefix, loc) {
  if (!loc || loc === DEFAULT_LOC_ADDR) { _resetLoc(`${prefix}Loc`, `${prefix}LocBtn`); return; }
  document.getElementById(`${prefix}Loc`).value    = loc;
  document.getElementById(`${prefix}Loc`).readOnly = false;
  document.getElementById(`${prefix}LocBtn`).textContent = 'Restaurar';
  document.getElementById(`${prefix}LocBtn`).classList.add('active');
}

// ─── Image picker ─────────────────────────────────────────────────────────────
// Upload-or-pick from the event-images bucket; the URL lands in `${prefix}-url`.
export function mountImgPicker(sectionEl, prefix) {
  sectionEl.innerHTML = `
    <div class="img-grid">
      <div class="img-opt" id="${prefix}-opt-upload">
        <i class="fas fa-upload" style="font-size:1.4rem;margin-bottom:.3rem;color:var(--color-muted)"></i>
        <div style="font-size:.78rem;font-weight:600">Subir nueva</div>
        <div style="font-size:.68rem;color:var(--color-muted)">JPG, PNG, WebP</div>
        <input type="file" accept="image/*" id="${prefix}-file">
      </div>
      <div class="img-opt" id="${prefix}-opt-gallery">
        <i class="fas fa-images" style="font-size:1.4rem;margin-bottom:.3rem;color:var(--color-muted)"></i>
        <div style="font-size:.78rem;font-weight:600">Usar existente</div>
        <div style="font-size:.68rem;color:var(--color-muted)">Del almacén</div>
      </div>
    </div>
    <div class="img-gallery" id="${prefix}-gallery" style="display:none"></div>
    <div class="img-preview-wrap" id="${prefix}-preview-wrap" style="display:none">
      <img class="img-preview" id="${prefix}-preview" alt="">
      <button type="button" class="img-del-btn" id="${prefix}-del"><i class="fas fa-trash"></i></button>
    </div>
    <input type="hidden" id="${prefix}-url">
    <div style="font-size:.7rem;color:var(--color-muted);margin-top:.3rem" id="${prefix}-status"></div>`;
  document.getElementById(`${prefix}-opt-gallery`).onclick = () => _toggleGallery(prefix);
  document.getElementById(`${prefix}-file`).onchange       = e => _handleImgUpload(e, prefix);
  document.getElementById(`${prefix}-del`).onclick         = () => clearImg(prefix);
}

export function setImg(p, url) {
  document.getElementById(`${p}-url`).value = url;
  document.getElementById(`${p}-preview`).src = url;
  document.getElementById(`${p}-preview-wrap`).style.display = 'inline-block';
}

export function clearImg(p) {
  document.getElementById(`${p}-url`).value = '';
  document.getElementById(`${p}-preview`).src = '';
  document.getElementById(`${p}-preview-wrap`).style.display = 'none';
  document.getElementById(`${p}-status`).textContent = '';
  const f = document.getElementById(`${p}-file`); if (f) f.value = '';
  document.getElementById(`${p}-opt-upload`).classList.remove('active');
  document.getElementById(`${p}-opt-gallery`).classList.remove('active');
  const g = document.getElementById(`${p}-gallery`);
  if (g) { g.style.display = 'none'; g.querySelectorAll('.img-gal-item').forEach(i => i.classList.remove('selected')); }
}

async function _loadGallery(prefix) {
  const g = document.getElementById(`${prefix}-gallery`);
  g.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-muted)">Cargando...</div>';
  const { data, error } = await sb.storage.from('event-images').list('', { limit:200, sortBy:{ column:'created_at', order:'desc' } });
  if (error || !data) { g.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-danger)">Error al cargar.</div>'; return; }
  const imgs = data.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
  setGalleryImages(imgs);
  if (!imgs.length) { g.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-muted)">No hay imágenes.</div>'; return; }
  g.innerHTML = imgs.map(img => {
    const { data: u } = sb.storage.from('event-images').getPublicUrl(img.name);
    return `<div class="img-gal-item" data-url="${u.publicUrl}"><img src="${u.publicUrl}" alt="" loading="lazy"></div>`;
  }).join('');
  g.querySelectorAll('.img-gal-item').forEach(el => el.onclick = () => {
    g.querySelectorAll('.img-gal-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    setImg(prefix, el.dataset.url);
    document.getElementById(`${prefix}-status`).textContent = 'Seleccionada ✓';
  });
}

function _toggleGallery(prefix) {
  const g = document.getElementById(`${prefix}-gallery`);
  const show = g.style.display === 'none';
  g.style.display = show ? 'grid' : 'none';
  document.getElementById(`${prefix}-opt-gallery`).classList.toggle('active', show);
  // galleryImages is shared by every picker; a picker that never rendered the
  // grid still has to fill its own.
  if (show && (!galleryImages || !g.querySelector('.img-gal-item'))) _loadGallery(prefix);
}

async function _handleImgUpload(e, prefix) {
  const file = e.target.files?.[0]; if (!file) return;
  document.getElementById(`${prefix}-opt-upload`).classList.add('active');
  document.getElementById(`${prefix}-preview`).src = URL.createObjectURL(file);
  document.getElementById(`${prefix}-preview-wrap`).style.display = 'inline-block';
  document.getElementById(`${prefix}-status`).textContent = 'Subiendo...';
  const fn = `${Date.now()}-${Math.random().toString(36).slice(2,7)}.${file.name.split('.').pop()}`;
  const { error } = await sb.storage.from('event-images').upload(fn, file, { cacheControl:'3600', upsert:false });
  if (error) { document.getElementById(`${prefix}-status`).textContent = 'Error al subir.'; return; }
  const { data: u } = sb.storage.from('event-images').getPublicUrl(fn);
  document.getElementById(`${prefix}-url`).value = u.publicUrl;
  document.getElementById(`${prefix}-status`).textContent = 'Subida ✓';
  setGalleryImages(null);
}

function _toLocalDT(iso) {
  try {
    const d = new Date(iso), p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}