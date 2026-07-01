import { esc } from '/js/utils/escape.js';
// js/pages/admin/notifications.js
// Topbar notification bell — unread badge + paginated dropdown inbox, realtime.
// Reads admin_notifications (admin-only via RLS); rows are created by DB triggers
// (e.g. a new discipleship interest). The list loads in batches ("Cargar más")
// so it never grows unbounded, and a "Limpiar" button clears them all.

import { sb, isAdmin } from './state.js';
import { toast, confirm } from './ui.js';
import { goToTab } from './event-views.js';

const TYPE_ICON = {
  discipleship_interest: 'fa-hand-holding-heart',
};
const PAGE = 20;            // notifications fetched per batch

let items = [];
let reachedEnd = false;
let loading = false;
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
  document.getElementById('notifClear')?.addEventListener('click', clearAll);

  // "Cargar más" is re-rendered into the list — handle it via delegation.
  document.getElementById('notifList')?.addEventListener('click', (e) => {
    if (e.target.closest('#notifMore')) { e.stopPropagation(); loadMore(); }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    if (panel?.classList.contains('open') && !panel.contains(e.target) && e.target !== bell) {
      panel.classList.remove('open');
    }
  });

  await refresh();

  // Realtime: new notifications pop in live (resets to the first batch).
  try {
    channel = sb.channel('admin-notifications')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'admin_notifications' },
        refresh)
      .subscribe();
  } catch { /* realtime optional */ }
}

async function fetchPage(offset) {
  const { data, error } = await sb
    .from('admin_notifications')
    .select('id,type,title,body,link,is_read,created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE - 1);
  if (error) return null;
  return data || [];
}

// Initial / realtime load — reset to the first batch.
async function refresh() {
  const page = await fetchPage(0);
  if (page === null) return;
  items = page;
  reachedEnd = page.length < PAGE;
  await refreshBadge();
  renderList();
}

// Unread badge counts ALL unread rows, not just the loaded batch.
async function refreshBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const { count } = await sb
    .from('admin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  const unread = count || 0;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.style.display = unread ? '' : 'none';
}

async function loadMore() {
  if (loading || reachedEnd) return;
  loading = true;
  const moreBtn = document.getElementById('notifMore');
  if (moreBtn) { moreBtn.disabled = true; moreBtn.textContent = 'Cargando…'; }

  const page = await fetchPage(items.length);
  loading = false;
  if (page === null) {
    if (moreBtn) { moreBtn.disabled = false; moreBtn.textContent = 'Cargar más'; }
    return;
  }
  const seen = new Set(items.map(n => n.id));
  items = items.concat(page.filter(n => !seen.has(n.id)));
  reachedEnd = page.length < PAGE;
  renderList();
}

function renderList() {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Sin notificaciones.</p></div>';
    return;
  }
  const rows = items.map(n => `
    <button class="notif-item${n.is_read ? '' : ' notif-item--unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}">
      <span class="notif-item__icon"><i class="fas ${TYPE_ICON[n.type] || 'fa-bell'}"></i></span>
      <span class="notif-item__body">
        <span class="notif-item__title">${esc(n.title)}</span>
        ${n.body ? `<span class="notif-item__text">${esc(n.body)}</span>` : ''}
        <span class="notif-item__time">${esc(timeAgo(n.created_at))}</span>
      </span>
    </button>`).join('');

  const footer = reachedEnd
    ? ''
    : '<button type="button" class="notif-more" id="notifMore">Cargar más</button>';
  list.innerHTML = rows + footer;

  list.querySelectorAll('.notif-item').forEach(btn =>
    btn.addEventListener('click', () => openItem(btn.dataset.id, btn.dataset.link)));
}

function togglePanel() {
  document.getElementById('notifPanel')?.classList.toggle('open');
}

async function openItem(id, link) {
  // Mark this one read, then jump to its tab.
  const n = items.find(x => x.id === id);
  if (n && !n.is_read) {
    n.is_read = true; renderList();
    sb.from('admin_notifications').update({ is_read: true }).eq('id', id)
      .then(() => refreshBadge());
  }
  document.getElementById('notifPanel')?.classList.remove('open');
  if (link) goToTab(link);
}

async function markAllRead() {
  if (!items.some(n => !n.is_read)) return;
  items.forEach(n => { n.is_read = true; });
  renderList();
  // Clear ALL unread (even batches not loaded yet), then refresh the badge.
  await sb.from('admin_notifications').update({ is_read: true }).eq('is_read', false);
  refreshBadge();
}

async function clearAll() {
  if (!items.length) return;
  const ok = await confirm('Limpiar notificaciones',
    '¿Borrar todas las notificaciones? Esta acción no se puede deshacer.');
  if (!ok) return;
  // Requires the admin DELETE policy (supabase/migrations/20260630_admin_notifications_delete.sql).
  const { error } = await sb.from('admin_notifications').delete().not('id', 'is', null);
  if (error) { toast('No se pudo limpiar: ' + error.message, 'error'); return; }
  items = []; reachedEnd = true;
  renderList();
  refreshBadge();
  toast('Notificaciones limpiadas', 'success');
}
