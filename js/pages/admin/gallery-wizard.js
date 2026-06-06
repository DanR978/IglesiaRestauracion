import { escapeHtml, escapeAttr } from '/js/utils/escape.js';
// js/pages/admin/gallery-wizard.js
// ─────────────────────────────────────────────────────────────────────────────
// Step-by-step wizard for creating a gallery album. Mirrors the event &
// discipleship wizards — 4 steps + progress dots + Back/Next.
//
//   Step 1 → Pick event type (visual card grid)
//   Step 2 → Title + event date (both required; year auto-derives from date)
//   Step 3 → Optional description + visibility toggle
//   Step 4 → Review summary + "Crear y subir fotos →"
//
// On completion: upsertAlbum is called, the wizard closes, and the caller's
// `onCreated(album)` callback fires (the caller opens the editor so the new
// album is ready to receive photos right away).
// ─────────────────────────────────────────────────────────────────────────────

import { EVENT_TYPES, EVENT_TYPE_LABEL, upsertAlbum } from '/js/lib/gallery.js';
import { toast } from './ui.js';

/* ── State ──────────────────────────────────────────────────────────── */
let step = 1;
let data = blankData();
let onCreated = null;

function blankData() {
  return {
    event_type: '',     // '' means "no specific type"
    title: '',
    event_date: '',
    description: '',
    is_published: true,
  };
}

const $ = id => document.getElementById(id);

/* ── Public API ─────────────────────────────────────────────────────── */
export function openGalleryWizard(opts = {}) {
  step = 1;
  data = blankData();
  onCreated = opts.onCreated || null;
  renderStep();
  $('gwizBackdrop')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeGalleryWizard() {
  $('gwizBackdrop')?.classList.remove('open');
  document.body.style.overflow = '';
}

export function initGalleryWizard() {
  $('gwizClose')?.addEventListener('click', closeGalleryWizard);
  $('gwizBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeGalleryWizard();
  });
  window.__gwizBack = () => { if (step > 1) { step--; renderStep(); } };
}

/* ── Renderer ───────────────────────────────────────────────────────── */
function renderStep() {
  document.querySelectorAll('#gwizBackdrop .wizard__progress-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === step);
    dot.classList.toggle('done',   i + 1 < step);
  });

  document.querySelectorAll('#gwizBackdrop .wiz-step').forEach(s => s.classList.remove('active'));
  $(`gwizStep${step}`)?.classList.add('active');

  const titles = {
    1: '¿Qué tipo de evento?',
    2: 'Nombre y fecha',
    3: 'Detalles opcionales',
    4: 'Confirmar y crear',
  };
  $('gwizTitle').textContent = titles[step] || 'Crear álbum';

  if (step === 1) renderStep1();
  if (step === 2) renderStep2();
  if (step === 3) renderStep3();
  if (step === 4) renderStep4();
}

/* ── Step 1: Event type picker ──────────────────────────────────────── */
function renderStep1() {
  const c = $('gwizStep1');
  c.innerHTML = `
    <div class="wiz-step-label">Escoge una categoría para el álbum</div>
    <div class="gwiz-type-grid">
      <div class="gwiz-type-card${data.event_type === '' ? ' selected' : ''}" data-type="">
        <i class="fas fa-folder-open"></i>
        <div class="gwiz-type-card__name">Sin categoría</div>
      </div>
      ${EVENT_TYPES.filter(t => t.value !== 'other').map(t => `
        <div class="gwiz-type-card${data.event_type === t.value ? ' selected' : ''}" data-type="${t.value}">
          <i class="fas ${t.icon}"></i>
          <div class="gwiz-type-card__name">${escapeHtml(t.label)}</div>
        </div>
      `).join('')}
    </div>
    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__gwizClose()">Cancelar</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="gwizStep1Next">Siguiente →</button>
    </div>
  `;

  window.__gwizClose = closeGalleryWizard;

  c.querySelectorAll('.gwiz-type-card').forEach(card => {
    card.addEventListener('click', () => {
      data.event_type = card.dataset.type;
      renderStep1();
    });
  });

  $('gwizStep1Next')?.addEventListener('click', () => { step = 2; renderStep(); });
}

/* ── Step 2: Title + date ───────────────────────────────────────────── */
function renderStep2() {
  const c = $('gwizStep2');
  const typeLabel = data.event_type ? EVENT_TYPE_LABEL[data.event_type] : 'Sin categoría';

  c.innerHTML = `
    <div class="wiz-step-label">Categoría: ${escapeHtml(typeLabel)}</div>

    <div class="wiz-field">
      <label><i class="fas fa-tag" style="margin-right:4px;opacity:.5"></i> Título del álbum *</label>
      <input type="text" id="gwizName" placeholder="ej. Noche de Adoración — Marzo" value="${escapeAttr(data.title)}">
      <div class="wiz-hint">Cómo aparecerá el álbum en la galería pública</div>
    </div>

    <div class="wiz-field">
      <label><i class="fas fa-calendar-day" style="margin-right:4px;opacity:.5"></i> Fecha del evento *</label>
      <input type="date" id="gwizDate" value="${escapeAttr(data.event_date)}">
      <div class="wiz-hint">Se usa para ordenar y para mostrar el álbum más reciente</div>
    </div>

    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__gwizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="gwizStep2Next">Siguiente →</button>
    </div>
  `;

  $('gwizStep2Next')?.addEventListener('click', () => {
    const title = $('gwizName').value.trim();
    const date  = $('gwizDate').value;
    if (!title) { toast('El título es obligatorio', 'error'); $('gwizName').focus(); return; }
    if (!date)  { toast('Pon la fecha del evento', 'error'); $('gwizDate').focus(); return; }
    data.title = title;
    data.event_date = date;
    step = 3; renderStep();
  });
}

