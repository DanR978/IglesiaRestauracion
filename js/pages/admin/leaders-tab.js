// js/pages/admin/leaders-tab.js
// ─────────────────────────────────────────────────────────────────────────────
// "Líderes" — edits the public "Nuestros Líderes" page: its sections (name,
// icon, verse) and the people in each (photo, name, role, opt-in contact).
//
// Admin-only tab (data-admin-only); RLS on leader_sections / leader_members is
// the real guard. All data goes through js/lib/leaders.js, which also enforces
// the contact rule: only someone marked "Es líder" can show contact, and only
// while "Mostrar contacto" is on. Styles: css/pages/admin/leaders.css.
// ─────────────────────────────────────────────────────────────────────────────

import { html } from '/js/utils/escape.js';
import { render } from '/js/utils/render.js';
import { $ } from '/js/utils/dom.js';
import { loadingHtml, emptyHtml, errorHtml } from '/js/components/states.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { formatUSPhoneNational } from '/js/lib/validators.js';
import {
  SECTION_ICONS, ROLE_SUGGESTIONS, photoUrl,
  fetchAdminDirectory, saveSection, deleteSection, saveMember, deleteMember,
  reorderSections, reorderMembers,
} from '/js/lib/leaders.js';
import { toast, openModal, closeModal, confirm } from './ui.js';

const SAVE_HTML  = '<i class="fas fa-save"></i> Guardar';
const BUSY_HTML  = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
const PHOTO_MAX  = 25 * 1024 * 1024;   // before re-encoding; the stored JPEG is far smaller
const LEADER_ROLE = /^l[ií]der$/i;      // role already reads "Líder" → the tag would repeat it

let _sections = [];
let _wired    = false;
let _loadSeq  = 0;          // drops a response that a newer loadLeaders() superseded
let _moving   = false;      // one Subir/Bajar at a time; a click during one is ignored

let _section = null;        // section open in the modal (null = new)
let _icon    = SECTION_ICONS[0];

let _member      = null;    // member open in the modal (null = new)
let _photoFile   = null;    // pending replacement photo
let _photoClear  = false;   // pending "Quitar"
let _previewUrl  = '';      // object URL of _photoFile

const nextOrder = (list) => list.reduce((max, x) => Math.max(max, x.sort_order ?? 0), -1) + 1;

function setErr(id, msg) {
  const box = $(id);
  if (!box) return;
  box.textContent = msg || '';
  box.style.display = msg ? 'block' : 'none';
}

// While a save is in flight the modal can't be closed or acted on again, so
// its completion can never land on a modal the admin has since reopened.
function setBusy(ids, saveId, busy) {
  ids.forEach(id => { const b = $(id); if (b) b.disabled = busy; });
  $(saveId).innerHTML = busy ? BUSY_HTML : SAVE_HTML;
}
const SECTION_BTNS = ['ldrSectionSave', 'ldrSectionCancel', 'ldrSectionClose', 'ldrSectionDelete'];
const MEMBER_BTNS  = ['ldrMemberSave', 'ldrMemberCancel', 'ldrMemberClose', 'ldrMemberDelete', 'ldrPhotoPick', 'ldrPhotoRemove'];

// ── Entry point ─────────────────────────────────────────────────────────────
export async function loadLeaders() {
  const list = $('leadersList');
  if (!list) return;
  if (!_wired) wire();
  if (!_sections.length) render(list, loadingHtml());

  const seq = ++_loadSeq;
  const { data, error } = await fetchAdminDirectory();
  if (seq !== _loadSeq) return;
  if (error) {
    render(list, errorHtml(error, { prefix: 'No se pudieron cargar los líderes' }));
    return;
  }
  _sections = data;
  renderList();
}

// ── List ────────────────────────────────────────────────────────────────────
function avatar(src) {
  return html`<span class="ldr-avatar" aria-hidden="true"><i class="fas fa-user"></i>${src ? html`<img src="${src}" alt="">` : ''}</span>`;
}

function memberRow(m) {
  return html`
    <li class="ldr-person">
      <button type="button" class="ldr-person__main" data-ldr-edit="${m.id}" title="Editar">
        ${avatar(photoUrl(m.photo_path))}
        <span class="ldr-person__text">
          <span class="ldr-person__name">${m.name}</span>
          <span class="ldr-person__meta">
            <span>${m.role || 'Sin cargo'}</span>
            ${m.is_leader && !LEADER_ROLE.test(m.role.trim()) ? html`<span class="ldr-tag">Líder</span>` : ''}
          </span>
        </span>
        ${m.contact_opt_in ? html`
          <span class="ldr-person__contact" title="Contacto visible en la página">
            ${m.contact_email ? html`<i class="fas fa-envelope" aria-hidden="true"></i>` : ''}
            ${m.contact_phone ? html`<i class="fas fa-phone" aria-hidden="true"></i>` : ''}
            <span class="sr-only">Contacto visible en la página</span>
          </span>` : ''}
      </button>
      <button type="button" class="adm-icon-btn" data-ldr-member="${m.id}" title="Acciones" aria-label="Acciones de ${m.name}">
        <i class="fas fa-ellipsis-vertical"></i>
      </button>
    </li>`;
}

