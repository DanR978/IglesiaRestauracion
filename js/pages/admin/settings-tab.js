import { esc } from '/js/utils/escape.js';
// js/pages/admin/settings-tab.js
// "Configuración" — site-wide settings: church info + feature flags.
// Stored as key/value rows in app_settings (admin-only via RLS).

import { sb, currentUser } from './state.js';
import { toast } from './ui.js';



let SETTINGS = { church: {}, features: {} };

const CHURCH_FIELDS = [
  { k: 'name',          label: 'Nombre de la iglesia', icon: 'fa-church' },
  { k: 'phone',         label: 'Teléfono',             icon: 'fa-phone' },
  { k: 'email',         label: 'Correo de contacto',   icon: 'fa-envelope' },
  { k: 'address',       label: 'Dirección',            icon: 'fa-map-marker-alt' },
  { k: 'service_times', label: 'Horario de servicios', icon: 'fa-clock' },
];

const FEATURE_FLAGS = [
  { k: 'discipulado',   label: 'Discipulado',  desc: 'Página pública de discipulado y formularios.' },
  { k: 'galeria',       label: 'Galería',      desc: 'Galería pública de fotos.' },
  { k: 'eventos',       label: 'Eventos',      desc: 'Listado público de eventos y calendario.' },
  { k: 'donaciones',    label: 'Donaciones',   desc: 'Página y botones de donación.' },
  { k: 'pause_invites', label: 'Pausar invitaciones', desc: 'Bloquea el envío de nuevas invitaciones de staff.' },
  { k: 'maintenance',   label: 'Modo mantenimiento', desc: 'Muestra un aviso de mantenimiento en el sitio público.', danger: true },
];

export async function loadSettings() {
  const root = document.getElementById('settingsBody');
  if (!root) return;
  root.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

  const { data, error } = await sb.from('app_settings').select('key,value');
  if (error) {
    root.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(error.message)}</p></div>`;
    return;
  }
  SETTINGS = { church: {}, features: {} };
  (data || []).forEach(r => { SETTINGS[r.key] = r.value || {}; });
  render(root);
}

function render(root) {
  const c = SETTINGS.church || {};
  const f = SETTINGS.features || {};

  root.innerHTML = `
    <div class="settings-section">
      <h3 class="settings-section__title"><i class="fas fa-church"></i> Información de la iglesia</h3>
      <p class="settings-section__hint">Estos datos se usan en el sitio y en los correos. Edita y guarda.</p>
      <div class="settings-grid">
        ${CHURCH_FIELDS.map(fl => `
          <div class="settings-field">
            <label for="set_${fl.k}"><i class="fas ${fl.icon}"></i> ${fl.label}</label>
            <input type="text" id="set_${fl.k}" value="${esc(c[fl.k] || '')}">
          </div>`).join('')}
      </div>
      <div class="settings-actions">
        <button class="btn btn--primary" id="settingsSaveChurch"><i class="fas fa-check"></i> Guardar información</button>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section__title"><i class="fas fa-toggle-on"></i> Funciones del sitio</h3>
      <p class="settings-section__hint">Activa o desactiva secciones. Los cambios se guardan al instante.</p>
      <div class="settings-flags">
        ${FEATURE_FLAGS.map(fl => `
          <label class="settings-flag${fl.danger ? ' settings-flag--danger' : ''}">
            <span class="settings-flag__text">
              <span class="settings-flag__label">${fl.label}</span>
              <span class="settings-flag__desc">${fl.desc}</span>
            </span>
            <span class="settings-switch">
              <input type="checkbox" data-flag="${fl.k}" ${f[fl.k] ? 'checked' : ''}>
              <span class="settings-switch__track"></span>
            </span>
          </label>`).join('')}
      </div>
    </div>`;

  document.getElementById('settingsSaveChurch')?.addEventListener('click', saveChurch);
  root.querySelectorAll('[data-flag]').forEach(cb =>
    cb.addEventListener('change', () => toggleFlag(cb.dataset.flag, cb.checked)));
}

async function upsert(key, value) {
  return sb.from('app_settings').upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: currentUser?.id || null },
    { onConflict: 'key' }
  );
}

async function saveChurch() {
  const btn = document.getElementById('settingsSaveChurch');
  if (btn) btn.disabled = true;
  const value = {};
  CHURCH_FIELDS.forEach(fl => { value[fl.k] = document.getElementById(`set_${fl.k}`)?.value.trim() || ''; });
  const { error } = await upsert('church', value);
  if (btn) btn.disabled = false;
  if (error) { toast('No se pudo guardar: ' + error.message, 'error'); return; }
  SETTINGS.church = value;
  toast('Información guardada', 'success');
}

async function toggleFlag(key, on) {
  const value = { ...(SETTINGS.features || {}), [key]: on };
  const { error } = await upsert('features', value);
  if (error) {
    toast('No se pudo guardar: ' + error.message, 'error');
    loadSettings(); // revert UI to truth
    return;
  }
  SETTINGS.features = value;
  toast(on ? 'Activado' : 'Desactivado', 'success');
}
