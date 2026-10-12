// js/pages/admin/site-analytics-tab.js
// ─────────────────────────────────────────────────────────────────────────────
// "Analíticas" — website traffic from the first-party tracker
// (js/lib/analytics.js → track Edge Function → analytics_summary RPC).
//
// One RPC per range change; everything below the controls is rendered from
// that one payload. Breakdown cards with sub-views (Entrada/Salida, …) swap
// their list locally without refetching. The "ahora" pill polls
// analytics_live only while this tab is open and the browser tab is visible.
//
// Charts are hand-drawn SVG (no chart library in the repo, and two simple
// forms don't justify adding one). Styles: css/pages/admin/site-analytics.css.
// ─────────────────────────────────────────────────────────────────────────────

import { html } from '/js/utils/escape.js';
import { render } from '/js/utils/render.js';
import { loadingHtml, emptyHtml, errorHtml } from '/js/components/states.js';
import { toast } from './ui.js';
import {
  RANGES, fetchSummary, fetchLive, isOptedOut, setOptedOut,
} from '/js/lib/site-analytics.js';

const LIVE_POLL_MS = 30_000;
const SITE = 'https://www.irdlex.org';
const TITLE_SUFFIX = /\s*[·|–-]\s*Iglesia Restauraci[oó]n Divina.*$/i;

const DAYS_S   = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_S = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Event names sent by js/lib/analytics.js (clicks) and js/lib/track.js callers.
const EVENT_LABELS = {
  newsletter_signup:     'Suscripción al boletín',
  contact_form:          'Formulario de contacto',
  discipleship_interest: 'Interés en discipulado',
  discipleship_signup:   'Inscripción a grupo de discipulado',
  event_registration:    'Inscripción a evento',
  call:                  'Llamada telefónica',
  email:                 'Correo electrónico',
  whatsapp:              'WhatsApp',
  directions:            'Cómo llegar',
  download:              'Descarga',
  outbound:              'Enlace externo',
};
const CONVERSIONS = new Set([
  'newsletter_signup', 'contact_form', 'discipleship_interest', 'discipleship_signup', 'event_registration',
]);

const DEVICE_LABELS = { mobile: 'Móvil', tablet: 'Tableta', desktop: 'Computadora' };

const KPIS = [
  { key: 'visitors',          label: 'Visitantes',            fmt: n => num(n) },
  { key: 'pageviews',         label: 'Vistas de página',      fmt: n => num(n) },
  { key: 'sessions',          label: 'Visitas',               fmt: n => num(n) },
  { key: 'pages_per_session', label: 'Páginas por visita',    fmt: n => dec(n) },
  { key: 'bounce_rate',       label: 'Rebote',                fmt: n => `${dec(n, 0)} %` },
  { key: 'avg_session_s',     label: 'Duración de la visita', fmt: n => dur(n) },
  { key: 'avg_engaged_s',     label: 'Tiempo por página',     fmt: n => dur(n) },
];

// Sub-views of the tabbed cards: card → [key, label][].
const SUBVIEWS = {
  paths: [['entries', 'Entrada'], ['exits', 'Salida']],
  tech:  [['device', 'Dispositivo'], ['browser', 'Navegador'], ['os', 'Sistema']],
  geo:   [['tz', 'Zona horaria'], ['lang', 'Idioma']],
};

let _range   = '30d';
let _metric  = 'v';                    // chart series: 'v' visitors | 'pv' pageviews
let _sub     = { paths: 'entries', tech: 'device', geo: 'tz' };
let _data    = null;
let _seq     = 0;                      // drops responses from a superseded range
let _wired   = false;
let _liveTimer = null;
let _resizeObs = null;

const _nf  = new Intl.NumberFormat('es');
const num  = (n) => _nf.format(Number(n) || 0);
const dec  = (n, digits = 1) => new Intl.NumberFormat('es', { maximumFractionDigits: digits }).format(Number(n) || 0);

