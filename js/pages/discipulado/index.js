// js/pages/discipulado/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Public Discipulado page wiring:
//   • Renders the 5 levels grid (static content, but driven from lib/discipleship.js)
//   • Loads & renders open/active groups from Supabase
//   • Builds the 7-day schedule strip from those groups
//   • Wires the interest form submission with toast feedback
// ─────────────────────────────────────────────────────────────────────────────

import {
  LEVELS, WEEKDAYS, STATUS_LABEL,
  DISPLAY_STATUS_LABEL, displayStatus, spotsRemaining,
  fetchPublicGroups, submitInterest, subscribeGroups,
  formatSchedule, formatDateRange, levelMeta, groupPublicUrl,
} from '/js/lib/discipleship.js';

/* ── Levels grid ──────────────────────────────────────────────────────────── */
function renderLevels() {
  const root = document.getElementById('dscpLevels');
  if (!root) return;
  root.innerHTML = LEVELS.map(l => `
    <article class="dscp-level animate-fade-in" data-threshold="0.3">
      <p class="dscp-level__badge">Nivel</p>
      <p class="dscp-level__num">${l.n}</p>
      <h3 class="dscp-level__label">${escapeHtml(l.label)}</h3>
      <p class="dscp-level__blurb">${escapeHtml(l.blurb)}</p>
    </article>
  `).join('');
}

/* ── Groups list ──────────────────────────────────────────────────────────── */
function renderGroups(groups) {
  const root = document.getElementById('dscpGroups');
  if (!root) return;

  if (!groups.length) {
    root.innerHTML = `
      <div class="dscp-empty">
        <p class="dscp-empty__title">Pronto anunciaremos nuevos grupos</p>
        <p>Llena el formulario abajo y te avisaremos cuando abramos el siguiente grupo.</p>
      </div>`;
    return;
  }

  root.innerHTML = groups.map(g => {
    const meta = levelMeta(g.level);
    const display = displayStatus(g);                          // open | full | in_progress | completed
    const filled = g.member_count ?? 0;
    const cap    = g.capacity;
    const remaining = spotsRemaining(g);
    const pct = cap ? Math.min(100, Math.round((filled / cap) * 100)) : 0;
    const detailUrl = g.slug
      ? `/discipulado/grupo/?slug=${encodeURIComponent(g.slug)}`
      : `/discipulado/grupo/?id=${encodeURIComponent(g.id)}`;

    let ctaHtml = '';
    if (display === 'open') {
      ctaHtml = `<a class="dscp-group__cta" href="${detailUrl}">Quiero unirme <i class="fas fa-arrow-right"></i></a>`;
    } else if (display === 'full') {
      ctaHtml = `<a class="dscp-group__cta dscp-group__cta--soft" href="${detailUrl}">Unirme a lista de espera <i class="fas fa-arrow-right"></i></a>`;
    } else if (display === 'in_progress') {
      ctaHtml = `<a class="dscp-group__cta dscp-group__cta--muted" href="${detailUrl}"><i class="fas fa-clock"></i> Ya empezó · más información <i class="fas fa-arrow-right"></i></a>`;
    }

    // Capacity strip — only shown when capacity is set
    const capacityHtml = cap != null ? `
      <div class="dscp-cap">
        <div class="dscp-cap__row">
          <span class="dscp-cap__count"><strong>${filled}/${cap}</strong> lugares ocupados</span>
          ${remaining > 0 && display === 'open'
            ? `<span class="dscp-cap__remaining">${remaining} ${remaining === 1 ? 'disponible' : 'disponibles'}</span>`
            : display === 'full' ? `<span class="dscp-cap__remaining dscp-cap__remaining--full">Sin lugares</span>` : ''}
        </div>
        <div class="dscp-cap__bar" aria-hidden="true">
          <div class="dscp-cap__bar-fill dscp-cap__bar-fill--${display}" style="width:${pct}%"></div>
        </div>
      </div>` : '';

    return `
      <article class="dscp-group animate-fade-in" data-threshold="0.3" data-group-status="${display}">
        <div class="dscp-group__top">
          <span class="dscp-group__level">
            <i class="fas fa-layer-group"></i> Nivel ${g.level} · ${escapeHtml(meta.label)}
          </span>
          <span class="dscp-group__status dscp-group__status--${display}">${escapeHtml(DISPLAY_STATUS_LABEL[display] || '')}</span>
        </div>
        <h3 class="dscp-group__name">${escapeHtml(g.name)}</h3>
        ${g.description ? `<p class="dscp-group__desc">${escapeHtml(g.description)}</p>` : ''}
        <ul class="dscp-group__meta">
          <li><i class="fas fa-calendar-week"></i> ${escapeHtml(formatSchedule(g)) || 'Horario por definir'}</li>
          ${g.location_name ? `<li><i class="fas fa-house"></i> ${escapeHtml(g.location_name)}${g.location_address ? ` — ${escapeHtml(g.location_address)}` : ''}</li>` : ''}
          ${g.starts_on ? `<li><i class="fas fa-flag"></i> ${escapeHtml(formatDateRange(g))}</li>` : ''}
          ${g.leader_name ? `<li><i class="fas fa-user"></i> Lidera: ${escapeHtml(g.leader_name)}</li>` : ''}
        </ul>
        ${capacityHtml}
        ${ctaHtml}
      </article>`;
  }).join('');
}

