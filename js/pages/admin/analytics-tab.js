// js/pages/admin/analytics-tab.js
// "Analíticas" — trends, not just counts. Lightweight CSS bar charts (no lib).
// Admin-only. Buckets are computed client-side from compact column fetches.

import { sb } from './state.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MONTHS_S = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadAnalytics() {
  const root = document.getElementById('analyticsBody');
  if (!root) return;
  root.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

  const now = new Date();
  const since56 = new Date(now); since56.setDate(now.getDate() - 55);
  const since180 = new Date(now); since180.setMonth(now.getMonth() - 5); since180.setDate(1);

  try {
    const [interests, events, groups, members, albums] = await Promise.all([
      sb.from('discipleship_interests').select('created_at,status').gte('created_at', since56.toISOString()),
      sb.from('calendar_events').select('date').gte('date', dayKey(since180)),
      sb.from('discipleship_groups').select('status,member_count'),
      sb.from('discipleship_members').select('id', { count: 'exact', head: true }),
      sb.from('gallery_albums').select('id', { count: 'exact', head: true }).eq('is_published', true),
    ]);

    const iRows = interests.data || [];
    const gRows = groups.data || [];

    // ── Top tiles ───────────────────────────────────────────────────────────
    const activeGroups = gRows.filter(g => g.status === 'open' || g.status === 'active').length;
    const tiles = [
      { icon: 'fa-hand-holding-heart', num: iRows.length, label: 'Interesados (8 sem)' },
      { icon: 'fa-users',              num: members.count ?? 0, label: 'Miembros en grupos' },
      { icon: 'fa-layer-group',        num: activeGroups, label: 'Grupos activos' },
      { icon: 'fa-images',             num: albums.count ?? 0, label: 'Álbumes publicados' },
    ];

    // ── Interests per week (8 weeks) ─────────────────────────────────────────
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(now); start.setDate(now.getDate() - (7 - i) * 7);
      return { start, count: 0 };
    });
    iRows.forEach(r => {
      const t = new Date(r.created_at).getTime();
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (t >= weeks[i].start.getTime()) { weeks[i].count++; break; }
      }
    });
    const weekBars = weeks.map(w => ({
      label: `${w.start.getDate()} ${MONTHS_S[w.start.getMonth()]}`,
      value: w.count,
    }));

    // ── Interest funnel (status of last-8-week leads) ────────────────────────
    const statusCount = { pending: 0, approved: 0, placed: 0, declined: 0 };
    iRows.forEach(r => { if (r.status in statusCount) statusCount[r.status]++; });
    const funnel = [
      { label: 'Pendientes', value: statusCount.pending,  cls: 'fn--pending' },
      { label: 'Aprobados',  value: statusCount.approved, cls: 'fn--approved' },
      { label: 'Ubicados',   value: statusCount.placed,   cls: 'fn--placed' },
      { label: 'Declinados', value: statusCount.declined, cls: 'fn--declined' },
    ];

    // ── Events per month (6 months) ──────────────────────────────────────────
    const monthBars = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
               label: MONTHS_S[d.getMonth()], value: 0 };
    });
    (events.data || []).forEach(e => {
      const key = (e.date || '').slice(0, 7);
      const b = monthBars.find(m => m.key === key);
      if (b) b.value++;
    });

    root.innerHTML = `
      <div class="an-tiles">
        ${tiles.map(t => `
          <div class="an-tile">
            <span class="an-tile__icon"><i class="fas ${t.icon}"></i></span>
            <span class="an-tile__num">${t.num}</span>
            <span class="an-tile__label">${t.label}</span>
          </div>`).join('')}
      </div>

      <div class="an-card">
        <h3 class="an-card__title"><i class="fas fa-chart-column"></i> Interesados por semana</h3>
        ${barChart(weekBars)}
      </div>

      <div class="an-grid2">
        <div class="an-card">
          <h3 class="an-card__title"><i class="fas fa-filter"></i> Embudo de interesados</h3>
          ${funnelChart(funnel)}
        </div>
        <div class="an-card">
          <h3 class="an-card__title"><i class="fas fa-calendar-day"></i> Eventos por mes</h3>
          ${barChart(monthBars)}
        </div>
      </div>`;
  } catch (e) {
    root.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(e.message)}</p></div>`;
  }
}

function barChart(bars) {
  const max = Math.max(1, ...bars.map(b => b.value));
  return `<div class="an-bars">${bars.map(b => `
    <div class="an-bar">
      <div class="an-bar__track">
        <div class="an-bar__fill" style="height:${Math.round((b.value / max) * 100)}%"></div>
        <span class="an-bar__val">${b.value}</span>
      </div>
      <span class="an-bar__label">${esc(b.label)}</span>
    </div>`).join('')}</div>`;
}

function funnelChart(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="an-funnel">${rows.map(r => `
    <div class="an-funnel__row">
      <span class="an-funnel__label">${esc(r.label)}</span>
      <span class="an-funnel__track">
        <span class="an-funnel__fill ${r.cls}" style="width:${Math.round((r.value / max) * 100)}%"></span>
      </span>
      <span class="an-funnel__val">${r.value}</span>
    </div>`).join('')}</div>`;
}