function dur(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const cleanTitle = (t) => (t || '').replace(TITLE_SUFFIX, '').trim();
const isSitePath = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');

let _langNames = null;
function langLabel(code) {
  if (!code) return 'Desconocido';
  try {
    _langNames ||= new Intl.DisplayNames(['es'], { type: 'language' });
    const name = _langNames.of(code);
    return name ? name[0].toUpperCase() + name.slice(1) : code;
  } catch { return code; }
}
const tzLabel = (tz) => (tz ? tz.split('/').pop().replace(/_/g, ' ') : 'Desconocida');

// 'YYYY-MM-DDTHH:MI' in the viewer's zone (the RPC formats it that way).
function parseBucket(t) {
  const [d, hm] = t.split('T');
  const [y, mo, day] = d.split('-').map(Number);
  const [h] = (hm || '00:00').split(':').map(Number);
  return new Date(y, mo - 1, day, h);
}
function bucketLabel(t, bucket, long = false) {
  const d = parseBucket(t);
  if (bucket === 'hour')  return long ? `${DAYS_S[d.getDay()]} ${d.getDate()} ${MONTHS_S[d.getMonth()]}, ${d.getHours()}:00` : `${d.getHours()} h`;
  if (bucket === 'month') return `${MONTHS_S[d.getMonth()]} ${d.getFullYear()}`;
  return long ? `${DAYS_S[d.getDay()]} ${d.getDate()} ${MONTHS_S[d.getMonth()]} ${d.getFullYear()}` : `${d.getDate()} ${MONTHS_S[d.getMonth()]}`;
}

// ── Entry point ─────────────────────────────────────────────────────────────
export function loadSiteAnalytics() {
  const root = document.getElementById('analyticsRoot');
  if (!root) return;
  if (!_wired) {
    renderShell(root);
    wire(root);
    _wired = true;
  }
  refresh();
  startLive();
}

function renderShell(root) {
  render(root, html`
    <div class="action-bar">
      <div>
        <h2>Analíticas del sitio</h2>
        <p class="action-bar__hint">Visitas a irdlex.org · sin cookies ni datos personales</p>
      </div>
      <div class="anl-controls">
        <span class="anl-live" id="anlLive" aria-live="polite"></span>
        <label class="sr-only" for="anlRange">Periodo</label>
        <select id="anlRange" class="anl-select">
          ${RANGES.map(r => html`<option value="${r.key}" ${r.key === _range ? 'selected' : ''}>${r.label}</option>`)}
        </select>
        <button type="button" class="btn btn--ghost anl-iconbtn" data-anl="refresh" aria-label="Actualizar" title="Actualizar">
          <i class="fas fa-rotate"></i>
        </button>
        <button type="button" class="btn btn--ghost" data-anl="options" aria-expanded="false" aria-controls="anlOptions">
          <i class="fas fa-sliders"></i> Opciones
        </button>
      </div>
    </div>
    <div class="anl-options" id="anlOptions" hidden></div>
    <div id="anlBody"></div>
  `);
}

function wire(root) {
  root.addEventListener('change', (e) => {
    if (e.target.id === 'anlRange') { _range = e.target.value; refresh(); }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-anl]');
    if (!btn) return;
    const action = btn.dataset.anl;

    if (action === 'refresh') { refresh(); pollLive(); }

    if (action === 'options') {
      const panel = document.getElementById('anlOptions');
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.classList.toggle('is-active', open);
      if (open) renderOptions();
    }

    if (action === 'optout') {
      const next = !isOptedOut();
      if (!setOptedOut(next)) { toast('No se pudo guardar la preferencia en este navegador.', 'error'); return; }
      renderOptions();
      toast(next ? 'Este navegador ya no se contará en las analíticas.' : 'Este navegador vuelve a contarse.', 'success');
    }

    if (action === 'metric') {
      _metric = btn.dataset.metric;
      root.querySelectorAll('[data-anl="metric"]').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      drawChart();
    }

    if (action === 'table') {
      const table = document.getElementById('anlSeriesTable');
      const open = table.hidden;
      table.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Ocultar tabla' : 'Ver tabla';
    }

    if (action === 'sub') {
      const card = btn.dataset.card;
      _sub[card] = btn.dataset.view;
      btn.closest('.anl-seg').querySelectorAll('button').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      render(document.getElementById(`anlSub-${card}`), subList(card));
    }
  });
}

