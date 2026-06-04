// js/pages/admin/form-wizard.js
// ─────────────────────────────────────────────────────────────────────────────
// Reusable step-by-step wizard — one clear question per screen, big choices,
// a review, then save. Matches the event / discipleship / gallery wizards so
// the whole admin feels the same and is hard to get wrong.
//
//   openFormWizard({
//     title: 'Nuevo ingreso', icon: 'fa-arrow-down', submitLabel: 'Guardar',
//     data: { amount: 100 },                       // initial values (edit mode)
//     steps: [
//       { label: '¿Cuánto se recibió?', hint: 'Escribe el monto.',
//         fields: [{ id: 'amount', label: 'Monto', type: 'money', required: true }] },
//       { label: '¿De dónde vino?',
//         fields: [{ id: 'source', label: 'Fuente', type: 'text', required: true }] },
//     ],
//     onSubmit: async (data) => sb.from('fin_income').insert({...}),  // {error}|ok
//     onDone: () => reload(),
//   });
//
// Field types: text · textarea · number · money · date · select · choice
//   choice → big tappable cards, options: [{ value, label, desc, icon }]
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from './ui.js';

let root = null;
let keyHandler = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function openFormWizard(cfg) {
  close();
  const steps = cfg.steps || [];
  const data = { ...(cfg.data || {}) };
  // Apply defaults
  steps.forEach(s => (s.fields || []).forEach(f => {
    if (data[f.id] == null && f.default != null) data[f.id] = f.default;
  }));

  let idx = 0;                       // 0..steps.length  (=== length → review)
  const total = steps.length + 1;

  root = document.createElement('div');
  root.className = 'wizard-backdrop open';
  root.innerHTML = `
    <div class="wizard" role="dialog" aria-modal="true">
      <div class="wizard__header">
        <h3>${cfg.icon ? `<i class="fas ${cfg.icon}" style="margin-right:.5rem;opacity:.7"></i>` : ''}${esc(cfg.title || '')}</h3>
        <button type="button" class="wizard__close" aria-label="Cerrar">&times;</button>
      </div>
      <div class="wizard__progress" id="fwProg"></div>
      <div class="wizard__body" id="fwBody"></div>
    </div>`;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  root.querySelector('.wizard__close').addEventListener('click', close);
  root.addEventListener('click', e => { if (e.target === root) close(); });
  keyHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', keyHandler);

  function renderProgress() {
    const prog = root.querySelector('#fwProg');
    prog.innerHTML = Array.from({ length: total }, (_, i) =>
      `<span class="wizard__progress-dot${i === idx ? ' active' : ''}${i < idx ? ' done' : ''}"></span>`).join('');
  }

  function fieldControl(f) {
    const v = data[f.id];
    if (f.type === 'choice') {
      return `<div class="wiz-cat-grid fw-choice" data-fid="${f.id}">
        ${(f.options || []).map(o => `
          <div class="wiz-cat-card${v === o.value ? ' selected' : ''}" data-val="${esc(o.value)}">
            ${o.icon ? `<i class="fas ${o.icon}" style="font-size:1.2rem;color:var(--color-secondary);margin-bottom:.35rem;display:block"></i>` : ''}
            <div class="wiz-cat-card__title">${esc(o.label)}</div>
            ${o.desc ? `<div class="wiz-cat-card__desc">${esc(o.desc)}</div>` : ''}
          </div>`).join('')}
      </div>`;
    }
    if (f.type === 'textarea') {
      return `<textarea id="fw_${f.id}" rows="3" placeholder="${esc(f.placeholder || '')}">${esc(v || '')}</textarea>`;
    }
    if (f.type === 'select') {
      return `<select id="fw_${f.id}">${(f.options || []).map(o =>
        `<option value="${esc(o.value)}"${String(v) === String(o.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    }
    if (f.type === 'money') {
      return `<div class="fw-money"><span>$</span><input type="number" id="fw_${f.id}" min="0" step="0.01" inputmode="decimal" value="${v ?? ''}" placeholder="0.00"></div>`;
    }
    const t = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
    return `<input type="${t}" id="fw_${f.id}" value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}"${t === 'number' ? ' inputmode="decimal"' : ''}>`;
  }

  function renderStep() {
    renderProgress();
    const body = root.querySelector('#fwBody');

    if (idx === steps.length) { renderReview(body); return; }

    const s = steps[idx];
    body.innerHTML = `
      <div class="wiz-step active">
        <div class="wiz-step-label">Paso ${idx + 1} de ${steps.length}</div>
        <h4 style="font-size:1.15rem;font-weight:700;margin:.1rem 0 .3rem;color:var(--color-dark)">${esc(s.label || '')}</h4>
        ${s.hint ? `<p class="wiz-hint" style="margin:0 0 1rem">${esc(s.hint)}</p>` : ''}
        ${(s.fields || []).map(f => `
          <div class="wiz-field">
            ${f.type === 'choice' && !f.label ? '' : `<label for="fw_${f.id}">${esc(f.label || '')}</label>`}
            ${fieldControl(f)}
            ${f.hint ? `<div class="wiz-hint">${esc(f.hint)}</div>` : ''}
          </div>`).join('')}
        <div class="fw-err" id="fwErr"></div>
      </div>
      <div class="wiz-nav">
        ${idx > 0 ? '<button type="button" class="btn btn--ghost" id="fwBack">← Atrás</button>' : ''}
        <div class="wiz-nav__spacer"></div>
        <button type="button" class="btn btn--primary" id="fwNext">${idx === steps.length - 1 ? 'Revisar →' : 'Siguiente →'}</button>
      </div>`;

    // Wire inputs
    (s.fields || []).forEach(f => {
      if (f.type === 'choice') {
        body.querySelectorAll(`[data-fid="${f.id}"] .wiz-cat-card`).forEach(card =>
          card.addEventListener('click', () => { data[f.id] = card.dataset.val; renderStep(); }));
      } else {
        const el = body.querySelector(`#fw_${f.id}`);
        el?.addEventListener('input', () => { data[f.id] = el.value; });
      }
    });
    body.querySelector('#fwBack')?.addEventListener('click', () => { idx--; renderStep(); });
    body.querySelector('#fwNext')?.addEventListener('click', next);
    body.querySelector('input,textarea,select')?.focus();
  }

  function next() {
    const s = steps[idx];
    for (const f of (s.fields || [])) {
      if (!f.required) continue;
      const val = data[f.id];
      const empty = val == null || String(val).trim() === '';
      if (empty || (f.type === 'money' && !(Number(val) >= 0))) {
        showErr(`Por favor completa: ${f.label || 'este campo'}.`);
        return;
      }
    }
    idx++; renderStep();
  }

  function showErr(msg) {
    const el = root.querySelector('#fwErr');
    if (el) el.textContent = msg;
  }

  function fmtVal(f) {
    const v = data[f.id];
    if (v == null || String(v).trim() === '') return '—';
    if (f.type === 'money') return (Number(v) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    if (f.type === 'choice' || f.type === 'select') return (f.options.find(o => String(o.value) === String(v))?.label) || v;
    if (f.type === 'date') { const [y, m, d] = String(v).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }
    return v;
  }

  function renderReview(body) {
    const allFields = steps.flatMap(s => s.fields || []);
    body.innerHTML = `
      <div class="wiz-step active">
        <div class="wiz-step-label">Revisa antes de guardar</div>
        <div class="dwiz-review">
          ${allFields.map(f => `
            <div class="dwiz-review__row"><i class="fas fa-${iconFor(f)}"></i>
              <span style="min-width:96px;color:var(--color-muted)">${esc(f.label || '')}:</span>
              <strong>${esc(fmtVal(f))}</strong></div>`).join('')}
        </div>
        <div class="fw-err" id="fwErr"></div>
      </div>
      <div class="wiz-nav">
        <button type="button" class="btn btn--ghost" id="fwBack">← Atrás</button>
        <div class="wiz-nav__spacer"></div>
        <button type="button" class="btn btn--primary" id="fwSubmit" style="min-width:140px">
          <i class="fas fa-check"></i> ${esc(cfg.submitLabel || 'Guardar')}</button>
      </div>`;
    body.querySelector('#fwBack').addEventListener('click', () => { idx--; renderStep(); });
    body.querySelector('#fwSubmit').addEventListener('click', submit);
  }

  function iconFor(f) {
    return f.type === 'money' || f.type === 'number' ? 'dollar-sign'
      : f.type === 'date' ? 'calendar-day'
      : f.type === 'choice' || f.type === 'select' ? 'list'
      : 'pen';
  }

  async function submit() {
    const btn = root.querySelector('#fwSubmit');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    let res;
    try { res = await cfg.onSubmit?.(data); }
    catch (e) { res = { error: { message: e?.message || 'Error' } }; }
    if (res?.error) {
      btn.disabled = false; btn.innerHTML = orig;
      showErr(res.error.message || 'No se pudo guardar.');
      return;
    }
    toast('Guardado', 'success');
    close();
    cfg.onDone?.();
  }

  renderStep();
}

export function close() {
  if (!root) return;
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  root.remove();
  root = null;
  document.body.style.overflow = '';
}
