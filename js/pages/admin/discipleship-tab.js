// js/pages/admin/discipleship-tab.js
// ─────────────────────────────────────────────────────────────────────────────
// Pastor / Admin dashboard tab for managing discipleship.
// Three sub-panels: Grupos, Interesados, Mensajes.
// Reuses the existing admin UI utilities (toast, openModal, closeModal, confirm).
// ─────────────────────────────────────────────────────────────────────────────

import {
  LEVELS, STATUS_LABEL,
  fetchAllGroups, fetchPublicGroups, fetchGroupById,
  upsertGroup, deleteGroup,
  fetchInterests, updateInterestStatus,
  fetchMembers, addMember, removeMember,
  fetchMessages, sendMessage,
  subscribeGroups, subscribeInterests,
  formatSchedule, formatDateRange, groupPublicUrl,
} from '/js/lib/discipleship.js';

import { toast, openModal, closeModal, confirm } from './ui.js';
import { openDscpWizard } from './discipleship-wizard.js';

/* ── Module state ──────────────────────────────────────────────────────── */
let groupsCache       = [];
let interestsCache    = [];
let interestFilter    = 'pending';
let interestOrigin    = 'pool';       // 'pool' | 'assigned'
let interestGroupBy   = 'none';       // 'none' | 'age_range' | 'gender' | 'can_host' | 'experience_level' | 'preferred_day' | 'preferred_time'
let selectedInterests = new Set();
let activePanel       = 'groups';
let unsubGroups       = null;
let unsubInterests    = null;
let booted            = false;

/* ── Entry point (called when the tab is clicked) ──────────────────────── */
export async function loadDiscipulado() {
  if (!booted) {
    boot();
    booted = true;
  }
  await refreshGroups();
  if (activePanel === 'interests') await refreshInterests();
  if (activePanel === 'messages')  refreshMessageHistory();
}

/* ── Boot wiring ───────────────────────────────────────────────────────── */
function boot() {
  // Sub-tabs
  document.querySelectorAll('[data-dscp-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.dscpTab;
      document.querySelectorAll('[data-dscp-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.dscp-admin__panel').forEach(p => {
        p.classList.toggle('active', p.id === `dscp-panel-${target}`);
      });
      activePanel = target;
      if (target === 'groups')    refreshGroups();
      if (target === 'interests') refreshInterests();
      if (target === 'messages')  refreshMessageHistory();
    });
  });

  // Interest filter pills (status)
  document.querySelectorAll('[data-dscp-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      interestFilter = btn.dataset.dscpFilter;
      document.querySelectorAll('[data-dscp-filter]').forEach(b => b.classList.toggle('active', b === btn));
      refreshInterests();
    });
  });

  // Origin tabs (Pool general / Asignados a grupo)
  document.querySelectorAll('[data-dscp-origin]').forEach(btn => {
    btn.addEventListener('click', () => {
      interestOrigin = btn.dataset.dscpOrigin;
      selectedInterests.clear();
      document.querySelectorAll('[data-dscp-origin]').forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      // Hide groupby when looking at assigned-only (less useful there)
      const gb = document.getElementById('dscpPoolGroupBy');
      if (gb) gb.style.display = (interestOrigin === 'pool') ? '' : 'none';
      const hint = document.getElementById('dscpPoolHint');
      if (hint) {
        hint.innerHTML = (interestOrigin === 'pool')
          ? `Estas son las personas que llenaron el formulario sin escoger un grupo. Marca varias y haz clic en <strong>Formar grupo</strong> para crear un grupo nuevo con todos ellos a la vez.`
          : `Estas personas escanearon el código QR de un grupo. Si había cupo, ya quedaron dentro del grupo automáticamente.`;
      }
      refreshInterests();
    });
  });

  // Group-by selector
  document.getElementById('dscpGroupBySel')?.addEventListener('change', (e) => {
    interestGroupBy = e.target.value;
    refreshInterests();
  });

  // Bulk action bar
  document.getElementById('dscpBulkClear')?.addEventListener('click', () => {
    selectedInterests.clear();
    refreshInterests();
  });
  document.getElementById('dscpBulkFormGroup')?.addEventListener('click', formGroupFromSelection);

  // "Crear grupo" → opens the step-by-step wizard (creation only; editing still uses the modal below)
  document.getElementById('dscpAddGroupBtn')?.addEventListener('click', () => {
    openDscpWizard({ onCreated: () => { refreshGroups(); } });
  });
  document.getElementById('dscpGroupClose')?.addEventListener('click', () => closeModal('dscpGroupModal'));
  document.getElementById('dscpGroupModalClose')?.addEventListener('click', () => closeModal('dscpGroupModal'));
  document.getElementById('dscpGroupCancel')?.addEventListener('click', () => closeModal('dscpGroupModal'));
  document.getElementById('dscpGroupSave')?.addEventListener('click', saveGroupFromModal);
  document.getElementById('dscpGroupDelete')?.addEventListener('click', deleteGroupFromModal);

  // QR code download + copy link
  document.getElementById('dscpQrDownload')?.addEventListener('click', downloadQr);
  document.getElementById('dscpQrCopy')?.addEventListener('click', copyQrLink);

  // Place modal
  document.getElementById('dscpPlaceClose')?.addEventListener('click', () => closeModal('dscpPlaceModal'));
  document.getElementById('dscpPlaceCancel')?.addEventListener('click', () => closeModal('dscpPlaceModal'));
  document.getElementById('dscpPlaceSave')?.addEventListener('click', savePlacement);

  // Message composer
  document.getElementById('dscpMsgSend')?.addEventListener('click', sendComposedMessage);

  // Realtime
  unsubGroups    = subscribeGroups(refreshGroups);
  unsubInterests = subscribeInterests(refreshInterests);
}