function sectionCard(s) {
  return html`
    <section class="ldr-section">
      <header class="ldr-section__head">
        <span class="ldr-section__icon" aria-hidden="true"><i class="fas ${s.icon}"></i></span>
        <div class="ldr-section__text">
          <h3 class="ldr-section__name">${s.name}</h3>
          ${s.verse_text
            ? html`<p class="ldr-section__verse">"${s.verse_text}"${s.verse_ref ? html` <cite>${s.verse_ref}</cite>` : ''}</p>`
            : html`<p class="ldr-section__verse">Sin versículo</p>`}
        </div>
        <button type="button" class="adm-icon-btn" data-ldr-section="${s.id}" title="Acciones" aria-label="Acciones de ${s.name}">
          <i class="fas fa-ellipsis-vertical"></i>
        </button>
      </header>
      ${s.members.length
        ? html`<ul class="ldr-people">${s.members.map(memberRow)}</ul>`
        : html`<p class="ldr-section__empty">Nadie en esta sección todavía.</p>`}
      <button type="button" class="btn btn--ghost btn--sm ldr-add" data-ldr-add="${s.id}">
        <i class="fas fa-user-plus"></i> Agregar persona
      </button>
    </section>`;
}

function renderList() {
  const list = $('leadersList');
  if (!list) return;
  render(list, _sections.length
    ? html`<div class="ldr-list">${_sections.map(sectionCard)}</div>`
    : emptyHtml('fa-people-group', 'No hay secciones todavía. Agrega la primera con «Agregar sección».'));
}

function findMember(id) {
  for (const s of _sections) {
    const m = s.members.find(x => x.id === id);
    if (m) return { s, m };
  }
  return null;
}

function onListClick(e) {
  const t = e.target.closest('[data-ldr-add],[data-ldr-section],[data-ldr-edit],[data-ldr-member]');
  if (!t) return;
  const { ldrAdd, ldrSection, ldrEdit, ldrMember } = t.dataset;
  if (ldrAdd) return openMemberModal(null, ldrAdd);
  if (ldrSection) {
    const s = _sections.find(x => x.id === ldrSection);
    if (s) sectionMenu(t, s);
    return;
  }
  const hit = findMember(ldrEdit || ldrMember);
  if (!hit) return;
  if (ldrEdit) openMemberModal(hit.m);
  else memberMenu(t, hit.s, hit.m);
}

function sectionMenu(trigger, s) {
  const i = _sections.indexOf(s);
  showActionSheet({
    trigger,
    title: s.name,
    actions: [
      { label: 'Editar sección', icon: 'fa-pen', onClick: () => openSectionModal(s) },
      { label: 'Agregar persona', icon: 'fa-user-plus', onClick: () => openMemberModal(null, s.id) },
      i > 0 && { label: 'Subir', icon: 'fa-arrow-up', onClick: () => moveSection(s.id, -1) },
      i < _sections.length - 1 && { label: 'Bajar', icon: 'fa-arrow-down', onClick: () => moveSection(s.id, 1) },
      { label: 'Eliminar sección', icon: 'fa-trash', variant: 'danger', onClick: () => removeSection(s) },
    ].filter(Boolean),
  });
}

function memberMenu(trigger, s, m) {
  const i = s.members.indexOf(m);
  showActionSheet({
    trigger,
    title: m.name,
    subtitle: s.name,
    actions: [
      { label: 'Editar', icon: 'fa-pen', onClick: () => openMemberModal(m) },
      i > 0 && { label: 'Subir', icon: 'fa-arrow-up', onClick: () => moveMember(m.id, -1) },
      i < s.members.length - 1 && { label: 'Bajar', icon: 'fa-arrow-down', onClick: () => moveMember(m.id, 1) },
      { label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: () => removeMember(m) },
    ].filter(Boolean),
  });
}

// The menu may have been opened before the last reload, so the item is found
// by id in the current list at click time — never by a captured index.
function swapped(list, id, dir) {
  const i = list.findIndex(x => x.id === id);
  if (i < 0 || !list[i + dir]) return null;
  const next = [...list];
  [next[i], next[i + dir]] = [next[i + dir], next[i]];
  return next;
}

