import { esc } from '/js/utils/escape.js';
// js/pages/admin/notifications.js
// Topbar notification bell — unread badge + dropdown inbox, realtime.
// Reads admin_notifications (admin-only via RLS); rows are created by DB triggers
// (e.g. a new discipleship interest).

import { sb, isAdmin } from './state.js';



const TYPE_ICON = {
  discipleship_interest: 'fa-hand-holding-heart',
};

let items = [];
let channel = null;

function timeAgo(iso) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'ahora';
  const m = Math.floor(secs / 60); if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);    if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);    return `${d} d`;
}

export async function initNotifications() {
  if (!isAdmin()) return;
  const bell = document.getElementById('notifBell');
  if (!bell) return;
  bell.style.display = '';

  bell.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
  document.getElementById('notifMarkAll')?.addEventListener('click', markAllRead);

  // Close on outside click
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    if (panel?.classList.contains('open') && !panel.contains(e.target) && e.target !== bell) {
      panel.classList.remove('open');
    }
  });

  await refresh();

  // Realtime: new notifications pop in live.
  try {
    channel = sb.channel('admin-notifications')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'admin_notifications' },
        refresh)
      .subscribe();
  } catch { /* realtime optional */ }
}

async function refresh() {
  const { data, error } = await sb
    .from('admin_notifications')
    .select('id,type,title,body,link,is_read,created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return;
  items = data || [];
  renderBadge();
  renderList();
}

function renderBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const unread = items.filter(n => !n.is_read).length;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.style.display = unread ? '' : 'none';
}

function renderList() {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Sin notificaciones.</p></div>';
    return;
  }
  list.innerHTML = items.map(n => `
    <button class="notif-item${n.is_read ? '' : ' notif-item--unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}">
      <span class="notif-item__icon"><i class="fas ${TYPE_ICON[n.type] || 'fa-bell'}"></i></span>
      <span class="notif-item__body">
        <span class="notif-item__title">${esc(n.title)}</span>
        ${n.body ? `<span class="notif-item__text">${esc(n.body)}</span>` : ''}
        <span class="notif-item__time">${esc(timeAgo(n.created_at))}</span>
      </span>
    </button>`).join('');

  list.querySelectorAll('.notif-item').forEach(btn =>
    btn.addEventListener('click', () => openItem(btn.dataset.id, btn.dataset.link)));
}

function togglePanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  panel.classList.toggle('open');
}

async function openItem(id, link) {
  // Mark this one read, then jump to its tab.
  const n = items.find(x => x.id === id);
  if (n && !n.is_read) {
    n.is_read = true; renderBadge(); renderList();
    sb.from('admin_notifications').update({ is_read: true }).eq('id', id).then(() => {});
  }
  document.getElementById('notifPanel')?.classList.remove('open');
  if (link) document.querySelector(`.tab-btn[data-tab="${link}"]`)?.click();
}

async function markAllRead() {
  const unreadIds = items.filter(n => !n.is_read).map(n => n.id);
  if (!unreadIds.length) return;
  items.forEach(n => { n.is_read = true; });
  renderBadge(); renderList();
  await sb.from('admin_notifications').update({ is_read: true }).in('id', unreadIds);
}
