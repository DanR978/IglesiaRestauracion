// js/pages/discipulado/grupo.js
// ─────────────────────────────────────────────────────────────────────────────
// Group detail page — reads ?slug=... or ?id=... from the URL, fetches the
// group, renders details, and (via a multi-step popup wizard) lets visitors
// sign up specifically to this group.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchPublicGroupBy,
  formatSchedule, formatDateRange, levelMeta,
  displayStatus, DISPLAY_STATUS_LABEL, spotsRemaining,
  subscribeGroups,
} from '/js/lib/discipleship.js';
import { openSignupWizard } from './signup-wizard.js';

const params = new URLSearchParams(location.search);
const SLUG = params.get('slug') || '';
const ID   = params.get('id')   || '';

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Render the detail card (location, schedule, leader, capacity) ──────── */
let _currentGroup = null;

function renderDetail(g) {
  _currentGroup = g;
  const meta = levelMeta(g.level);
  $('dgHeroTitle').textContent    = (g.name || 'GRUPO DE DISCIPULADO').toUpperCase();
  $('dgHeroSubtitle').textContent = `NIVEL ${g.level} · ${(meta.label || '').toUpperCase()}`;
  document.title = `${g.name} | Discipulado · Iglesia Restauración Divina`;

  const display = displayStatus(g);
  const filled  = g.member_count ?? 0;
  const cap     = g.capacity;
  const remaining = spotsRemaining(g);
  const pct = cap ? Math.min(100, Math.round((filled / cap) * 100)) : 0;

  // Capacity card (always show capacity bar if cap is set; show in-progress notice regardless)
  const capacityCard = cap != null ? `
    <div class="dg-capacity-card dg-capacity-card--${display}">
      <div class="dg-capacity-card__head">
        <span class="dg-capacity-card__label">Lugares</span>
        <span class="dg-capacity-card__pct">${filled}/${cap}</span>
      </div>
      <div class="dg-capacity-card__bar"><div class="dg-capacity-card__fill dg-capacity-card__fill--${display}" style="width:${pct}%"></div></div>
      <p class="dg-capacity-card__text">
        ${display === 'open'        ? `Quedan <strong>${remaining}</strong> ${remaining === 1 ? 'lugar disponible' : 'lugares disponibles'}.`  : ''}
        ${display === 'full'        ? `Este grupo está lleno. Puedes apuntarte a la <strong>lista de espera</strong>.`                              : ''}
        ${display === 'in_progress' ? `Este grupo <strong>ya empezó</strong>. Llena el formulario y el pastor te avisará si todavía puedes unirte.` : ''}
        ${display === 'completed'   ? `Este grupo ya terminó.`                                                                                     : ''}
        ${display === 'cancelled'   ? `Este grupo fue cancelado.`                                                                                  : ''}
      </p>
    </div>` : (display === 'in_progress' ? `
    <div class="dg-capacity-card dg-capacity-card--in_progress">
      <p class="dg-capacity-card__text">
        Este grupo <strong>ya empezó</strong>. Llena el formulario y el pastor te avisará si todavía puedes unirte.
      </p>
    </div>` : '');

  const detailEl = $('dgDetail');
  detailEl.innerHTML = `
    <div class="dg-card glass-card animate-fade-in" data-threshold="0.3">
      <div class="dg-card__head">
        <span class="dscp-group__level">
          <i class="fas fa-layer-group"></i> Nivel ${g.level} · ${escapeHtml(meta.label)}
        </span>
        <span class="dscp-group__status dscp-group__status--${display}">${escapeHtml(DISPLAY_STATUS_LABEL[display] || '')}</span>
      </div>

      <h2 class="dg-card__name">${escapeHtml(g.name)}</h2>

      ${g.description ? `<p class="dg-card__desc">${escapeHtml(g.description)}</p>` : ''}

      ${capacityCard}

      <div class="dg-card__grid">
        <div class="dg-card__meta-item">
          <span class="dg-card__meta-label">Día y hora</span>
          <span class="dg-card__meta-value">
            <i class="fas fa-calendar-week"></i> ${escapeHtml(formatSchedule(g)) || 'Por definir'}
          </span>
        </div>
        ${g.location_name ? `
          <div class="dg-card__meta-item">
            <span class="dg-card__meta-label">Dónde nos reunimos</span>
            <span class="dg-card__meta-value">
              <i class="fas fa-house"></i> ${escapeHtml(g.location_name)}
            </span>
            ${g.location_address ? `<span class="dg-card__meta-sub">${escapeHtml(g.location_address)}</span>` : ''}
          </div>` : ''}
        ${g.starts_on ? `
          <div class="dg-card__meta-item">
            <span class="dg-card__meta-label">Fechas</span>
            <span class="dg-card__meta-value">
              <i class="fas fa-flag"></i> ${escapeHtml(formatDateRange(g))}
            </span>
          </div>` : ''}
        ${g.leader_name ? `
          <div class="dg-card__meta-item">
            <span class="dg-card__meta-label">Liderazgo</span>
            <span class="dg-card__meta-value">
              <i class="fas fa-user"></i> ${escapeHtml(g.leader_name)}
            </span>
          </div>` : ''}
      </div>
    </div>
  `;

  // Reveal the signup CTA (unless completed/cancelled — pointless then)
  const wrap = $('dgSignupWrap');
  if (wrap) wrap.hidden = (display === 'completed' || display === 'cancelled');

  // Adjust the submit button label based on group state
  const submitBtn = $('dgSubmit');
  if (submitBtn) {
    let labelHtml;
    if (display === 'full') {
      labelHtml = '<i class="fas fa-bell"></i> <span>Avísenme cuando haya cupo</span>';
    } else if (display === 'in_progress') {
      labelHtml = '<i class="fas fa-hand-holding-heart"></i> <span>Contactar al pastor</span>';
    } else {
      labelHtml = '<i class="fas fa-hand-holding-heart"></i> <span>Quiero unirme a este grupo</span>';
    }
    submitBtn.innerHTML = labelHtml;
    submitBtn.dataset.displayState = display;
  }
}

