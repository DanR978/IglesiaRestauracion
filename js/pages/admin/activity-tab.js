import { esc } from '/js/utils/escape.js';
// js/pages/admin/activity-tab.js
// "Actividad" — read-only audit feed (who changed what, when).
// Rows are written automatically by the audit_capture() DB trigger.

import { sb } from './state.js';



const ACTION = {
  INSERT: { verb: 'creó',     icon: 'fa-plus',  cls: 'act--add' },
  UPDATE: { verb: 'editó',    icon: 'fa-pen',   cls: 'act--edit' },
  DELETE: { verb: 'eliminó',  icon: 'fa-trash', cls: 'act--del' },
};

const ENTITY = {
  events:                 'un evento especial',
  calendar_events:        'un evento',
  calendar_presets:       'una plantilla de calendario',
  ministries:             'un ministerio',
  discipleship_groups:    'un grupo de discipulado',
  discipleship_members:   'un miembro de discipulado',
  discipleship_messages:  'un mensaje de discipulado',
  gallery_albums:         'un álbum de galería',
  app_settings:           'la configuración',
  invitations:            'una invitación',
  fin_income:             'un ingreso',
  fin_expenses:           'un gasto',
  fin_budgets:            'un presupuesto',
  fin_payables:           'una cuenta por pagar',
  fin_recurring:          'un pago recurrente',
  fin_notes:              'una nota de tesorería',
};

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60)   return 'hace un momento';
  const m = Math.floor(secs / 60);   if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);      if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);      if (d < 7)  return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function loadActivity() {
  const root = document.getElementById('activityList');
  if (!root) return;
  root.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

  const { data, error } = await sb
    .from('audit_log')
    .select('actor_name,action,entity,label,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    root.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(error.message)}</p></div>`;
    return;
  }
  if (!data?.length) {
    root.innerHTML = '<div class="empty-state"><i class="fas fa-clock-rotate-left"></i><p>Aún no hay actividad registrada.</p></div>';
    return;
  }

  root.innerHTML = data.map(r => {
    const a = ACTION[r.action] || { verb: r.action?.toLowerCase() || '', icon: 'fa-circle', cls: '' };
    const what = ENTITY[r.entity] || 'un registro';
    const label = r.label ? ` <span class="act__label">“${esc(r.label)}”</span>` : '';
    return `
      <div class="act ${a.cls}">
        <span class="act__icon"><i class="fas ${a.icon}"></i></span>
        <div class="act__body">
          <div class="act__text"><strong>${esc(r.actor_name || 'Alguien')}</strong> ${a.verb} ${what}${label}</div>
          <div class="act__time">${esc(timeAgo(r.created_at))}</div>
        </div>
      </div>`;
  }).join('');
}
