// js/pages/admin/event-presets.js
// ─────────────────────────────────────────────────────────────────────────────
// Calendario → "Presets": the special-event presets (Noche de Caballeros, …).
//   • Panel     — the preset list, collapsed behind the toolbar's Presets button.
//   • Editor    — create / edit every field a preset fills, plus its repeat rule.
//   • Programar — turn a preset's rule into events across several months at
//                 once. Also opened by the Agregar wizard ("Repetir en varios
//                 meses") with the values edited there.
// All data goes through /js/lib/event-presets.js. RLS is the guard
// (20261026000001_event_presets.sql): someone without access gets the error,
// nothing is hidden client-side.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS, pad2, todayISO, ymd } from './state.js';
import { toast, confirm, openModal, closeModal } from './ui.js';
import { loadCalendario } from './calendar-tab.js';
import { loadUpcoming } from './events-tab.js';
import {
  DEFAULT_LOC_ADDR, mountTagPicker, mountImgPicker, setImg, clearImg, refreshPresetSelects,
} from './event-form.js';
import {
  fetchEventPresets, saveEventPreset, deleteEventPreset, existingEventDays, createEventsOn,
  ruleLabel, formatTime12, PATTERNS, WEEKDAYS,
} from '/js/lib/event-presets.js';
import { datesInMonth, monthsFrom, nextOccurrence, isRepeating } from '/js/utils/recurrence.js';
import { html, raw } from '/js/utils/escape.js';
import { render } from '/js/utils/render.js';
import { $ } from '/js/utils/dom.js';
import { loadingHtml, emptyHtml, errorHtml } from '/js/components/states.js';

const DEPLOY_MONTHS = 12;

let list      = [];     // presets shown in the panel
let editingId = null;   // preset open in the editor (null = new)
let tagPicker = null;
// Open "Programar" session: the values to create from, the 12-month span,
// the months picked, days the admin unticked, and days that already have the
// event (null while that check is still running).
let deploy = null;

// ── Entry point ──────────────────────────────────────────────────────────────
export function initEventPresets() {
  const btn = $('calPresetsBtn');
  const panel = $('epPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('is-active', open);
    if (open) renderPanel();
  });
  $('epNewBtn').addEventListener('click', () => openEditor(null));
  $('epList').addEventListener('click', onListClick);

  // Editor
  tagPicker = mountTagPicker('epTagPicker', 'epTag');
  mountImgPicker($('epImgSection'), 'ep');
  $('epPattern').innerHTML = PATTERNS.map(p => html`<option value="${p.id}">${p.label}</option>`).join('');
  $('epDow').innerHTML = WEEKDAYS.map((d, i) => html`<option value="${i}">${cap(d)}</option>`).join('');
  $('epNth').innerHTML = [1, 2, 3, 4, 5].map(n => html`<option value="${n}">${n}.ª semana</option>`).join('');
  ['epPattern', 'epDow', 'epNth'].forEach(id => $(id).addEventListener('change', syncRuleRows));
  $('epModalSave').addEventListener('click', savePreset);
  $('epModalDelete').addEventListener('click', () => {
    const p = list.find(x => x.id === editingId);
    if (p) removePreset(p);
  });
  $('epModalClose').addEventListener('click', () => closeModal('epModal'));
  $('epModalCancel').addEventListener('click', () => closeModal('epModal'));

  // Programar
  $('epMonths').addEventListener('click', onMonthClick);
  $('epDates').addEventListener('click', onDateClick);
  $('epMonthsAll').addEventListener('click', () => setAllMonths(true));
  $('epMonthsNone').addEventListener('click', () => setAllMonths(false));
  $('epDeployStart').addEventListener('input', renderDeployButton);
  $('epDeploySave').addEventListener('click', runDeploy);
  $('epDeployClose').addEventListener('click', closeDeploy);
  $('epDeployCancel').addEventListener('click', closeDeploy);
}

// ── Panel ────────────────────────────────────────────────────────────────────
async function renderPanel() {
  const el = $('epList');
  render(el, loadingHtml());
  const { data, error } = await fetchEventPresets({ fresh: true });
  if (error) { render(el, errorHtml(error)); return; }
  list = data;
  if (!list.length) {
    render(el, emptyHtml('fa-layer-group', 'Aún no hay presets. Crea el primero con «Nuevo preset».'));
    return;
  }
  render(el, html`<div class="ep-list">${list.map(cardHtml)}</div>`);
}