function renderOptions() {
  const out = isOptedOut();
  render(document.getElementById('anlOptions'), html`
    <div class="anl-options__row">
      <div>
        <strong>Excluir este navegador</strong>
        <p>${out
          ? 'Las visitas que hagas al sitio desde este navegador no se cuentan.'
          : 'Úsalo en los equipos del personal para que sus visitas no inflen los números.'}</p>
      </div>
      <button type="button" class="btn ${out ? 'btn--ghost' : 'btn--primary'}" data-anl="optout">
        ${out ? 'Volver a contarme' : 'Excluir este navegador'}
      </button>
    </div>
    <div class="anl-options__note">
      <strong>Cómo se mide</strong>
      <p>Sin cookies: cada visitante se identifica con una huella anónima que cambia cada día, así que
      «Visitantes» en un periodo de varios días suma los visitantes únicos de cada día. Una visita termina tras
      30 minutos sin actividad. «Rebote» es el porcentaje de visitas que vieron una sola página. El tiempo por
      página cuenta solo mientras la pestaña está visible. Los robots conocidos se descartan.</p>
    </div>
  `);
}

// ── Data ────────────────────────────────────────────────────────────────────
async function refresh() {
  const body = document.getElementById('anlBody');
  const seq = ++_seq;
  if (!_data) render(body, loadingHtml());
  else body.classList.add('is-busy');

  const { data, error } = await fetchSummary(_range);
  if (seq !== _seq) return;
  body.classList.remove('is-busy');

  if (error) {
    _data = null;
    render(body, errorHtml(error, { prefix: 'No se pudieron cargar las analíticas' }));
    return;
  }
  _data = data;
  renderBody(body, data);
}

function startLive() {
  if (_liveTimer) return;
  pollLive();
  _liveTimer = setInterval(() => {
    const open = document.getElementById('tab-analytics')?.classList.contains('active');
    if (!open) { clearInterval(_liveTimer); _liveTimer = null; return; }
    if (document.visibilityState === 'visible') pollLive();
  }, LIVE_POLL_MS);
}

async function pollLive() {
  const pill = document.getElementById('anlLive');
  if (!pill) return;
  const { data, error } = await fetchLive();
  if (error || !data) { render(pill, ''); return; }
  const n = data.visitors || 0;
  const pages = (data.pages || []).map(p => `${p.path} (${p.n})`).join(', ');
  pill.title = n ? `Últimos 5 minutos: ${pages}` : 'Nadie en los últimos 5 minutos';
  render(pill, html`<span class="anl-live__dot ${n ? 'is-on' : ''}" aria-hidden="true"></span>
    ${num(n)} ${n === 1 ? 'persona' : 'personas'} ahora`);
}

// ── Body ────────────────────────────────────────────────────────────────────
function renderBody(body, d) {
  const t = d.totals || {};
  if (!t.pageviews && !(d.events || []).length && !(d.not_found || []).length) {
    render(body, emptyHtml('fa-chart-line',
      'Aún no hay visitas registradas en este periodo. Los datos aparecen en cuanto alguien visita el sitio publicado.'));
    return;
  }

  render(body, html`
    <section class="anl-kpis" aria-label="Resumen">
      ${KPIS.map(k => kpi(k, t[k.key], d.previous?.[k.key]))}
    </section>

    <section class="anl-card anl-card--wide">
      <header class="anl-card__head">
        <h3>Tráfico en el tiempo</h3>
        <div class="anl-seg" role="group" aria-label="Métrica del gráfico">
          <button type="button" data-anl="metric" data-metric="v"  class="${_metric === 'v' ? 'active' : ''}"  aria-pressed="${_metric === 'v'}">Visitantes</button>
          <button type="button" data-anl="metric" data-metric="pv" class="${_metric === 'pv' ? 'active' : ''}" aria-pressed="${_metric === 'pv'}">Vistas</button>
        </div>
      </header>
      <div class="anl-chart" id="anlChart"></div>
      <button type="button" class="anl-linkbtn" data-anl="table" aria-expanded="false" aria-controls="anlSeriesTable">Ver tabla</button>
      <div id="anlSeriesTable" hidden>${seriesTable(d)}</div>
    </section>

    <div class="anl-grid">
      ${card('Páginas más visitadas', pagesList(d.pages || []), { wide: true })}
      ${card('Fuentes de tráfico', sourcesList(d))}
      ${tabbedCard('paths', 'Páginas de entrada y salida')}
      ${card('Interacciones y conversiones', eventsList(d.events || []))}
      ${tabbedCard('tech', 'Dispositivos y tecnología')}
      ${tabbedCard('geo', 'Ubicación e idioma')}
      ${(d.not_found || []).length ? card('Páginas no encontradas (404)', notFoundList(d.not_found)) : ''}
      ${card('Actividad por día y hora', heatmap(d.heatmap || []), { wide: true })}
    </div>
  `);

  drawChart();
  observeResize();
}