function renderNotFound(reason = 'No encontramos este grupo.') {
  $('dgHeroTitle').textContent    = 'GRUPO NO DISPONIBLE';
  $('dgHeroSubtitle').textContent = '';
  $('dgDetail').innerHTML = `
    <div class="dscp-empty">
      <p class="dscp-empty__title">${escapeHtml(reason)}</p>
      <p>Es posible que el grupo ya esté cerrado o haya sido removido.</p>
      <p style="margin-top:1rem">
        <a href="/discipulado" class="ird-btn ird-btn--teal">Ver todos los grupos</a>
      </p>
    </div>
  `;
}

/* ── Wire the CTA button to open the multi-step signup wizard ──────────── */
function wireSignupButton() {
  const btn = $('dgSubmit');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!_currentGroup) return;
    const display = btn.dataset.displayState || displayStatus(_currentGroup);
    const submitLabel =
      display === 'full'        ? 'Apuntarme a la lista de espera'  :
      display === 'in_progress' ? 'Enviar solicitud al pastor'      :
                                  'Quiero unirme a este grupo';
    openSignupWizard({
      groupId:   _currentGroup.id,
      groupName: _currentGroup.name,
      submitLabel,
    });
  });
}

/* ── Boot + realtime refresh of capacity ─────────────────────────────── */
async function refreshFromDb() {
  if (!_currentGroup) return;
  const g = await fetchPublicGroupBy({ slug: SLUG || undefined, id: _currentGroup.id });
  if (g) renderDetail(g);
}

async function boot() {
  if (!SLUG && !ID) { renderNotFound('Este enlace no apunta a un grupo válido.'); return; }
  const g = await fetchPublicGroupBy({ slug: SLUG || undefined, id: ID || undefined });
  if (!g)  { renderNotFound('Este grupo no está disponible.'); return; }
  if (g.status === 'cancelled' || g.is_published === false) {
    renderNotFound('Este grupo ya no está disponible.');
    return;
  }
  renderDetail(g);
  wireSignupButton();

  // Realtime: when member_count changes (member added/removed), re-render capacity
  subscribeGroups(refreshFromDb);
}

document.addEventListener('DOMContentLoaded', boot);
