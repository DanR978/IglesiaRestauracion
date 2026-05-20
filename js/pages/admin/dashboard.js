// js/pages/admin/dashboard.js
// "Inicio" — at-a-glance overview tab. Stat cards + next upcoming events.
// Counts are scoped: a ministry leader only sees their own ministry.

import { sb, isAdmin, currentProfile, todayISO, MONTHS, DAY_NAMES } from './state.js';
import { autoBalance } from './grid-balance.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function loadDashboard() {
  const cardsEl = document.getElementById('dashCards');
  const nextEl  = document.getElementById('dashNext');
  if (!cardsEl) return;

  const greet = document.getElementById('dashGreeting');
  if (greet) {
    const first = (currentProfile?.display_name || '').trim().split(' ')[0];
    greet.textContent = first ? `Hola, ${first}` : 'Hola';
  }

  cardsEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  if (nextEl) nextEl.innerHTML = '';

  const admin = isAdmin();
  const mid   = currentProfile?.ministry_id;
  const today = todayISO();
  const now   = new Date();
  const lp    = n => String(n).padStart(2, '0');
  const mStart = `${now.getFullYear()}-${lp(now.getMonth() + 1)}-01`;
  const mEnd   = `${now.getFullYear()}-${lp(now.getMonth() + 1)}-` +
                 `${lp(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;

  // Ministry leaders see only their own ministry's rows.
  const scoped = q => (!admin && mid) ? q.eq('ministry_id', mid) : q;

  try {
    const [up, month, special, interests, albums, nextRows] = await Promise.all([
      scoped(sb.from('calendar_events').select('id', { count: 'exact', head: true })
        .gte('date', today)),
      scoped(sb.from('calendar_events').select('id', { count: 'exact', head: true })
        .gte('date', mStart).lte('date', mEnd)),
      admin ? sb.from('events').select('id', { count: 'exact', head: true })
                .gte('starts_at', now.toISOString())
            : Promise.resolve({ count: null }),
      admin ? sb.from('discipleship_interests').select('id', { count: 'exact', head: true })
                .eq('status', 'pending')
            : Promise.resolve({ count: null }),
      admin ? sb.from('gallery_albums').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: null }),
      scoped(sb.from('calendar_events')
        .select('title,date,time,cancelled,ministries(name,color)')
        .gte('date', today).order('date', { ascending: true }).limit(6)),
    ]);

    const cards = [
      { goto: 'upcoming',   icon: 'fa-calendar-day',  num: up.count ?? 0,    label: 'Próximos eventos' },
      { goto: 'calendario', icon: 'fa-calendar-week', num: month.count ?? 0, label: 'Eventos este mes' },
    ];
    if (admin) {
      cards.push({ goto: 'upcoming',    icon: 'fa-star',
                   num: special.count ?? 0,   label: 'Eventos especiales' });
      cards.push({ goto: 'discipulado', icon: 'fa-hand-holding-heart',
                   num: interests.count ?? 0, label: 'Discipulado pendiente',
                   alert: (interests.count ?? 0) > 0 });
      cards.push({ goto: 'galeria',     icon: 'fa-images',
                   num: albums.count ?? 0,    label: 'Álbumes de galería' });
    }

    cardsEl.innerHTML = cards.map(c => `
      <button class="dash-card${c.alert ? ' dash-card--alert' : ''}" data-goto="${c.goto}">
        <span class="dash-card__icon"><i class="fas ${c.icon}"></i></span>
        <span class="dash-card__num">${c.num}</span>
        <span class="dash-card__label">${c.label}</span>
      </button>`).join('');

    cardsEl.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector(`.tab-btn[data-tab="${btn.dataset.goto}"]`)?.click();
      });
    });
    autoBalance(cardsEl);   // last row stretches to fill — no orphan cards

    const rows = nextRows.data || [];
    if (nextEl) {
      nextEl.innerHTML = rows.length
        ? rows.map(ev => {
            const [y, mo, d] = ev.date.split('-').map(Number);
            const dayName = DAY_NAMES[new Date(y, mo - 1, d).getDay()];
            return `
              <div class="dash-next${ev.cancelled ? ' dash-next--off' : ''}">
                <div class="dash-next__date">
                  <span class="dash-next__day">${d}</span>
                  <span class="dash-next__mon">${MONTHS[mo - 1].slice(0, 3)}</span>
                </div>
                <div class="dash-next__info">
                  <div class="dash-next__title">${esc(ev.title)}${
                    ev.cancelled ? ' <span class="dash-next__badge">Cancelado</span>' : ''}</div>
                  <div class="dash-next__meta">${dayName}${
                    ev.time ? ' · ' + esc(ev.time) : ''}${
                    ev.ministries?.name ? ' · ' + esc(ev.ministries.name) : ''}</div>
                </div>
              </div>`;
          }).join('')
        : '<div class="empty-state"><i class="fas fa-calendar-check"></i><p>No hay eventos próximos.</p></div>';
    }
  } catch (e) {
    cardsEl.innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(e.message)}</p></div>`;
  }
}