function cardHtml(p) {
  const time = [formatTime12(p.start_time), formatTime12(p.end_time)].filter(Boolean).join(' – ');
  const repeats = isRepeating(p);
  return html`
    <article class="ep-card">
      ${p.image_url
        ? html`<img class="ep-card__img" src="${p.image_url}" alt="" loading="lazy">`
        : html`<div class="ep-card__img ep-card__img--empty"><i class="fas fa-image"></i></div>`}
      <div class="ep-card__body">
        <h4 class="ep-card__title">${p.title}</h4>
        <p class="ep-card__meta"><i class="fas fa-repeat"></i> ${ruleLabel(p)}${time ? ` · ${time}` : ''}</p>
        ${p.organizer_name ? html`<p class="ep-card__meta"><i class="fas fa-user"></i> ${p.organizer_name}</p>` : ''}
      </div>
      <div class="ep-card__actions">
        ${repeats
          ? html`<button type="button" class="btn btn--primary" data-ep-action="deploy" data-id="${p.id}">
                   <i class="fas fa-calendar-plus"></i> Programar
                 </button>`
          : ''}
        <button type="button" class="btn btn--ghost" data-ep-action="edit" data-id="${p.id}">
          <i class="fas fa-pen"></i> Editar
        </button>
        <button type="button" class="icon-btn__admin danger" data-ep-action="delete" data-id="${p.id}"
                title="Eliminar" aria-label="Eliminar ${p.title}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </article>`;
}

function onListClick(e) {
  const btn = e.target.closest('[data-ep-action]');
  const p = btn && list.find(x => x.id === btn.dataset.id);
  if (!p) return;
  if (btn.dataset.epAction === 'deploy') openDeploy(p);
  else if (btn.dataset.epAction === 'edit') openEditor(p);
  else if (btn.dataset.epAction === 'delete') removePreset(p);
}

// After any write: the panel and the event forms' "Tipo de evento" selects.
async function presetsChanged() {
  if (!$('epPanel').hidden) await renderPanel();
  await refreshPresetSelects();
}

// ── Editor ───────────────────────────────────────────────────────────────────
function openEditor(p) {
  editingId = p?.id || null;
  $('epModalTitle').textContent = p ? 'Editar preset' : 'Nuevo preset';
  $('epTitle').value    = p?.title || '';
  tagPicker.reset();
  if (p?.tag) tagPicker.setTags(p.tag.split('/').map(t => t.trim()).filter(Boolean));
  $('epLoc').value      = p ? (p.location || '') : DEFAULT_LOC_ADDR;
  $('epStart').value    = p?.start_time || '';
  $('epEnd').value      = p?.end_time || '';
  $('epDesc').value     = p?.description || '';
  $('epOrgName').value  = p?.organizer_name || '';
  $('epOrgEmail').value = p?.organizer_email || '';
  clearImg('ep');
  if (p?.image_url) setImg('ep', p.image_url);
  $('epPattern').value  = p?.pattern_type || 'none';
  $('epDow').value      = String(p?.day_of_week ?? 6);
  $('epNth').value      = String(p?.nth_week ?? 1);
  syncRuleRows();
  $('epModalDelete').hidden = !p;
  showError('epModalError', '');
  openModal('epModal');
}

function readRule() {
  return { pattern_type: $('epPattern').value, day_of_week: $('epDow').value, nth_week: $('epNth').value };
}

// Show only the inputs the chosen rule uses, and say when it would land next.
function syncRuleRows() {
  const rule = readRule();
  $('epDowRow').hidden = rule.pattern_type === 'none';
  $('epNthRow').hidden = rule.pattern_type !== 'nthWeekday';
  const next = nextOccurrence(rule);
  $('epRuleHint').textContent = rule.pattern_type === 'none'
    ? 'Sin repetición: el preset solo llena los datos al crear un evento.'
    : next ? `Próxima fecha: ${longDate(next)}.` : '';
}

async function savePreset() {
  const btn = $('epModalSave');
  btn.disabled = true;
  const res = await saveEventPreset({
    title:           $('epTitle').value,
    tag:             $('epTag').value,
    location:        $('epLoc').value,
    start_time:      $('epStart').value,
    end_time:        $('epEnd').value,
    description:     $('epDesc').value,
    organizer_name:  $('epOrgName').value,
    organizer_email: $('epOrgEmail').value,
    image_url:       $('ep-url').value,
    ...readRule(),
  }, editingId);
  btn.disabled = false;
  if (res.error) { showError('epModalError', res.error); return; }
  closeModal('epModal');
  toast(editingId ? 'Preset actualizado' : 'Preset creado', 'success');
  await presetsChanged();
}

async function removePreset(p) {
  const ok = await confirm('¿Eliminar preset?',
    `"${p.title}" se eliminará. Los eventos ya creados con este preset no cambian.`);
  if (!ok) return;
  const res = await deleteEventPreset(p.id);
  if (res.error) { toast(res.error, 'error'); return; }
  closeModal('epModal');
  toast('Preset eliminado', 'success');
  await presetsChanged();
}

// ── Programar (mass deploy) ──────────────────────────────────────────────────
/** Open the month picker for `values` (a preset, or the wizard's edited copy). */
export async function openDeploy(values) {
  const span = monthsFrom(new Date(), DEPLOY_MONTHS);
  const session = { values, span, months: new Set(), off: new Set(), taken: null, takenError: '' };
  deploy = session;
  $('epDeployTitle').textContent = `Programar: ${values.title}`;
  $('epDeployRule').textContent = `Se repite: ${ruleLabel(values)}.`;
  $('epDeployStart').value = values.start_time || '';
  $('epDeployEnd').value = values.end_time || '';
  showError('epDeployError', '');
  renderMonths();
  renderDates();
  openModal('epDeployModal');

  const first = span[0], last = span[span.length - 1];
  const res = await existingEventDays(values.title.trim(),
    ymd(first.year, first.month, 1),
    ymd(last.year, last.month, new Date(last.year, last.month + 1, 0).getDate()));
  if (deploy !== session) return;   // closed or reopened meanwhile
  if (res.error) session.takenError = 'No se pudo comprobar qué fechas ya tienen este evento. Revisa el calendario para no duplicarlo.';
  else session.taken = res.data;
  renderDates();
}