function kpi(k, cur, prev) {
  let delta = html`<span class="anl-kpi__delta">—</span>`;
  const c = Number(cur) || 0, p = Number(prev) || 0;
  if (p > 0) {
    const change = ((c - p) / p) * 100;
    const rounded = Math.round(change);
    const dir = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
    delta = html`<span class="anl-kpi__delta anl-kpi__delta--${dir}"
      title="Periodo anterior: ${k.fmt(p)}">${arrow} ${Math.abs(rounded)} %</span>`;
  }
  return html`
    <div class="anl-kpi">
      <span class="anl-kpi__label">${k.label}</span>
      <span class="anl-kpi__num">${cur == null ? '—' : k.fmt(cur)}</span>
      ${delta}
    </div>`;
}

function card(title, content, { wide = false } = {}) {
  return html`
    <section class="anl-card ${wide ? 'anl-card--wide' : ''}">
      <header class="anl-card__head"><h3>${title}</h3></header>
      ${content}
    </section>`;
}

function tabbedCard(key, title) {
  return html`
    <section class="anl-card">
      <header class="anl-card__head">
        <h3>${title}</h3>
        <div class="anl-seg" role="group" aria-label="${title}">
          ${SUBVIEWS[key].map(([view, label]) => html`
            <button type="button" data-anl="sub" data-card="${key}" data-view="${view}"
              class="${_sub[key] === view ? 'active' : ''}" aria-pressed="${_sub[key] === view}">${label}</button>`)}
        </div>
      </header>
      <div id="anlSub-${key}">${subList(key)}</div>
    </section>`;
}

function subList(key) {
  const d = _data || {};
  const view = _sub[key];
  if (key === 'paths') {
    const rows = d[view] || [];
    return barList(rows, {
      label: r => pathLink(r.path),
      value: r => r.sessions,
      meta:  r => (view === 'entries' ? `Rebote ${dec(r.bounce_rate, 0)} %` : ''),
      unit:  'visitas',
    });
  }
  const rows = (d.dims?.[view]) || [];
  const fmt = {
    device:  k => DEVICE_LABELS[k] || 'Desconocido',
    browser: k => k || 'Desconocido',
    os:      k => k || 'Desconocido',
    tz:      k => tzLabel(k),
    lang:    k => langLabel(k),
  }[view];
  const total = rows.reduce((s, r) => s + (Number(r.v) || 0), 0);
  return barList(rows, {
    label: r => html`<span title="${view === 'tz' ? r.k || '' : ''}">${fmt(r.k)}</span>`,
    value: r => r.v,
    meta:  r => (total ? `${dec((r.v / total) * 100, 0)} %` : ''),
    unit:  'visitantes',
  });
}

// Ranked rows with an in-row bar scaled to the top value.
function barList(rows, { label, value, meta, unit }) {
  if (!rows.length) return html`<p class="anl-none">Sin datos en este periodo.</p>`;
  const max = Math.max(...rows.map(r => Number(value(r)) || 0), 1);
  return html`
    <ol class="anl-list">
      ${rows.map(r => {
        const v = Number(value(r)) || 0;
        const m = meta ? meta(r) : '';
        return html`
          <li class="anl-row" style="--w:${((v / max) * 100).toFixed(1)}%">
            <span class="anl-row__main">
              <span class="anl-row__label">${label(r)}</span>
              ${m ? html`<span class="anl-row__meta">${m}</span>` : ''}
            </span>
            <span class="anl-row__value" aria-label="${num(v)} ${unit}">${num(v)}</span>
          </li>`;
      })}
    </ol>`;
}

function pathLink(path) {
  if (!isSitePath(path)) return path || '—';
  return html`<a href="${SITE}${path}" target="_blank" rel="noopener">${path}</a>`;
}