/* ── 7-day schedule strip ─────────────────────────────────────────────────── */
function renderSchedule(groups) {
  const root = document.getElementById('dscpSchedule');
  if (!root) return;
  // Count active groups per weekday
  const byDay = Object.fromEntries(WEEKDAYS.map(w => [w.value, 0]));
  groups.forEach(g => { if (g.meeting_day && g.meeting_day in byDay) byDay[g.meeting_day]++; });

  root.innerHTML = WEEKDAYS.map(w => {
    const count = byDay[w.value];
    const has = count > 0;
    return `
      <div class="dscp-day ${has ? 'dscp-day--has-event' : ''} animate-fade-in" data-threshold="0.3">
        <span class="dscp-day__name">${w.label.slice(0, 3)}</span>
        <span class="dscp-day__count ${has ? '' : 'dscp-day__count--zero'}">${count}</span>
        <span class="dscp-day__label">${has ? (count === 1 ? 'grupo' : 'grupos') : '—'}</span>
      </div>`;
  }).join('');
}

/* ── Interest form ────────────────────────────────────────────────────────── */
function wireForm() {
  const form  = document.getElementById('dscpInterestForm');
  const btn   = document.getElementById('dscpSubmit');
  const fbEl  = document.getElementById('dscpFormFeedback');
  const card  = form?.closest('.dscp-signup__card');
  if (!form || !card) return;

  const setFeedback = (msg, kind = '') => {
    fbEl.textContent = msg || '';
    fbEl.className = 'dscp-form__feedback' + (kind ? ` dscp-form__feedback--${kind}` : '');
  };

  const renderSuccess = (name) => {
    const firstName = (name || '').trim().split(/\s+/)[0];
    card.innerHTML = `
      <div class="dscp-thanks" role="status" aria-live="polite">
        <div class="dscp-thanks__icon" aria-hidden="true">
          <i class="fas fa-heart"></i>
        </div>
        <h2 class="dscp-thanks__title">
          ¡Gracias${firstName ? `, ${escapeHtml(firstName)}` : ''} por tu interés!
        </h2>
        <p class="dscp-thanks__body">
          Estaremos en contacto contigo pronto.
        </p>
        <p class="dscp-thanks__verse">
          "Confía en Jehová de todo tu corazón, y no te apoyes en tu propia prudencia."
          <br><span class="dscp-thanks__ref">— Proverbios 3:5</span>
        </p>
      </div>
    `;
    // Smooth-scroll into view so the message is what the user sees
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFeedback('Enviando...', '');
    btn.disabled = true;
    btn.dataset.busy = '1';

    const payload = {
      full_name:        form.full_name.value,
      email:            form.email.value,
      phone:            form.phone.value,
      preferred_day:    form.preferred_day.value || null,
      preferred_time:   form.preferred_time.value || null,
      experience_level: form.experience_level.value || null,
      message:          form.message.value,
    };

    const { data, error } = await submitInterest(payload);
    btn.disabled = false;
    btn.dataset.busy = '';

    if (error) {
      setFeedback(typeof error === 'string' ? error : 'No pudimos enviar tu solicitud. Inténtalo de nuevo.', 'error');
      return;
    }

    renderSuccess(payload.full_name);
  });
}

/* ── Utilities ────────────────────────────────────────────────────────────── */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */
async function refreshGroups() {
  const groups = await fetchPublicGroups();
  renderGroups(groups);
  renderSchedule(groups);
}

document.addEventListener('DOMContentLoaded', async () => {
  renderLevels();
  await refreshGroups();
  wireForm();

  // Realtime: re-render if pastor publishes/edits a group while user is on the page
  subscribeGroups(refreshGroups);
});
