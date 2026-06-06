import { escapeHtml } from '/js/utils/escape.js';
// js/components/action-sheet.js
// ─────────────────────────────────────────────────────────────────────────────
// iOS-style action sheet / context menu.
//   • Desktop: anchored popover next to the trigger button
//   • Mobile (≤640px): bottom sheet that slides up
// Each action becomes a row with optional icon + variant ('default' | 'warn' | 'danger').
// A 'Cancelar' button is auto-appended unless `cancelLabel: false`.
//
//   showActionSheet({
//     trigger: HTMLElement,
//     title: 'Estudio Bíblico',
//     subtitle: 'Domingo, 12 de octubre',
//     actions: [
//       { label: 'Editar',          icon: 'fa-pen',   onClick: () => {} },
//       { label: 'Cancelar evento', icon: 'fa-ban',   variant: 'warn',   onClick: () => {} },
//       { label: 'Eliminar',        icon: 'fa-trash', variant: 'danger', onClick: () => {} },
//     ],
//   });
// ─────────────────────────────────────────────────────────────────────────────

let _open = null;

export function showActionSheet({
  trigger, title, subtitle, actions = [],
  cancelLabel = 'Cancelar',
} = {}) {
  closeActionSheet();
  if (!actions.length) return;

  const isMobile = window.matchMedia('(max-width: 640px)').matches;

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = `act-sheet-backdrop ${isMobile ? 'act-sheet-backdrop--mobile' : ''}`;
  backdrop.setAttribute('role', 'presentation');

  // Sheet
  const sheet = document.createElement('div');
  sheet.className = `act-sheet ${isMobile ? 'act-sheet--mobile' : 'act-sheet--popover'}`;
  sheet.setAttribute('role', 'menu');

  const titleHtml = (title || subtitle) ? `
    <div class="act-sheet__header">
      ${title    ? `<div class="act-sheet__title">${escapeHtml(title)}</div>` : ''}
      ${subtitle ? `<div class="act-sheet__subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>` : '';

  const actionsHtml = actions.map((a, i) => `
    <button
      type="button"
      class="act-sheet__row act-sheet__row--${a.variant || 'default'}"
      data-act-idx="${i}"
      role="menuitem"
    >
      ${a.icon ? `<i class="fas ${a.icon}"></i>` : ''}
      <span>${escapeHtml(a.label || '')}</span>
    </button>
  `).join('');

  const cancelHtml = cancelLabel ? `
    <button type="button" class="act-sheet__cancel" data-act-cancel>
      ${escapeHtml(cancelLabel)}
    </button>` : '';

  sheet.innerHTML = `
    <div class="act-sheet__card">
      ${titleHtml}
      <div class="act-sheet__actions">${actionsHtml}</div>
    </div>
    ${cancelHtml}
  `;

  // Positioning — only for popover variant
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  if (!isMobile && trigger) positionPopover(sheet, trigger);

  // Animate in
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
  });

  // Wire actions
  sheet.querySelectorAll('[data-act-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.actIdx);
      const action = actions[idx];
      closeActionSheet();
      // Defer the action so the close animation can start
      setTimeout(() => { try { action?.onClick?.(); } catch (err) { console.error(err); } }, 60);
    });
  });

  sheet.querySelector('[data-act-cancel]')?.addEventListener('click', closeActionSheet);
  backdrop.addEventListener('click', closeActionSheet);

  const onKey = (e) => { if (e.key === 'Escape') closeActionSheet(); };
  document.addEventListener('keydown', onKey);

  const onResize = () => {
    if (!isMobile && trigger && document.body.contains(sheet)) positionPopover(sheet, trigger);
  };
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('scroll', onResize, { passive: true, capture: true });

  _open = { backdrop, sheet, onKey, onResize };
}

export function closeActionSheet() {
  if (!_open) return;
  const { backdrop, sheet, onKey, onResize } = _open;
  _open = null;
  backdrop.classList.remove('is-open');
  sheet.classList.remove('is-open');
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', onResize, { capture: true });
  setTimeout(() => {
    backdrop.remove();
    sheet.remove();
  }, 240);
}

function positionPopover(sheet, trigger) {
  const rect    = trigger.getBoundingClientRect();
  const vw      = window.innerWidth;
  const vh      = window.innerHeight;
  // Render off-screen first to measure
  sheet.style.visibility = 'hidden';
  sheet.style.position = 'fixed';
  sheet.style.top = '0px';
  sheet.style.left = '0px';
  const sw = sheet.offsetWidth || 240;
  const sh = sheet.offsetHeight || 200;

  // Default: right side aligned to trigger's right edge, below the trigger
  let left = rect.right - sw;
  let top  = rect.bottom + 8;

  // Flip up if it overflows the viewport bottom
  if (top + sh > vh - 12) top = rect.top - sh - 8;
  if (top < 12) top = 12;

  // Clamp horizontally
  if (left < 12) left = 12;
  if (left + sw > vw - 12) left = vw - sw - 12;

  sheet.style.top  = `${top}px`;
  sheet.style.left = `${left}px`;
  sheet.style.visibility = 'visible';
}