/* ── GROUPS sub-panel ──────────────────────────────────────────────────── */
async function refreshGroups() {
  const list = document.getElementById('dscpGroupsList');
  const countBadge = document.getElementById('dscpGroupsCount');
  if (!list) return;

  groupsCache = await fetchAllGroups();
  if (countBadge) countBadge.textContent = groupsCache.length;

  // Refresh the message composer's group dropdown too
  refreshMessageGroupSelect();

  if (!groupsCache.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-people-group"></i>
        <p>Aún no has creado ningún grupo. Crea el primero arriba.</p>
      </div>`;
    return;
  }

  list.innerHTML = groupsCache.map(g => `
    <div class="dscp-card" data-group-id="${g.id}">
      <div class="dscp-card__top">
        <span class="dscp-card__level">Nivel ${g.level}</span>
        <span class="dscp-card__status dscp-card__status--${g.status}">${escapeHtml(STATUS_LABEL[g.status] || g.status)}</span>
      </div>
      <h4 class="dscp-card__name">${escapeHtml(g.name)}</h4>
      <div class="dscp-card__meta">
        <span><i class="fas fa-calendar-week"></i> ${escapeHtml(formatSchedule(g)) || 'Horario por definir'}</span>
        ${g.location_name ? `<span><i class="fas fa-house"></i> ${escapeHtml(g.location_name)}</span>` : ''}
        ${g.starts_on ? `<span><i class="fas fa-flag"></i> ${escapeHtml(formatDateRange(g))}</span>` : ''}
      </div>
      <div class="dscp-card__actions">
        <button class="btn btn--ghost" data-dscp-edit="${g.id}">
          <i class="fas fa-edit"></i> Editar
        </button>
        <button class="btn btn--ghost" data-dscp-members="${g.id}">
          <i class="fas fa-users"></i> Miembros
        </button>
        ${g.status !== 'completed' ? `
        <button class="btn btn--ghost" data-dscp-complete="${g.id}">
          <i class="fas fa-flag-checkered"></i> Marcar finalizado
        </button>` : ''}
      </div>
    </div>
  `).join('');

  // Wire actions
  list.querySelectorAll('[data-dscp-edit]').forEach(b =>
    b.addEventListener('click', () => openGroupModal(b.dataset.dscpEdit))
  );
  list.querySelectorAll('[data-dscp-members]').forEach(b =>
    b.addEventListener('click', () => openMembersInline(b.dataset.dscpMembers))
  );
  list.querySelectorAll('[data-dscp-complete]').forEach(b =>
    b.addEventListener('click', () => completeGroup(b.dataset.dscpComplete))
  );
}

async function openGroupModal(id) {
  // Reset fields
  const fields = {
    dscpGroupId: '',  dscpGroupName: '',  dscpGroupDesc: '',
    dscpGroupCapacity: '',  dscpGroupDay: '',  dscpGroupTime: '',
    dscpGroupStart: '', dscpGroupEnd: '',
    dscpGroupLocName: '', dscpGroupLocAddr: '', dscpGroupLeader: '',
  };
  Object.entries(fields).forEach(([k, v]) => { const el = document.getElementById(k); if (el) el.value = v; });
  document.getElementById('dscpGroupLevel').value     = '1';
  document.getElementById('dscpGroupStatus').value    = 'open';
  document.getElementById('dscpGroupPublished').checked = true;
  document.getElementById('dscpGroupError').style.display = 'none';

  if (id) {
    const g = await fetchGroupById(id);
    if (!g) { toast('Grupo no encontrado', 'error'); return; }
    document.getElementById('dscpGroupModalTitle').textContent = 'Editar grupo';
    document.getElementById('dscpGroupId').value         = g.id;
    document.getElementById('dscpGroupName').value       = g.name || '';
    document.getElementById('dscpGroupLevel').value      = g.level || 1;
    document.getElementById('dscpGroupDesc').value       = g.description || '';
    document.getElementById('dscpGroupStatus').value     = g.status || 'open';
    document.getElementById('dscpGroupCapacity').value   = g.capacity ?? '';
    document.getElementById('dscpGroupDay').value        = g.meeting_day || '';
    document.getElementById('dscpGroupTime').value       = (g.meeting_time || '').slice(0, 5);
    document.getElementById('dscpGroupStart').value      = g.starts_on || '';
    document.getElementById('dscpGroupEnd').value        = g.ends_on || '';
    document.getElementById('dscpGroupLocName').value    = g.location_name || '';
    document.getElementById('dscpGroupLocAddr').value    = g.location_address || '';
    document.getElementById('dscpGroupLeader').value     = g.leader_name || '';
    document.getElementById('dscpGroupPublished').checked = g.is_published !== false;
    document.getElementById('dscpGroupDelete').style.display = '';
    renderGroupQr(g);
  } else {
    document.getElementById('dscpGroupModalTitle').textContent = 'Crear grupo de discipulado';
    document.getElementById('dscpGroupDelete').style.display = 'none';
    document.getElementById('dscpQrSection').hidden = true;
  }

  openModal('dscpGroupModal');
}

/* ── QR code generation (local, bundled by Vite — no network calls) ───── */
import QRCode from 'qrcode';

let _currentQrUrl = '';
let _currentGroupName = '';

/** Render a data-URL PNG for the given URL at the requested size. */
async function generateQrDataUrl(data, size = 320) {
  return await QRCode.toDataURL(data, {
    width:  size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0e2d38', light: '#ffffff' },
  });
}

async function renderGroupQr(group) {
  const section = document.getElementById('dscpQrSection');
  const img     = document.getElementById('dscpQrImg');
  if (!section || !img) return;

  const url = groupPublicUrl(group);
  _currentQrUrl     = url;
  _currentGroupName = group?.name || 'discipulado';
  section.hidden    = false;

  try {
    img.src = await generateQrDataUrl(url, 320);
    img.alt = `Código QR para ${group?.name || 'el grupo'}`;
    img.style.display = '';
  } catch (e) {
    console.error('[discipulado] QR render:', e);
    img.style.display = 'none';
  }
}

async function downloadQr() {
  if (!_currentQrUrl) {
    toast('Guarda el grupo primero, luego descarga el QR.', 'error');
    return;
  }
  const btn = document.getElementById('dscpQrDownload');
  const original = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...'; }

  try {
    // Generate a high-res PNG locally — no network involved
    const dataUrl = await generateQrDataUrl(_currentQrUrl, 1024);
    const res  = await fetch(dataUrl);   // converts data: URL → blob (cheap, local)
    const blob = await res.blob();
    if (!blob || blob.size < 500) throw new Error('Imagen QR vacía');

    const safeName = (_currentGroupName || 'discipulado')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') || 'discipulado';

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);

    toast('QR descargado', 'success');
  } catch (e) {
    console.error('[discipulado] QR download:', e);
    toast('No se pudo generar el QR. Intenta de nuevo.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

async function copyQrLink() {
  if (!_currentQrUrl) return;
  try {
    await navigator.clipboard.writeText(_currentQrUrl);
    toast('Enlace copiado al portapapeles', 'success');
  } catch (e) {
    // Fallback for older browsers / non-secure contexts
    try {
      const textarea = document.createElement('textarea');
      textarea.value = _currentQrUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast('Enlace copiado', 'success');
    } catch (_) {
      toast('No se pudo copiar el enlace', 'error');
    }
  }
}

async function saveGroupFromModal() {
  const errEl = document.getElementById('dscpGroupError');
  errEl.style.display = 'none';

  const name = document.getElementById('dscpGroupName').value.trim();
  if (!name) { errEl.textContent = 'El nombre es obligatorio.'; errEl.style.display = ''; return; }

  const payload = {
    id:               document.getElementById('dscpGroupId').value || undefined,
    name,
    level:            Number(document.getElementById('dscpGroupLevel').value) || 1,
    description:      document.getElementById('dscpGroupDesc').value.trim() || null,
    status:           document.getElementById('dscpGroupStatus').value || 'open',
    capacity:         Number(document.getElementById('dscpGroupCapacity').value) || null,
    meeting_day:      document.getElementById('dscpGroupDay').value || null,
    meeting_time:     document.getElementById('dscpGroupTime').value || null,
    starts_on:        document.getElementById('dscpGroupStart').value || null,
    ends_on:          document.getElementById('dscpGroupEnd').value || null,
    location_name:    document.getElementById('dscpGroupLocName').value.trim() || null,
    location_address: document.getElementById('dscpGroupLocAddr').value.trim() || null,
    leader_name:      document.getElementById('dscpGroupLeader').value.trim() || null,
    is_published:     document.getElementById('dscpGroupPublished').checked,
  };
  if (!payload.id) delete payload.id;

  const btn = document.getElementById('dscpGroupSave');
  btn.disabled = true;
  const { data, error } = await upsertGroup(payload);
  btn.disabled = false;
  if (error) { errEl.textContent = error; errEl.style.display = ''; return; }

  // If this save came from "Formar grupo" (Pool bulk-action), now place each
  // selected person into the new group and mark their interest as 'placed'.
  const pickIds = window.__dscpPendingPicks;
  if (pickIds && Array.isArray(pickIds) && pickIds.length && data?.id) {
    let placed = 0;
    for (const interestId of pickIds) {
      const interest = interestsCache.find(x => x.id === interestId);
      if (!interest) continue;
      const r1 = await addMember({
        group_id:    data.id,
        full_name:   interest.full_name,
        email:       interest.email,
        phone:       interest.phone,
        role:        'member',
        interest_id: interest.id,
      });
      if (!r1.error) {
        await updateInterestStatus(interest.id, 'placed', data.id);
        placed++;
      }
    }
    selectedInterests.clear();
    window.__dscpPendingPicks = null;
    toast(`Grupo creado con ${placed} miembro${placed === 1 ? '' : 's'}`, 'success');
  } else {
    toast(payload.id ? 'Grupo actualizado' : 'Grupo creado', 'success');
  }

  closeModal('dscpGroupModal');
  refreshGroups();
  refreshInterests();
}

async function deleteGroupFromModal() {
  const id = document.getElementById('dscpGroupId').value;
  if (!id) return;
  const ok = await confirm('Eliminar grupo', '¿Eliminar este grupo? Esto también borrará miembros y mensajes asociados.');
  if (!ok) return;
  const { error } = await deleteGroup(id);
  if (error) { toast(error, 'error'); return; }
  closeModal('dscpGroupModal');
  toast('Grupo eliminado', 'success');
  refreshGroups();
}

async function completeGroup(id) {
  const ok = await confirm('Marcar finalizado', '¿Marcar este grupo como finalizado? Dejará de aparecer en la página pública.');
  if (!ok) return;
  const { error } = await upsertGroup({ id, status: 'completed' });
  if (error) { toast(error, 'error'); return; }
  toast('Grupo marcado como finalizado', 'success');
  refreshGroups();
}

/* ── Members inline panel (lives next to the group card) ───────────────── */
async function openMembersInline(groupId) {
  const card = document.querySelector(`.dscp-card[data-group-id="${groupId}"]`);
  if (!card) return;
  let panel = card.nextElementSibling;
  if (panel?.classList.contains('dscp-members-panel')) { panel.remove(); return; }

  panel = document.createElement('div');
  panel.className = 'dscp-members-panel';
  panel.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando miembros...</div>`;
  card.insertAdjacentElement('afterend', panel);

  const members = await fetchMembers(groupId);
  panel.innerHTML = `
    <h5 class="dscp-members-panel__title">Miembros del grupo</h5>
    ${members.length
      ? `<ul class="dscp-members-panel__list">
          ${members.map(m => `
            <li>
              <span class="dscp-member__role">${roleLabel(m.role)}</span>
              <span class="dscp-member__name">${escapeHtml(m.full_name)}</span>
              ${m.email ? `<span class="dscp-member__email">${escapeHtml(m.email)}</span>` : ''}
              ${m.phone ? `<span class="dscp-member__phone">${escapeHtml(m.phone)}</span>` : ''}
              <button class="btn btn--ghost" data-dscp-rm-member="${m.id}">
                <i class="fas fa-times"></i>
              </button>
            </li>
          `).join('')}
        </ul>`
      : `<p style="color:var(--color-muted);font-size:.85rem;margin:0">Aún no hay miembros en este grupo. Apruébalos desde la pestaña Interesados.</p>`
    }
  `;

  panel.querySelectorAll('[data-dscp-rm-member]').forEach(b =>
    b.addEventListener('click', async () => {
      const ok = await confirm('Remover miembro', '¿Sacar a esta persona del grupo?');
      if (!ok) return;
      const { error } = await removeMember(b.dataset.dscpRmMember);
      if (error) { toast(error, 'error'); return; }
      toast('Miembro removido', 'success');
      openMembersInline(groupId); // toggle off
      openMembersInline(groupId); // re-open with fresh data
    })
  );
}

function roleLabel(r) {
  return r === 'leader' ? 'Líder' : r === 'co-leader' ? 'Co-líder' : 'Miembro';
}

/* ── INTERESTS sub-panel ───────────────────────────────────────────────── */
async function refreshInterests() {
  const list = document.getElementById('dscpInterestsList');
  const countBadge = document.getElementById('dscpInterestsCount');
  if (!list) return;

  // Fetch all rows for the active status filter, then split client-side by origin
  const rawAll = await fetchInterests({ status: interestFilter === 'all' ? undefined : interestFilter });
  const pool     = rawAll.filter(r => !r.target_group_id);
  const assigned = rawAll.filter(r =>  r.target_group_id);

  // Update origin tab counters
  document.getElementById('dscpPoolCount')   && (document.getElementById('dscpPoolCount').textContent     = pool.length);
  document.getElementById('dscpAssignedCount') && (document.getElementById('dscpAssignedCount').textContent = assigned.length);

  // Pending badge for the parent tab (always shows pending COUNT regardless of filter)
  const pendingAll = (await fetchInterests({ status: 'pending' })) || [];
  if (countBadge) countBadge.textContent = pendingAll.length;

  interestsCache = (interestOrigin === 'pool') ? pool : assigned;

  // Update bulk-action bar visibility
  updateBulkBar();

  if (!interestsCache.length) {
    const friendly = interestOrigin === 'pool'
      ? `Aún no hay personas esperando un grupo. Cuando alguien llene el formulario sin escoger un grupo, aparecerá aquí.`
      : `Aún no hay personas que hayan escaneado un código QR de un grupo. Cuando lo hagan, aparecerán aquí.`;
    list.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-hand-holding-heart"></i>
        <p>${friendly}</p>
      </div>`;
    return;
  }

  // Group-by (Pool only — assigned is always flat)
  if (interestOrigin === 'pool' && interestGroupBy !== 'none') {
    const groups = groupBy(interestsCache, interestGroupBy);
    list.innerHTML = Object.entries(groups).map(([label, items]) => `
      <details class="dscp-pool__group" open>
        <summary>
          <i class="fas fa-chevron-right"></i>
          <span>${escapeHtml(label)}</span>
          <span class="dscp-pool__group-count">${items.length}</span>
        </summary>
        <div class="dscp-pool__group-body">
          ${items.map(renderInterestCard).join('')}
        </div>
      </details>
    `).join('');
  } else {
    list.innerHTML = interestsCache.map(renderInterestCard).join('');
  }

  // Wire interactions after render
  wireInterestCardActions(list);
  return; // skip the legacy renderer below
}

/** Build an ordered { label: items[] } object for the chosen groupBy key. */
function groupBy(rows, key) {
  const buckets = new Map();
  const AGE_LABEL = { teen: 'Adolescente', 'young-adult': 'Joven adulto', adult: 'Adulto', senior: 'Adulto mayor' };
  const GENDER_LABEL = { masculino: 'Masculino', femenino: 'Femenino', 'no-especifica': 'Prefiere no decir' };

  const labelOf = (r) => {
    const v = r[key];
    if (key === 'can_host') return v === true ? 'Puede hospedar' : v === false ? 'No puede hospedar' : 'Sin responder';
    if (key === 'age_range') return v ? (AGE_LABEL[v] || v) : 'Sin especificar';
    if (key === 'gender')    return v ? (GENDER_LABEL[v] || v) : 'Sin especificar';
    if (key === 'experience_level') return v ? `Nivel ${v}` : 'Sin nivel';
    if (key === 'preferred_day')    return v ? capitalize(v) : 'Cualquier día';
    if (key === 'preferred_time')   return v ? capitalize(v) : 'Cualquier hora';
    return v ?? 'Sin valor';
  };

  rows.forEach(r => {
    const label = labelOf(r);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(r);
  });

  // Sort: most-populated buckets first
  const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  return Object.fromEntries(sorted);
}

function capitalize(s) {
  return String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1);
}

/** Render a single interest card. */
function renderInterestCard(i) {
    const lvl = i.experience_level
      ? `<span class="dscp-int__level">Nivel deseado: ${i.experience_level}</span>` : '';
    const dayPref = i.preferred_day  ? `Día: ${i.preferred_day}`  : '';
    const timePref= i.preferred_time ? `Horario: ${i.preferred_time}` : '';
    const meta = [dayPref, timePref].filter(Boolean).join(' · ');
    const created = new Date(i.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const assignedGroup = i.assigned_group_id
      ? groupsCache.find(g => g.id === i.assigned_group_id) : null;
    const targetGroup = i.target_group_id
      ? groupsCache.find(g => g.id === i.target_group_id) : null;

    // Host availability badges
    const hostChips = [];
    if (i.can_host === true) {
      hostChips.push(`<span class="dscp-int__chip dscp-int__chip--good"><i class="fas fa-house"></i> Puede hospedar</span>`);
      if (i.home_address) hostChips.push(`<span class="dscp-int__chip dscp-int__chip--addr"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(i.home_address)}</span>`);
    } else if (i.can_host === false) {
      hostChips.push(`<span class="dscp-int__chip dscp-int__chip--soft">No puede hospedar</span>`);
    }
    if (i.has_transportation === false) {
      hostChips.push(`<span class="dscp-int__chip dscp-int__chip--warn"><i class="fas fa-car-side"></i> Necesita transporte</span>`);
    }
    if (i.bringing_family) {
      hostChips.push(`<span class="dscp-int__chip"><i class="fas fa-users"></i> Familia: ${escapeHtml(i.bringing_family)}</span>`);
    }
    if (i.age_range) {
      const AGE_LABEL = { teen: 'Adolescente', 'young-adult': 'Joven adulto', adult: 'Adulto', senior: 'Adulto mayor' };
      hostChips.push(`<span class="dscp-int__chip">${escapeHtml(AGE_LABEL[i.age_range] || i.age_range)}</span>`);
    }
    const chipsHtml = hostChips.length ? `<div class="dscp-int__chips">${hostChips.join('')}</div>` : '';

    const checked = selectedInterests.has(i.id) ? 'checked' : '';
    const selectable = (interestOrigin === 'pool') && (i.status === 'pending' || i.status === 'approved');

    return `
      <div class="dscp-int ${selectedInterests.has(i.id) ? 'dscp-int--selected' : ''}" data-int-id="${i.id}">
        <div class="dscp-int__head">
          <div class="dscp-int__head-left">
            ${selectable ? `<label class="dscp-int__check"><input type="checkbox" data-dscp-select="${i.id}" ${checked}><span></span></label>` : ''}
            <div>
              <p class="dscp-int__name">${escapeHtml(i.full_name)}</p>
              <p class="dscp-int__date">Solicitud del ${created}${targetGroup ? ` · vino del grupo <strong>${escapeHtml(targetGroup.name)}</strong>` : ''}</p>
            </div>
          </div>
          <span class="dscp-int__status dscp-int__status--${i.status}">${escapeHtml(filterLabel(i.status))}</span>
        </div>
        <div class="dscp-int__contact">
          ${i.email ? `<a href="mailto:${escapeHtml(i.email)}"><i class="fas fa-envelope"></i> ${escapeHtml(i.email)}</a>` : ''}
          ${i.phone ? `<a href="tel:${escapeHtml(i.phone)}"><i class="fas fa-phone"></i> ${escapeHtml(i.phone)}</a>` : ''}
        </div>
        ${meta || lvl ? `<p class="dscp-int__pref">${meta} ${lvl}</p>` : ''}
        ${chipsHtml}
        ${i.message ? `<p class="dscp-int__msg">${escapeHtml(i.message)}</p>` : ''}
        ${assignedGroup ? `<p class="dscp-int__assigned"><i class="fas fa-check-circle"></i> Asignado a: <strong>${escapeHtml(assignedGroup.name)}</strong></p>` : ''}
        <div class="dscp-int__actions">
          ${i.status === 'pending' ? `
            <button class="btn btn--primary" data-dscp-approve="${i.id}">
              <i class="fas fa-check"></i> Aprobar
            </button>` : ''}
          ${i.status !== 'placed' ? `
            <button class="btn btn--ghost" data-dscp-place="${i.id}">
              <i class="fas fa-people-arrows"></i> Asignar a grupo
            </button>` : ''}
          ${i.status !== 'declined' ? `
            <button class="btn btn--ghost" data-dscp-decline="${i.id}">
              <i class="fas fa-times"></i> Descartar
            </button>` : ''}
        </div>
      </div>`;
}

/** Attach click handlers after rendering the list (or any nested groupBy block). */
function wireInterestCardActions(root) {
  root.querySelectorAll('[data-dscp-approve]').forEach(b =>
    b.addEventListener('click', () => updateStatus(b.dataset.dscpApprove, 'approved'))
  );
  root.querySelectorAll('[data-dscp-decline]').forEach(b =>
    b.addEventListener('click', async () => {
      const ok = await confirm('Descartar', '¿Marcar esta solicitud como descartada?');
      if (ok) updateStatus(b.dataset.dscpDecline, 'declined');
    })
  );
  root.querySelectorAll('[data-dscp-place]').forEach(b =>
    b.addEventListener('click', () => openPlaceModal(b.dataset.dscpPlace))
  );
  // Multi-select checkboxes
  root.querySelectorAll('[data-dscp-select]').forEach(cb =>
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.dscpSelect;
      if (e.target.checked) selectedInterests.add(id);
      else                  selectedInterests.delete(id);
      // Just toggle the visual without re-rendering everything
      const card = e.target.closest('.dscp-int');
      card?.classList.toggle('dscp-int--selected', e.target.checked);
      updateBulkBar();
    })
  );
}

/** Show/hide the floating bulk-action bar based on the selection count. */
function updateBulkBar() {
  const bar = document.getElementById('dscpBulkBar');
  const count = document.getElementById('dscpBulkCount');
  if (!bar) return;
  const n = selectedInterests.size;
  if (n < 1) {
    bar.hidden = true;
  } else {
    bar.hidden = false;
  }
  if (count) count.textContent = `${n} persona${n === 1 ? '' : 's'} seleccionada${n === 1 ? '' : 's'}`;
}

/** Open the Crear grupo modal pre-populated from a Pool selection. */
async function formGroupFromSelection() {
  if (selectedInterests.size === 0) return;

  // Take a snapshot of selected people from the current cache
  const picks = interestsCache.filter(i => selectedInterests.has(i.id));
  if (!picks.length) return;

  // Derive sensible defaults from the selection
  const modes = (arr) => {
    const counts = new Map();
    arr.filter(Boolean).forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const dayMode    = modes(picks.map(p => p.preferred_day));
  const timeMode   = modes(picks.map(p => p.preferred_time));
  const levelMode  = modes(picks.map(p => p.experience_level));
  const hosts      = picks.filter(p => p.can_host === true && p.home_address);
  const suggestedAddr = hosts[0]?.home_address || '';

  // Map "preferred_time" (mañana/tarde/noche) to a rough hour suggestion
  const timeMap = { mañana: '10:00', tarde: '15:00', noche: '19:00' };
  const suggestedTime = timeMode && timeMap[timeMode] ? timeMap[timeMode] : '';

  // Pre-populate the existing Create-group modal
  await openGroupModal(null);
  const $val = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

  const ageOrYouth = picks.map(p => p.age_range).filter(Boolean);
  const ageHint = ageOrYouth.length ? ageOrYouth[0].replace('-', ' ') : '';
  const nameHint = `Discipulado Nivel ${levelMode || '?'}${ageHint ? ' · ' + ageHint : ''}${dayMode ? ' · ' + capitalize(dayMode) : ''}`;
  $val('dscpGroupName',     nameHint);
  $val('dscpGroupLevel',    levelMode || 1);
  $val('dscpGroupCapacity', Math.max(picks.length + 2, 8));   // a bit of room beyond the selection
  $val('dscpGroupDay',      dayMode || '');
  $val('dscpGroupTime',     suggestedTime);
  $val('dscpGroupLocAddr',  suggestedAddr);
  if (hosts[0]?.home_address) $val('dscpGroupLocName', `Casa de ${hosts[0].full_name.split(/\s+/)[0]}`);

  // Stash the picks so saveGroupFromModal can use them
  window.__dscpPendingPicks = picks.map(p => p.id);

  toast(`Grupo pre-completado con ${picks.length} personas. Revisa los datos antes de guardar.`, 'info');
}

async function updateStatus(id, status) {
  const { error } = await updateInterestStatus(id, status);
  if (error) { toast(error, 'error'); return; }
  toast(status === 'approved' ? 'Solicitud aprobada' : 'Estado actualizado', 'success');
  refreshInterests();
}

function filterLabel(k) {
  return ({
    pending: 'Pendiente', approved: 'Aprobado', placed: 'Asignado',
    declined: 'Descartado', all: 'Todos',
  })[k] || k;
}

/* ── Place into group flow ─────────────────────────────────────────────── */
let placingInterestId = null;

function openPlaceModal(interestId) {
  placingInterestId = interestId;
  const it = interestsCache.find(x => x.id === interestId);
  if (!it) return;
  document.getElementById('dscpPlaceName').textContent = it.full_name;
  document.getElementById('dscpPlaceRole').value = 'member';
  document.getElementById('dscpPlaceError').style.display = 'none';

  const select = document.getElementById('dscpPlaceGroup');
  const eligible = groupsCache.filter(g => g.status === 'open' || g.status === 'active');
  if (!eligible.length) {
    select.innerHTML = `<option value="">No hay grupos disponibles — crea uno primero</option>`;
  } else {
    select.innerHTML = eligible.map(g =>
      `<option value="${g.id}">Nivel ${g.level} · ${escapeAttr(g.name)} · ${escapeAttr(formatSchedule(g))}</option>`
    ).join('');
  }
  openModal('dscpPlaceModal');
}

async function savePlacement() {
  const errEl = document.getElementById('dscpPlaceError');
  errEl.style.display = 'none';
  const groupId = document.getElementById('dscpPlaceGroup').value;
  const role    = document.getElementById('dscpPlaceRole').value;
  if (!groupId) { errEl.textContent = 'Selecciona un grupo.'; errEl.style.display = ''; return; }

  const it = interestsCache.find(x => x.id === placingInterestId);
  if (!it) return;

  // 1) Insert member row
  const memberRes = await addMember({
    group_id:    groupId,
    full_name:   it.full_name,
    email:       it.email,
    phone:       it.phone,
    role,
    interest_id: it.id,
  });
  if (memberRes.error) {
    errEl.textContent = memberRes.error;
    errEl.style.display = '';
    return;
  }

  // 2) Update interest status
  const statusRes = await updateInterestStatus(it.id, 'placed', groupId);
  if (statusRes.error) {
    toast('Miembro agregado pero no se pudo actualizar el estado.', 'error');
  } else {
    toast(`${it.full_name} asignado al grupo`, 'success');
  }

  closeModal('dscpPlaceModal');
  refreshInterests();
  refreshGroups();
}

/* ── MESSAGES sub-panel ────────────────────────────────────────────────── */
function refreshMessageGroupSelect() {
  const sel = document.getElementById('dscpMsgGroup');
  if (!sel) return;
  const eligible = groupsCache.filter(g => g.status !== 'cancelled');
  if (!eligible.length) {
    sel.innerHTML = `<option value="">No hay grupos creados</option>`;
    return;
  }
  const current = sel.value;
  sel.innerHTML = eligible.map(g =>
    `<option value="${g.id}">Nivel ${g.level} · ${escapeAttr(g.name)}</option>`
  ).join('');
  if (current && eligible.find(g => g.id === current)) sel.value = current;
  // Trigger initial history load
  sel.removeEventListener('change', refreshMessageHistory);
  sel.addEventListener('change', refreshMessageHistory);
  refreshMessageHistory();
}

async function refreshMessageHistory() {
  const hist = document.getElementById('dscpMessagesHistory');
  const sel  = document.getElementById('dscpMsgGroup');
  if (!hist || !sel?.value) { if (hist) hist.innerHTML = ''; return; }
  hist.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>`;
  const msgs = await fetchMessages(sel.value);
  if (!msgs.length) {
    hist.innerHTML = `<p style="color:var(--color-muted);font-size:.85rem">Aún no se han enviado mensajes a este grupo.</p>`;
    return;
  }
  hist.innerHTML = msgs.map(m => `
    <div class="dscp-msg">
      <div class="dscp-msg__head">
        <strong>${escapeHtml(m.subject || 'Mensaje')}</strong>
        <span class="dscp-msg__date">${new Date(m.sent_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <p class="dscp-msg__body">${escapeHtml(m.body)}</p>
    </div>
  `).join('');
}

async function sendComposedMessage() {
  const errEl = document.getElementById('dscpMsgError');
  errEl.style.display = 'none';
  const groupId = document.getElementById('dscpMsgGroup').value;
  const subject = document.getElementById('dscpMsgSubject').value.trim();
  const body    = document.getElementById('dscpMsgBody').value.trim();
  if (!groupId) { errEl.textContent = 'Selecciona un grupo.';  errEl.style.display = ''; return; }
  if (!body)    { errEl.textContent = 'Escribe el mensaje.';  errEl.style.display = ''; return; }

  const btn = document.getElementById('dscpMsgSend');
  btn.disabled = true;
  const { error } = await sendMessage({ groupId, subject, body });
  btn.disabled = false;
  if (error) { errEl.textContent = error; errEl.style.display = ''; return; }
  toast('Mensaje enviado al historial del grupo', 'success');
  document.getElementById('dscpMsgSubject').value = '';
  document.getElementById('dscpMsgBody').value = '';
  refreshMessageHistory();
}

/* ── HTML escape helpers ───────────────────────────────────────────────── */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/\n/g, ' '); }