function pagesList(pages) {
  return barList(pages, {
    label: r => html`${cleanTitle(r.title) || r.path}`,
    value: r => r.views,
    meta:  r => html`${pathLink(r.path)} · ${num(r.visitors)} visitantes${
      r.avg_engaged_s != null ? ` · ${dur(r.avg_engaged_s)}` : ''}${
      r.avg_scroll != null ? ` · ${dec(r.avg_scroll, 0)} % leído` : ''}`,
    unit: 'vistas',
  });
}

function sourcesList(d) {
  const sources = barList(d.sources || [], {
    label: r => r.source || 'Directo / desconocido',
    value: r => r.sessions,
    meta:  r => `${num(r.visitors)} visitantes · rebote ${dec(r.bounce_rate, 0)} %`,
    unit:  'visitas',
  });
  const camps = d.campaigns || [];
  if (!camps.length) return sources;
  return html`${sources}
    <h4 class="anl-subhead">Campañas (UTM)</h4>
    ${barList(camps, {
      label: r => r.campaign,
      value: r => r.sessions,
      meta:  r => [r.source, r.medium].filter(Boolean).join(' / '),
      unit:  'visitas',
    })}`;
}

function eventsList(events) {
  if (!events.length) {
    return html`<p class="anl-none">Sin interacciones en este periodo. Aquí aparecen inscripciones,
      formularios enviados y clics en llamar, WhatsApp, cómo llegar y enlaces externos.</p>`;
  }
  // Conversions first, then clicks; each group keeps the RPC's count order.
  const sorted = [...events].sort((a, b) => CONVERSIONS.has(b.name) - CONVERSIONS.has(a.name));
  return barList(sorted, {
    label: r => html`${CONVERSIONS.has(r.name) ? html`<i class="fas fa-flag-checkered anl-conv" title="Conversión" aria-label="Conversión"></i> ` : ''}${EVENT_LABELS[r.name] || r.name}`,
    value: r => r.count,
    meta:  r => [r.label, `${num(r.visitors)} visitantes`].filter(Boolean).join(' · '),
    unit:  'veces',
  });
}

function notFoundList(rows) {
  return barList(rows, {
    label: r => r.path,
    value: r => r.hits,
    meta:  r => (r.referrer ? `Desde ${r.referrer}` : ''),
    unit:  'visitas',
  });
}

// ── Heatmap: weekday × hour, single-hue intensity ──────────────────────────
function heatmap(cells) {
  if (!cells.length) return html`<p class="anl-none">Sin datos en este periodo.</p>`;
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  cells.forEach(c => { if (grid[c.d]) grid[c.d][c.h] = Number(c.n) || 0; });
  const max = Math.max(...grid.flat(), 1);

  let peak = { d: 0, h: 0, n: -1 };
  grid.forEach((row, di) => row.forEach((n, h) => { if (n > peak.n) peak = { d: di, h, n }; }));

  // Monday-first reads more naturally for a Spanish-speaking audience.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const hourLabel = (h) => (h % 3 === 0 ? `${h}` : '');

  return html`
    <p class="anl-heat__peak">Hora con más actividad: <strong>${DAYS_S[peak.d]} a las ${peak.h}:00</strong>
      (${num(peak.n)} vistas).</p>
    <div class="anl-heat" role="table" aria-label="Vistas de página por día de la semana y hora">
      <div class="anl-heat__row" role="row">
        <span class="anl-heat__day" role="columnheader"></span>
        ${grid[0].map((_, h) => html`<span class="anl-heat__hour" role="columnheader">${hourLabel(h)}</span>`)}
      </div>
      ${order.map(di => html`
        <div class="anl-heat__row" role="row">
          <span class="anl-heat__day" role="rowheader">${DAYS_S[di]}</span>
          ${grid[di].map((n, h) => html`<span class="anl-heat__cell" role="cell"
              style="--a:${n ? Math.max(8, Math.round((n / max) * 100)) : 0}%"
              title="${DAYS_S[di]} ${h}:00 · ${num(n)} vistas"
              aria-label="${DAYS_S[di]} ${h}:00, ${num(n)} vistas"></span>`)}
        </div>`)}
    </div>
    <div class="anl-heat__legend" aria-hidden="true">
      <span>Menos</span>
      ${[0, 25, 50, 75, 100].map(a => html`<span class="anl-heat__cell" style="--a:${Math.max(a, 8)}%"></span>`)}
      <span>Más</span>
    </div>`;
}