async function move(reorder, list, id, dir) {
  if (_moving) return;
  const next = swapped(list, id, dir);
  if (!next) return;
  _moving = true;
  try {
    const res = await reorder(next);
    if (res.error) toast(res.error, 'error');
    await loadLeaders();
  } finally {
    _moving = false;
  }
}

function moveSection(id, dir) {
  return move(reorderSections, _sections, id, dir);
}

function moveMember(id, dir) {
  const hit = findMember(id);
  return hit && move(reorderMembers, hit.s.members, id, dir);
}

// ── Section modal ───────────────────────────────────────────────────────────
function selectIcon(icon) {
  _icon = icon;
  $('ldrSectionIcons').querySelectorAll('[data-icon]').forEach(b => {
    const on = b.dataset.icon === icon;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function openSectionModal(s) {
  _section = s;
  _icon = s?.icon || SECTION_ICONS[0];
  // A stored icon outside the picker's set stays selectable.
  const icons = SECTION_ICONS.includes(_icon) ? SECTION_ICONS : [_icon, ...SECTION_ICONS];
  render($('ldrSectionIcons'), html`${icons.map(ic => html`
    <button type="button" class="icon-opt" data-icon="${ic}" aria-pressed="false" aria-label="${ic.slice(3)}">
      <i class="fas ${ic}" aria-hidden="true"></i>
    </button>`)}`);
  selectIcon(_icon);

  $('ldrSectionTitle').textContent = s ? 'Editar sección' : 'Nueva sección';
  $('ldrSectionName').value  = s?.name || '';
  $('ldrSectionVerse').value = s?.verse_text || '';
  $('ldrSectionRef').value   = s?.verse_ref || '';
  $('ldrSectionDelete').hidden = !s;
  setErr('ldrSectionError', '');
  openModal('ldrSectionModal');
  $('ldrSectionName').focus();
}

async function onSaveSection() {
  const editing = _section;
  setErr('ldrSectionError', '');
  setBusy(SECTION_BTNS, 'ldrSectionSave', true);
  const res = await saveSection({
    id:         editing?.id,
    name:       $('ldrSectionName').value,
    icon:       _icon,
    verse_text: $('ldrSectionVerse').value,
    verse_ref:  $('ldrSectionRef').value,
    sort_order: editing ? undefined : nextOrder(_sections),
  });
  setBusy(SECTION_BTNS, 'ldrSectionSave', false);
  if (res.error) { setErr('ldrSectionError', res.error); return; }
  toast(editing ? 'Sección actualizada' : 'Sección creada', 'success');
  closeModal('ldrSectionModal');
  await loadLeaders();
}

async function removeSection(s) {
  const n = s.members.length;
  const who = n === 0 ? '' : n === 1 ? ' y a la persona que tiene' : ` y a las ${n} personas que tiene`;
  const ok = await confirm('Eliminar sección', `¿Eliminar «${s.name}»${who}? Esta acción no se puede deshacer.`);
  if (!ok) return;
  const res = await deleteSection(s.id);
  if (res.error) { toast(res.error, 'error'); return; }
  toast('Sección eliminada', 'success');
  closeModal('ldrSectionModal');
  await loadLeaders();
}

// ── Person modal ────────────────────────────────────────────────────────────
function dropPreview() {
  if (_previewUrl) URL.revokeObjectURL(_previewUrl);
  _previewUrl = '';
}

function paintPhoto() {
  const src = _previewUrl || (_photoClear ? '' : photoUrl(_member?.photo_path));
  render($('ldrPhotoPreview'), html`<i class="fas fa-user"></i>${src ? html`<img src="${src}" alt="">` : ''}`);
  $('ldrPhotoRemove').hidden = !src;
  $('ldrPhotoPick').innerHTML = src
    ? '<i class="fas fa-camera"></i> Cambiar foto'
    : '<i class="fas fa-camera"></i> Subir foto';
}

function syncContact() {
  const leader = $('ldrMemberLeader').checked;
  const shown  = leader && $('ldrMemberOptIn').checked;
  $('ldrContactBlock').hidden  = !leader;
  $('ldrContactFields').hidden = !shown;
  // Saving without consent clears what's stored — say so before it happens.
  $('ldrContactNote').hidden = !(_member?.contact_opt_in && !shown);
}

function openMemberModal(m, sectionId = null) {
  _member = m;
  _photoFile = null;
  _photoClear = false;
  dropPreview();

  render($('ldrMemberSection'), html`${_sections.map(s => html`<option value="${s.id}">${s.name}</option>`)}`);
  $('ldrMemberTitle').textContent = m ? 'Editar persona' : 'Nueva persona';
  $('ldrMemberName').value    = m?.name || '';
  $('ldrMemberRole').value    = m?.role || '';
  $('ldrMemberSection').value = m?.section_id || sectionId || _sections[0]?.id || '';
  $('ldrMemberLeader').checked = !!m?.is_leader;
  $('ldrMemberOptIn').checked  = !!m?.contact_opt_in;
  $('ldrMemberEmail').value   = m?.contact_email || '';
  $('ldrMemberPhone').value   = m?.contact_phone ? formatUSPhoneNational(m.contact_phone) : '';
  $('ldrMemberDelete').hidden = !m;
  paintPhoto();
  syncContact();
  setErr('ldrMemberError', '');
  openModal('ldrMemberModal');
  $('ldrMemberName').focus();
}

function closeMemberModal() {
  dropPreview();
  closeModal('ldrMemberModal');
}

function onPhotoChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = '';                  // same file can be picked again
  if (!file) return;
  setErr('ldrMemberError', '');
  if (!file.type.startsWith('image/') && !/\.hei[cf]$/i.test(file.name)) {
    setErr('ldrMemberError', 'Elige un archivo de imagen.');
    return;
  }
  if (file.size > PHOTO_MAX) {
    setErr('ldrMemberError', 'La imagen es demasiado grande (máximo 25 MB).');
    return;
  }
  _photoFile = file;
  _photoClear = false;
  dropPreview();
  _previewUrl = URL.createObjectURL(file);
  paintPhoto();
}

async function onSaveMember() {
  const editing = _member;
  const sectionId = $('ldrMemberSection').value;
  const target = _sections.find(s => s.id === sectionId);
  const moved = !editing || editing.section_id !== sectionId;
  setErr('ldrMemberError', '');
  setBusy(MEMBER_BTNS, 'ldrMemberSave', true);
  const res = await saveMember({
    section_id:     sectionId,
    name:           $('ldrMemberName').value,
    role:           $('ldrMemberRole').value,
    is_leader:      $('ldrMemberLeader').checked,
    contact_opt_in: $('ldrMemberOptIn').checked,
    contact_email:  $('ldrMemberEmail').value,
    contact_phone:  $('ldrMemberPhone').value,
    sort_order:     moved ? nextOrder(target?.members || []) : undefined,
  }, { original: editing, file: _photoFile, clearPhoto: _photoClear });
  setBusy(MEMBER_BTNS, 'ldrMemberSave', false);
  if (res.error) {
    setErr('ldrMemberError', res.error);
    if (res.conflict) loadLeaders();    // so reopening shows what is stored now
    return;
  }
  toast(editing ? 'Persona actualizada' : 'Persona agregada', 'success');
  closeMemberModal();
  await loadLeaders();
}

async function removeMember(m) {
  const ok = await confirm('Eliminar persona', `¿Quitar a ${m.name} de la página? Esta acción no se puede deshacer.`);
  if (!ok) return;
  const res = await deleteMember(m.id);
  if (res.error) { toast(res.error, 'error'); return; }
  toast('Persona eliminada', 'success');
  closeMemberModal();
  await loadLeaders();
}

// ── Wiring (once, on first open) ────────────────────────────────────────────
function wire() {
  _wired = true;
  $('ldrAddSection')?.addEventListener('click', () => openSectionModal(null));
  $('leadersList')?.addEventListener('click', onListClick);

  $('ldrSectionIcons').addEventListener('click', e => {
    const b = e.target.closest('[data-icon]');
    if (b) selectIcon(b.dataset.icon);
  });
  $('ldrSectionSave').addEventListener('click', onSaveSection);
  $('ldrSectionDelete').addEventListener('click', () => { if (_section) removeSection(_section); });
  ['ldrSectionClose', 'ldrSectionCancel'].forEach(id =>
    $(id).addEventListener('click', () => closeModal('ldrSectionModal')));

  render($('ldrRoleList'), html`${ROLE_SUGGESTIONS.map(r => html`<option value="${r}"></option>`)}`);
  $('ldrPhotoPick').addEventListener('click', () => $('ldrPhotoInput').click());
  $('ldrPhotoInput').addEventListener('change', onPhotoChosen);
  $('ldrPhotoRemove').addEventListener('click', () => {
    _photoFile = null;
    _photoClear = true;
    dropPreview();
    paintPhoto();
  });
  // A preview the browser can't decode (HEIC outside Safari) falls back to the icon.
  $('ldrPhotoPreview').addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  $('ldrMemberLeader').addEventListener('change', syncContact);
  $('ldrMemberOptIn').addEventListener('change', () => {
    syncContact();
    if ($('ldrMemberOptIn').checked) $('ldrMemberEmail').focus();
  });
  $('ldrMemberSave').addEventListener('click', onSaveMember);
  $('ldrMemberDelete').addEventListener('click', () => { if (_member) removeMember(_member); });
  ['ldrMemberClose', 'ldrMemberCancel'].forEach(id => $(id).addEventListener('click', closeMemberModal));
}