/* ── Step 3: Description + visibility ───────────────────────────────── */
function renderStep3() {
  const c = $('gwizStep3');
  c.innerHTML = `
    <div class="wiz-step-label">Estos campos son opcionales</div>

    <div class="wiz-field">
      <label><i class="fas fa-align-left" style="margin-right:4px;opacity:.5"></i> Descripción</label>
      <textarea id="gwizDesc" rows="3" placeholder="Breve descripción de la actividad, lugar, momentos especiales...">${escapeText(data.description)}</textarea>
    </div>

    <div class="wiz-field">
      <label style="display:flex;align-items:center;gap:.5rem;text-transform:none;font-size:.88rem;font-weight:500;letter-spacing:0;cursor:pointer">
        <input type="checkbox" id="gwizPublished" ${data.is_published ? 'checked' : ''} style="width:auto;accent-color:var(--color-dark)">
        Visible en la galería pública
      </label>
      <div class="wiz-hint">Si lo dejas sin marcar, el álbum queda como borrador hasta que decidas publicarlo</div>
    </div>

    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__gwizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="gwizStep3Next">Siguiente →</button>
    </div>
  `;

  // Persist on input so review reflects them
  $('gwizDesc')?.addEventListener('input', e => data.description = e.target.value);
  $('gwizPublished')?.addEventListener('change', e => data.is_published = e.target.checked);

  $('gwizStep3Next')?.addEventListener('click', () => {
    data.description = $('gwizDesc').value;
    data.is_published = $('gwizPublished').checked;
    step = 4; renderStep();
  });
}

/* ── Step 4: Review + create ────────────────────────────────────────── */
function renderStep4() {
  const c = $('gwizStep4');
  const typeLabel = data.event_type ? EVENT_TYPE_LABEL[data.event_type] : 'Sin categoría';

  c.innerHTML = `
    <div class="wiz-step-label">Todo listo — revisa los datos</div>

    <div class="dwiz-review">
      <div class="dwiz-review__title">Resumen del álbum</div>
      <div class="dwiz-review__row"><i class="fas fa-folder-open"></i> ${escapeHtml(typeLabel)}</div>
      <div class="dwiz-review__row"><i class="fas fa-tag"></i> ${escapeHtml(data.title)}</div>
      <div class="dwiz-review__row"><i class="fas fa-calendar-day"></i> ${formatDate(data.event_date)}</div>
      ${data.description ? `<div class="dwiz-review__row"><i class="fas fa-align-left"></i> ${escapeHtml(truncate(data.description, 90))}</div>` : ''}
      <div class="dwiz-review__row"><i class="fas fa-${data.is_published ? 'eye' : 'eye-slash'}"></i> ${data.is_published ? 'Visible al público' : 'Solo borrador'}</div>
    </div>

    <p class="gwiz-after-note">
      <i class="fas fa-info-circle"></i>
      Después de crear el álbum, te llevamos directo a la sección de fotos para que puedas subirlas.
    </p>

    <div class="wiz-nav">
      <button class="btn btn--ghost" onclick="window.__gwizBack()">← Atrás</button>
      <div class="wiz-nav__spacer"></div>
      <button class="btn btn--primary" id="gwizCreateBtn" style="min-width:180px">
        <i class="fas fa-check"></i> Crear y subir fotos
      </button>
    </div>
  `;

  $('gwizCreateBtn')?.addEventListener('click', createAlbum);
}

/* ── Create the album ───────────────────────────────────────────────── */
async function createAlbum() {
  const btn = $('gwizCreateBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...'; }

  // Derive year from event_date (required at step 2)
  const year = data.event_date ? Number(data.event_date.split('-')[0]) : new Date().getFullYear();

  const payload = {
    title:        data.title,
    year,
    event_type:   data.event_type || null,
    event_date:   data.event_date || null,
    description:  data.description?.trim() || null,
    is_published: !!data.is_published,
    is_featured:  false,
  };

  try {
    const { data: album, error } = await upsertAlbum(payload);
    if (error) throw new Error(error);
    toast('Álbum creado — ya puedes subir fotos', 'success');
    closeGalleryWizard();
    if (typeof onCreated === 'function') onCreated(album);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Crear y subir fotos'; }
  }
}

/* ── Helpers ────────────────────────────────────────────────────────── */


function escapeText(s) { return escapeHtml(s); }
function truncate(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; }
function formatDate(d) {
  if (!d) return '';
  const [y, mo, da] = d.split('-').map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}