// ── Time-series chart ───────────────────────────────────────────────────────
function seriesTable(d) {
  const rows = d.series || [];
  return html`
    <table class="anl-table">
      <thead><tr><th scope="col">Periodo</th><th scope="col">Visitantes</th><th scope="col">Vistas</th></tr></thead>
      <tbody>
        ${rows.map(r => html`<tr>
          <td data-label="Periodo">${bucketLabel(r.t, d.bucket, true)}</td>
          <td data-label="Visitantes">${num(r.v)}</td>
          <td data-label="Vistas">${num(r.pv)}</td>
        </tr>`)}
      </tbody>
    </table>`;
}

// Smallest "round" axis top with four equal gridline steps.
function niceMax(v) {
  if (v <= 4) return 4;
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 4, 5, 10].find(s => s * mag >= raw) * mag;
  return step * 4;
}

function drawChart() {
  const host = document.getElementById('anlChart');
  if (!host || !_data) return;
  const series = _data.series || [];
  const bucket = _data.bucket;
  const W = Math.max(host.clientWidth, 280);
  const H = W < 520 ? 200 : 240;
  const m = { t: 12, r: 12, b: 26, l: 40 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = series.map(s => Number(s[_metric]) || 0);
  const yMax = niceMax(Math.max(...vals, 0));
  const n = series.length;
  const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => m.t + ih - (v / yMax) * ih;

  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';

  const ticks = [0, 1, 2, 3, 4].map(k => (yMax / 4) * k);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const metricName = _metric === 'v' ? 'Visitantes' : 'Vistas';

  // Unchanged markup → the existing SVG keeps its listeners; don't double-wire.
  const changed = render(host, html`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="anl-svg" tabindex="0" role="img"
      aria-label="${metricName} por ${bucket === 'hour' ? 'hora' : bucket === 'month' ? 'mes' : 'día'}. Usa las flechas para recorrer los valores.">
      ${ticks.map(v => html`
        <line class="anl-grid-line" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"></line>
        <text class="anl-axis" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`)}
      ${series.map((s, i) => (i % labelEvery === 0
        ? html`<text class="anl-axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${bucketLabel(s.t, bucket)}</text>`
        : ''))}
      <path class="anl-area" d="${area}"></path>
      <path class="anl-line" d="${line}"></path>
      <line class="anl-cross" id="anlCross" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"></line>
      <circle class="anl-dot" id="anlDot" r="5" visibility="hidden"></circle>
    </svg>
    <div class="anl-tip" id="anlTip" hidden></div>
  `);
  if (!changed) return;

  const svg = host.querySelector('svg');
  const cross = host.querySelector('#anlCross');
  const dot = host.querySelector('#anlDot');
  const tip = host.querySelector('#anlTip');
  let active = -1;

  const show = (i) => {
    if (i < 0 || i >= n) return;
    active = i;
    const s = series[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i]));
    dot.setAttribute('visibility', 'visible');
    render(tip, html`<strong>${bucketLabel(s.t, bucket, true)}</strong>
      <span>Visitantes: ${num(s.v)}</span><span>Vistas: ${num(s.pv)}</span>`);
    tip.hidden = false;
    const tipW = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(x(i) - tipW / 2, 0), W - tipW)}px`;
    tip.style.top = `${Math.max(y(vals[i]) - tip.offsetHeight - 12, 0)}px`;
  };
  const hide = () => {
    active = -1;
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  const indexAt = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    return n <= 1 ? 0 : Math.round(((px - m.l) / iw) * (n - 1));
  };

  svg.addEventListener('pointermove', (e) => show(Math.min(n - 1, Math.max(0, indexAt(e.clientX)))));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(active < 0 ? 0 : Math.min(n - 1, active + 1)); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); show(active < 0 ? n - 1 : Math.max(0, active - 1)); }
    if (e.key === 'Escape') hide();
  });
}

// Redraw the chart when its width changes (sidebar drawer, rotation, resize).
function observeResize() {
  const host = document.getElementById('anlChart');
  if (!host || typeof ResizeObserver === 'undefined') return;
  _resizeObs?.disconnect();
  let lastW = host.clientWidth;
  let raf = 0;
  _resizeObs = new ResizeObserver(() => {
    if (host.clientWidth === lastW) return;
    lastW = host.clientWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawChart);
  });
  _resizeObs.observe(host);
}
