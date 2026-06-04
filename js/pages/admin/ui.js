// js/pages/admin/ui.js
// Reusable UI utilities — toast, confirm dialog, modal open/close, view switcher.

// ─── Toast ────────────────────────────────────────────────────────────────────
export function toast(msg, type = 'info') {
  const el   = document.createElement('div');
  el.className = `toast-item toast-item--${type}`;
  const icon = type === 'success' ? 'check-circle'
             : type === 'error'   ? 'exclamation-circle'
             : 'info-circle';
  el.innerHTML = `<i class="fas fa-${icon}"></i> ${msg}`;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
import { setConfirmResolve } from './state.js';

export function confirm(title, msg) {
  return new Promise(r => {
    setConfirmResolve(r);
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent   = msg;
    openModal('confirmModal');
  });
}

export function initConfirm(getResolve) {
  document.getElementById('confirmYes').addEventListener('click', () => {
    closeModal('confirmModal');
    getResolve()?.(true);
  });
  document.getElementById('confirmNo').addEventListener('click', () => {
    closeModal('confirmModal');
    getResolve()?.(false);
  });
  document.getElementById('confirmClose').addEventListener('click', () => {
    closeModal('confirmModal');
    getResolve()?.(false);
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ─── View switcher (list / form / bulk) ───────────────────────────────────────
export function showView(name) {
  ['list', 'form', 'bulk'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('active', v === name);
  });
  window.scrollTo(0, 0);
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export function initTabs({ onInicio, onCalendario, onPast, onMinistries, onUsers, onDiscipulado, onGaleria, onAnalytics, onActivity, onSettings, onTreasury }) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`tab-${btn.dataset.tab}`);
      if (panel) panel.classList.add('active');

      if (btn.dataset.tab === 'inicio')      onInicio?.();
      if (btn.dataset.tab === 'past')        onPast?.();
      if (btn.dataset.tab === 'calendario')  onCalendario?.();
      if (btn.dataset.tab === 'ministries')  onMinistries?.();
      if (btn.dataset.tab === 'users')       onUsers?.();
      if (btn.dataset.tab === 'discipulado') onDiscipulado?.();
      if (btn.dataset.tab === 'galeria')     onGaleria?.();
      if (btn.dataset.tab === 'analytics')   onAnalytics?.();
      if (btn.dataset.tab === 'activity')    onActivity?.();
      if (btn.dataset.tab === 'settings')    onSettings?.();
      if (btn.dataset.tab === 'treasury')    onTreasury?.();
    });
  });
}