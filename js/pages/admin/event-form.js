// js/pages/admin/event-form.js
// All form logic: single event form, bulk form, tag picker, image picker, location override.

import {
  sb, pad2, currentUser, currentProfile, editingEventId, setEditingEventId,
  galleryImages, setGalleryImages,
} from './state.js';
import { toast, openModal, closeModal, showView } from './ui.js';
import { loadUpcoming } from './events-tab.js';
import { loadCalendario } from './calendar-tab.js';

// ─── Constants ────────────────────────────────────────────────────────────────
export const DEFAULT_LOC_ADDR = '2601 Clays Mill Road';
const IMG_BASE    = 'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/event-images/';
const TAG_OPTIONS = ['Servicio','Convivio','Celebración','Evangelismo','Ministerio','Oración','Adoración','Jóvenes','Niños'];

export const EVENT_PRESETS = [
  { title:'Noche de Caballeros', tags:['Servicio','Convivio'],    img:'caballeros.png',         desc:'Una noche de compañerismo entre hombres de fe. Tiempo de oración, estudio bíblico, comida y edificación mutua.' },
  { title:'Noche de Damas',      tags:['Servicio','Convivio'],    img:'damas.png',              desc:'Una noche especial para las mujeres de la iglesia. Alabanza, oración, comunión y compañerismo.' },
  { title:'Vigilia',             tags:['Servicio','Oración'],     img:'vigilia.png',            desc:'Una noche especial de oración, adoración y comunión. Habrá café, comida, alabanza y un tiempo inolvidable de fe.' },
  { title:'Devocional',          tags:['Servicio','Oración'],     img:'devocional.png',         desc:'Un tiempo dedicado a la reflexión bíblica, oración y crecimiento espiritual.' },
  { title:'Noche de Jóvenes',    tags:['Servicio','Convivio'],    img:'jovenes.png',            desc:'Una noche de comunión entre jóvenes. Palabra, comida y actividades.' },
  { title:'Día de las Madres',   tags:['Celebración','Servicio'], img:'madres.png',             desc:'Un servicio especial para honrar y celebrar a las madres de nuestra comunidad.' },
  { title:'Día del Padre',       tags:['Celebración','Servicio'], img:'padre.png',              desc:'Celebramos a los padres de nuestra iglesia con un servicio especial.' },
  { title:'Día del Niño',        tags:['Celebración','Niños'],    img:'nino.png',               desc:'Celebración para los más pequeños. Juegos, actividades, comida y un mensaje especial.' },
  { title:'Thanksgiving',        tags:['Celebración','Convivio'], img:'thanksgivings.png',      desc:'Servicio de acción de gracias. Cena especial, alabanza y testimonios.' },
  { title:'Comida Navideña',     tags:['Celebración','Convivio'], img:'cenanavidena.png',       desc:'Celebramos el nacimiento de Cristo con cena, villancicos y compañerismo.' },
  { title:'Campaña Evangelística',tags:['Evangelismo','Servicio'],img:'campanaEvangelistica.png',desc:'Servicios enfocados en compartir las buenas nuevas de Cristo con la comunidad.' },
  { title:'Aniversario',         tags:['Celebración','Servicio'], img:'aniversario.png',        desc:'Celebración del aniversario de nuestra iglesia. Alabanza, testimonios y compañerismo.' },
];

// ─── Picker instances ─────────────────────────────────────────────────────────
let fTagPicker, bTagPicker;