function closeDeploy() {
  deploy = null;
  closeModal('epDeployModal');
}

const monthKey = (year, month) => `${year}-${pad2(month + 1)}`;

function renderMonths() {
  render($('epMonths'), html`${deploy.span.map(({ year, month }) => {
    const on = deploy.months.has(monthKey(year, month));
    return html`<button type="button" class="ep-chip" data-month="${monthKey(year, month)}" aria-pressed="${on}">
      ${MONTHS[month].slice(0, 3)} ${year}</button>`;
  })}`);
}

function onMonthClick(e) {
  const chip = e.target.closest('[data-month]');
  if (!chip || !deploy) return;
  const key = chip.dataset.month;
  if (deploy.months.has(key)) deploy.months.delete(key); else deploy.months.add(key);
  renderMonths();
  renderDates();
}

function setAllMonths(on) {
  if (!deploy) return;
  deploy.months = new Set(on ? deploy.span.map(({ year, month }) => monthKey(year, month)) : []);
  renderMonths();
  renderDates();
}

function onDateClick(e) {
  const pill = e.target.closest('[data-day]');
  if (!pill || pill.disabled || !deploy) return;
  const day = pill.dataset.day;
  if (deploy.off.has(day)) deploy.off.delete(day); else deploy.off.add(day);
  renderDates();
}

// Every date of the picked months, with why it would or wouldn't be created.
function dateRows() {
  const today = todayISO();
  const rows = [];
  for (const { year, month } of deploy.span) {
    if (!deploy.months.has(monthKey(year, month))) continue;
    const days = datesInMonth(deploy.values, year, month);
    if (!days.length) rows.push({ none: `${MONTHS[month]} ${year}` });
    for (const day of days) {
      const status = day < today ? 'past'
        : deploy.taken?.has(day) ? 'taken'
        : deploy.off.has(day) ? 'off' : 'on';
      rows.push({ day, status });
    }
  }
  return rows;
}

function renderDates() {
  const rows = dateRows();
  const note = deploy.takenError
    ? html`<p class="ep-hint ep-hint--warn"><i class="fas fa-exclamation-triangle"></i> ${deploy.takenError}</p>`
    : deploy.taken ? '' : html`<p class="ep-hint"><i class="fas fa-spinner fa-spin"></i> Comprobando qué fechas ya tienen este evento…</p>`;
  const NOTE = { past: 'ya pasó', taken: 'ya existe', off: 'no se crea' };
  render($('epDates'), rows.length
    ? html`${note}<div class="ep-dates">${rows.map(r => r.none
        ? html`<span class="ep-date ep-date--none">${r.none}: sin fecha</span>`
        : html`<button type="button" class="ep-date ep-date--${r.status}" data-day="${r.day}"
                 aria-pressed="${r.status === 'on'}" ${raw(r.status === 'past' || r.status === 'taken' ? 'disabled' : '')}>
                 ${shortDate(r.day)}${NOTE[r.status] ? html` <small>· ${NOTE[r.status]}</small>` : ''}
               </button>`)}</div>`
    : html`${note}<p class="ep-hint">Elige uno o más meses para ver las fechas.</p>`);
  renderDeployButton();
}

function renderDeployButton() {
  if (!deploy) return;
  const n = dateRows().filter(r => r.status === 'on').length;
  const checking = !deploy.taken && !deploy.takenError;
  const btn = $('epDeploySave');
  btn.disabled = !n || checking || !$('epDeployStart').value;
  btn.innerHTML = html`<i class="fas fa-calendar-plus"></i> ${n ? `Crear ${n} evento${n === 1 ? '' : 's'}` : 'Crear eventos'}`;
}

async function runDeploy() {
  if (!deploy) return;
  const session = deploy;
  const days = dateRows().filter(r => r.status === 'on').map(r => r.day);
  const btn = $('epDeploySave');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
  const res = await createEventsOn({
    ...session.values,
    start_time: $('epDeployStart').value,
    end_time:   $('epDeployEnd').value,
  }, days);
  if (deploy !== session) return;
  if (res.error) { showError('epDeployError', res.error); renderDeployButton(); return; }
  closeDeploy();
  toast(`${res.created} evento${res.created === 1 ? '' : 's'} creado${res.created === 1 ? '' : 's'}`, 'success');
  loadCalendario();
  loadUpcoming();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function showError(id, msg) {
  const el = $(id);
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Day keys are local calendar days; T00:00 keeps them from shifting by UTC.
function longDate(day) {
  return new Date(`${day}T00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function shortDate(day) {
  return new Date(`${day}T00:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}