// ─── Init ────────────────────────────────────────────────────────────────────
export function initForms() {
  _populateTypeSelect('fType');
  _populateTypeSelect('bType');
  fTagPicker = _mountTagPicker('fTagPicker', 'fTag');
  bTagPicker = _mountTagPicker('bTagPicker', 'bTag');
  _mountImgPicker(document.getElementById('fImgSection'), 'f');
  _mountImgPicker(document.getElementById('bImgSection'), 'b');
  _wireTypeSelect('fType','fTitleCustom','fPresetNote', fTagPicker,'fDesc','fDescGroup','f-url','f-preview','f-preview-wrap');
  _wireTypeSelect('bType','bTitleCustom','bPresetNote', bTagPicker,'bDesc','bDescGroup','b-url','b-preview','b-preview-wrap');
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
  document.getElementById('newEventBtn')?.addEventListener('click', () => {
    document.getElementById('formTitle').textContent = 'Nuevo Evento';
    document.getElementById('fId').value = '';
    document.getElementById('fType').value = '';
    document.getElementById('fTitleCustom').value = '';
    document.getElementById('fTitleCustom').classList.remove('show');
    document.getElementById('fPresetNote').classList.remove('show');
    fTagPicker.reset(); fTagPicker.setDisabled(false);
    document.getElementById('fDesc').value    = '';
    document.getElementById('fDesc').readOnly = false;
    document.getElementById('fDescGroup').classList.remove('fg-locked');
    document.getElementById('fDescGroup').querySelector('.fg-locked-note')?.remove();
    document.getElementById('fStarts').value  = '';
    document.getElementById('fEnds').value    = '';
    document.getElementById('fOrgName').value  = '';
    document.getElementById('fOrgEmail').value = '';
    _clearImg('f'); _resetLoc('fLoc','fLocBtn');
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

  // Switch to Próximos tab so the form (inside #tab-upcoming) is visible
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const upcomingTab = document.querySelector('.tab-btn[data-tab="upcoming"]');
  if (upcomingTab) upcomingTab.classList.add('active');
  const upcomingPanel = document.getElementById('tab-upcoming');
  if (upcomingPanel) upcomingPanel.classList.add('active');

  document.getElementById('formTitle').textContent = 'Editar Evento';
  document.getElementById('fId').value = ev.id;
  const idx = EVENT_PRESETS.findIndex(p => p.title === ev.title);
  if (idx >= 0) {
    document.getElementById('fType').value = String(idx);
    document.getElementById('fTitleCustom').classList.remove('show');
  } else if (ev.title) {
    document.getElementById('fType').value = '__custom__';
    document.getElementById('fTitleCustom').classList.add('show');
    document.getElementById('fTitleCustom').value = ev.title;
  } else {
    document.getElementById('fType').value = '';
  }
  document.getElementById('fType').dispatchEvent(new Event('change'));
  if (ev.tag) fTagPicker.setTags(ev.tag.split('/').map(t => t.trim()));
  if (ev.description) document.getElementById('fDesc').value = ev.description;
  if (ev.starts_at)   document.getElementById('fStarts').value = _toLocalDT(ev.starts_at);
  if (ev.ends_at)     document.getElementById('fEnds').value   = _toLocalDT(ev.ends_at);
  _resetLoc('fLoc','fLocBtn');
  if (ev.location && ev.location !== DEFAULT_LOC_ADDR) {
    document.getElementById('fLoc').value    = ev.location;
    document.getElementById('fLoc').readOnly = false;
    document.getElementById('fLocBtn').textContent = 'Restaurar';
    document.getElementById('fLocBtn').classList.add('active');
  }
  document.getElementById('fOrgName').value  = ev.organizer_name  || '';
  document.getElementById('fOrgEmail').value = ev.organizer_email || '';
  _clearImg('f');
  if (ev.image_url) {
    document.getElementById('f-url').value    = ev.image_url;
    document.getElementById('f-preview').src  = ev.image_url;
    document.getElementById('f-preview-wrap').style.display = 'inline-block';
  }
  document.getElementById('fError').style.display = 'none';
  showView('form');
}

// Expose for inline onclick
window.__adminEditSpecial = rawId => openEditSpecial(rawId);

// ─── Bulk form ────────────────────────────────────────────────────────────────
function _initBulkForm() {
  document.getElementById('bulkEventBtn')?.addEventListener('click', () => {
    document.getElementById('bType').value = '';
    document.getElementById('bTitleCustom').value = '';
    document.getElementById('bTitleCustom').classList.remove('show');
    document.getElementById('bPresetNote').classList.remove('show');
    bTagPicker.reset(); bTagPicker.setDisabled(false);
    document.getElementById('bDesc').value    = '';
    document.getElementById('bDesc').readOnly = false;
    document.getElementById('bDescGroup').classList.remove('fg-locked');
    document.getElementById('bDescGroup').querySelector('.fg-locked-note')?.remove();
    _clearImg('b'); _resetLoc('bLoc','bLocBtn');
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
function _populateTypeSelect(selId) {
  const s = document.getElementById(selId);
  s.innerHTML = '<option value="">— Seleccionar tipo —</option>';
  EVENT_PRESETS.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = p.title; s.appendChild(o);
  });
  const c = document.createElement('option');
  c.value = '__custom__'; c.textContent = 'Otro / Personalizado'; s.appendChild(c);
}

function _wireTypeSelect(selId, customId, noteId, tagPicker, descId, descGroupId, imgUrlId, previewId, pwrapId) {
  document.getElementById(selId).onchange = () => {
    const v        = document.getElementById(selId).value;
    const isPreset = v !== '' && v !== '__custom__';
    const isCustom = v === '__custom__';
    document.getElementById(customId).classList.toggle('show', isCustom);
    if (isCustom) document.getElementById(customId).focus();
    const note = document.getElementById(noteId);
    if (isPreset) { note.textContent = `✓ Preset: ${EVENT_PRESETS[Number(v)].title}`; note.classList.add('show'); }
    else note.classList.remove('show');
    if (isPreset) {
      const p = EVENT_PRESETS[Number(v)];
      tagPicker.setTags(p.tags); tagPicker.setDisabled(true);
      document.getElementById(descId).value    = p.desc;
      document.getElementById(descId).readOnly = true;
      document.getElementById(descGroupId).classList.add('fg-locked');
      let n = document.getElementById(descGroupId).querySelector('.fg-locked-note');
      if (!n) {
        n = document.createElement('p'); n.className = 'fg-locked-note';
        n.style.cssText = 'font-size:.7rem;color:var(--color-primary);font-weight:600;margin-top:.2rem';
        document.getElementById(descGroupId).appendChild(n);
      }
      n.textContent = 'Auto-completado por preset.';
      if (p.img) {
        const url = IMG_BASE + p.img;
        document.getElementById(imgUrlId).value = url;
        document.getElementById(previewId).src  = url;
        document.getElementById(pwrapId).style.display = 'inline-block';
      }
    } else {
      tagPicker.setDisabled(false);
      document.getElementById(descId).readOnly = false;
      document.getElementById(descGroupId).classList.remove('fg-locked');
      document.getElementById(descGroupId).querySelector('.fg-locked-note')?.remove();
      if (!isPreset) document.getElementById(descId).value = '';
    }
  };
}

function _getTitle(selId, customId) {
  const v = document.getElementById(selId).value;
  if (v === '__custom__') return document.getElementById(customId).value.trim();
  if (v === '') return '';
  return EVENT_PRESETS[Number(v)]?.title || '';
}

// ─── Tag picker ───────────────────────────────────────────────────────────────
function _mountTagPicker(containerId, hiddenId) {
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
    setDisabled(d) { document.getElementById(`${hiddenId}-btn`).classList.toggle('disabled', d); },
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

// ─── Image picker ─────────────────────────────────────────────────────────────
function _mountImgPicker(sectionEl, prefix) {
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
  document.getElementById(`${prefix}-del`).onclick         = () => _clearImg(prefix);
}

function _clearImg(p) {
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
    document.getElementById(`${prefix}-url`).value   = el.dataset.url;
    document.getElementById(`${prefix}-preview`).src = el.dataset.url;
    document.getElementById(`${prefix}-preview-wrap`).style.display = 'inline-block';
    document.getElementById(`${prefix}-status`).textContent = 'Seleccionada ✓';
  });
}

function _toggleGallery(prefix) {
  const g = document.getElementById(`${prefix}-gallery`);
  const show = g.style.display === 'none';
  g.style.display = show ? 'grid' : 'none';
  document.getElementById(`${prefix}-opt-gallery`).classList.toggle('active', show);
  if (show && !galleryImages) _loadGallery(prefix);
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