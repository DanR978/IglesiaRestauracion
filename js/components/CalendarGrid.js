// js/components/CalendarGrid.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared calendar grid — renders the same HTML + CSS classes whether on the
// public calendar page OR inside the admin panel.
//
// Usage:
//   const grid = new CalendarGrid({
//     weekdaysEl:   'calWeekdays',     // element ID for weekday headers
//     daysEl:       'calDays',         // element ID for day cells
//     labelEl:      'calNavLabel',     // element ID for "Marzo 2026" label
//     daySheetId:   'calDaySheet',     // element ID for mobile bottom-sheet
//     mode:         'public',          // 'public' | 'admin'
//     onEventClick: (ev) => {},        // regular event clicked → open modal
//     onEventEdit:  (ev) => {},        // admin: edit button (optional)
//     onEventCancel:(ev) => {},        // admin: cancel button (optional)
//     onEventDelete:(ev) => {},        // admin: delete button (optional)
//   });
//   grid.render(year, month, events);  // events = flat sorted array
// ─────────────────────────────────────────────────────────────────────────────

const DAYS_S    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DAYS_L    = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const pad       = n => String(n).padStart(2, '0');
const ymd       = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayYMD  = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };

const CATS = {
  servicio:       { pill: 'cat--servicio',       dot: 'dot--servicio'       },
  estudio:        { pill: 'cat--estudio',         dot: 'dot--estudio'        },
  oracion:        { pill: 'cat--oracion',         dot: 'dot--oracion'        },
  evangelizacion: { pill: 'cat--evangelizacion',  dot: 'dot--evangelizacion' },
  especial:       { pill: 'cat--especial',        dot: 'dot--especial'       },
  otro:           { pill: 'cat--otro',            dot: 'dot--otro'           },
};
const getCat = c => CATS[c] || CATS.otro;

export class CalendarGrid {
  constructor(config) {
    this.cfg   = config;
    this._idx  = {};          // { 'YYYY-MM-DD': [ev, ...] }
    this._evs  = [];          // flat event list for lookup
    this._year  = new Date().getFullYear();
    this._month = new Date().getMonth();
    this._initDaySheet();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────
  render(year, month, events) {
    this._year  = year;
    this._month = month;
    this._evs   = events;
    this._buildIndex(events);
    this._renderLabel(year, month);
    this._renderWeekdays();
    this._renderDays(year, month);
  }

  // ─── Label ───────────────────────────────────────────────────────────────────
  _renderLabel(y, m) {
    const el = document.getElementById(this.cfg.labelEl);
    if (el) el.textContent = `${MONTHS[m]} ${y}`;
  }

  // ─── Weekdays ────────────────────────────────────────────────────────────────
  _renderWeekdays() {
    const el = document.getElementById(this.cfg.weekdaysEl);
    if (!el) return;
    el.innerHTML = DAYS_S.map(d => `<div class="cal-grid__weekday">${d}</div>`).join('');
  }

  // ─── Build date → events index ───────────────────────────────────────────────
  _buildIndex(events) {
    this._idx = {};
    for (const ev of events) {
      if (!ev.date) continue;
      (this._idx[ev.date] = this._idx[ev.date] || []).push(ev);
    }
  }

  // ─── Day cells ───────────────────────────────────────────────────────────────
  _renderDays(year, month) {
    const el = document.getElementById(this.cfg.daysEl);
    if (!el) return;

    const today       = todayYMD();
    const firstDow    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const isAdmin     = this.cfg.mode === 'admin';

    let html = '';
    for (let i = 0; i < firstDow; i++) html += `<div class="cal-day cal-day--empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const ds  = ymd(year, month, d);
      const evs = this._idx[ds] || [];
      const cls = ['cal-day',
        ds === today ? 'cal-day--today' : '',
        ds < today   ? 'cal-day--past'  : '',
        evs.length   ? 'cal-day--has-events' : '',
        isAdmin      ? 'cal-day--admin' : '',
      ].filter(Boolean).join(' ');

      // Desktop: up to 2 pills (admin gets action buttons on hover)
      const REPETITIVE_CATS = ['servicio', 'estudio', 'oracion'];
      const pills = evs.slice(0, 2).map(ev => {
        const cat = getCat(ev.category);
        const cc  = ev.cancelled ? ' cal-event-pill--cancelled' : '';
        const isSpecialEv = ev._source === 'evt' || ev.fromEventsTable;
        const rawEvId = ev.id.replace('evt-', '');
        const safeTitle = (ev.title||'').replace(/'/g, "\\'");
        const canCancel = REPETITIVE_CATS.includes(ev.category);

        const editClick   = isSpecialEv
          ? `window.__adminEditSpecial('${rawEvId}')`
          : `window.__gridEdit('${ev.id}')`;
        const deleteClick = isSpecialEv
          ? `window.__adminDeleteEvent('${ev.id}','${safeTitle}',true)`
          : `window.__gridDelete('${ev.id}','${safeTitle}')`;

        const adminActions = isAdmin ? `
          <span class="cal-ev__actions">
            <button class="cal-ev__btn cal-ev__btn--edit"
              onclick="event.stopPropagation();${editClick}"
              title="Editar">✏</button>
            ${canCancel ? `<button class="cal-ev__btn ${ev.cancelled ? 'cal-ev__btn--undo' : 'cal-ev__btn--cancel'}"
              onclick="event.stopPropagation();window.__gridToggle('${ev.id}',${ev.cancelled})"
              title="${ev.cancelled ? 'Reactivar' : 'Cancelar'}">${ev.cancelled ? '↩' : '⊘'}</button>` : ''}
            <button class="cal-ev__btn cal-ev__btn--delete"
              onclick="event.stopPropagation();${deleteClick}"
              title="Eliminar">✕</button>
          </span>` : '';
        return `<div class="cal-event-pill ${cat.pill}${cc}" data-id="${ev.id}">
          <span class="cal-ev__label">${ev.title}</span>${adminActions}
        </div>`;
      }).join('');

      const more = evs.length > 2 ? `<div class="cal-day__more">+${evs.length - 2} más</div>` : '';

      // Mobile: colored dots
      const dots = evs.slice(0, 4).map(ev =>
        `<span class="cal-day__dot-single ${getCat(ev.category).dot}${ev.cancelled ? ' cal-day__dot-single--cancelled' : ''}"></span>`
      ).join('');

      html += `
        <div class="${cls}" data-date="${ds}">
          <div class="cal-day__num">${d}</div>
          <div class="cal-day__events">${pills}${more}</div>
          <div class="cal-day__dot-row">${dots}</div>
        </div>`;
    }

    el.innerHTML = html;

    // Wire cell clicks
    el.querySelectorAll('.cal-day--has-events').forEach(cell => {
      cell.addEventListener('click', e => {
        // Pill click on desktop
        const pill = e.target.closest('[data-id]');
        if (pill && !e.target.closest('.cal-ev__actions')) {
          const ev = this._evs.find(x => x.id === pill.dataset.id);
          if (ev) { this._handleEventClick(ev); return; }
        }
        // Cell click (or mobile tap) → day sheet
        const evs = this._idx[cell.dataset.date] || [];
        if (evs.length === 1 && !isAdmin) {
          // Single event on public: go straight to action
          this._handleEventClick(evs[0]);
        } else if (evs.length) {
          this._openDaySheet(cell.dataset.date, evs);
        }
      });
    });

    // Wire admin window callbacks
    if (isAdmin) {
      window.__gridEdit   = id => this.cfg.onEventEdit?.(this._evs.find(e => e.id === id));
      window.__gridToggle = (id, c) => this.cfg.onEventCancel?.(this._evs.find(e => e.id === id), c);
      window.__gridDelete = (id, title) => this.cfg.onEventDelete?.(this._evs.find(e => e.id === id), title);
    }
  }

  _handleEventClick(ev) {
    const isAdmin = this.cfg.mode === 'admin';
    if (isAdmin) {
      // In admin, clicking any event opens edit
      this.cfg.onEventEdit?.(ev);
    } else if (ev._source === 'evt' || ev.fromEventsTable) {
      const rawId = ev.id.replace('evt-', '');
      window.location.href = `/eventos/evento.html?id=${rawId}`;
    } else {
      this.cfg.onEventClick?.(ev);
    }
  }

  // ─── Day sheet (mobile bottom drawer) ────────────────────────────────────────
  _initDaySheet() {
    // Create the sheet if it doesn't exist in the DOM yet
    if (!document.getElementById('calDaySheet')) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="day-sheet-backdrop" id="calDaySheetBackdrop">
          <div class="day-sheet" id="calDaySheet">
            <div class="day-sheet__handle"></div>
            <div class="day-sheet__date" id="calDaySheetDate"></div>
            <div id="calDaySheetEvents"></div>
          </div>
        </div>`;
      document.body.appendChild(el.firstElementChild);
    }
    document.getElementById('calDaySheetBackdrop')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeDaySheet();
    });
  }

  _openDaySheet(dateStr, evs) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = DAYS_L[new Date(y, m - 1, d).getDay()];

    document.getElementById('calDaySheetDate').textContent =
      `${dow}, ${d} de ${MONTHS[m - 1]} ${y}`;

    const isAdmin = this.cfg.mode === 'admin';

    document.getElementById('calDaySheetEvents').innerHTML = evs.map(ev => {
      const isSpecial   = ev._source === 'evt' || ev.fromEventsTable;
      const isCancelled = ev.cancelled;
      const cat         = getCat(ev.category);
      const rawId       = ev.id.replace('evt-', '');

      const titleEl = `<div class="day-sheet__ev-title${isCancelled ? ' day-sheet__ev-title--cancelled' : ''}">
        ${ev.title}
        ${isCancelled ? '<span class="day-sheet__ev-cancelled-badge">Cancelado</span>' : ''}
      </div>`;
      const metaEl  = `<div class="day-sheet__ev-time">${ev.time || ''}</div>`;

      const imgEl   = isSpecial && ev.image_url
        ? `<img class="day-sheet__ev-thumb" src="${ev.image_url}" alt="" loading="lazy">`
        : `<span class="day-sheet__ev-dot ${cat.dot}"></span>`;

      // Repetitive categories that support cancel/reactivate
      const REPETITIVE = ['servicio', 'estudio', 'oracion'];
      const canCancel = REPETITIVE.includes(ev.category);

      // Right side: admin → action buttons for ALL events; public special → link; public regular → chevron
      let rightEl;
      if (isAdmin) {
        const editAction   = isSpecial ? `window.__adminEditSpecial('${rawId}')` : `window.__gridEdit('${ev.id}')`;
        const deleteAction = isSpecial
          ? `window.__adminDeleteEvent('${ev.id}','${(ev.title||'').replace(/'/g,"\\'")}',true)`
          : `window.__gridDelete('${ev.id}','${(ev.title||'').replace(/'/g,"\\'")}')`;

        rightEl = `<div class="day-sheet__ev-actions">
          <button class="icon-btn" onclick="event.stopPropagation();${editAction};window.__closeDaySheet()" title="Editar"><i class="fas fa-pen"></i></button>
          ${canCancel ? `<button class="icon-btn ${isCancelled ? 'success' : 'warn'}"
            onclick="event.stopPropagation();${isSpecial ? `window.__adminToggleCancel('${ev.id}',${isCancelled})` : `window.__gridToggle('${ev.id}',${isCancelled})`};window.__closeDaySheet()"
            title="${isCancelled ? 'Reactivar' : 'Cancelar'}">
            <i class="fas fa-${isCancelled ? 'undo' : 'ban'}"></i>
          </button>` : ''}
          <button class="icon-btn danger" onclick="event.stopPropagation();${deleteAction};window.__closeDaySheet()" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>`;
      } else if (isSpecial) {
        rightEl = `<a class="day-sheet__ev-link" href="/eventos/evento.html?id=${rawId}">
          Ver detalles <i class="fas fa-chevron-right" style="font-size:.7rem"></i>
        </a>`;
      } else {
        rightEl = `<i class="fas fa-chevron-right day-sheet__ev-chevron"></i>`;
      }

      const clickable = !isSpecial && !isAdmin ? `data-ev-id="${ev.id}" style="cursor:pointer"` : '';
      return `
        <div class="day-sheet__ev${isCancelled ? ' day-sheet__ev--cancelled' : ''}" ${clickable}>
          ${imgEl}
          <div class="day-sheet__ev-info">${titleEl}${metaEl}</div>
          ${rightEl}
        </div>`;
    }).join('');

    // Wire public row taps → modal
    if (!isAdmin) {
      document.getElementById('calDaySheetEvents').querySelectorAll('[data-ev-id]').forEach(row => {
        row.addEventListener('click', () => {
          const ev = this._evs.find(x => x.id === row.dataset.evId);
          if (ev) { this._closeDaySheet(); this.cfg.onEventClick?.(ev); }
        });
      });
    }

    window.__closeDaySheet = () => this._closeDaySheet();
    document.getElementById('calDaySheetBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  _closeDaySheet() {
    document.getElementById('calDaySheetBackdrop')?.classList.remove('open');
    document.body.style.overflow = '';
  }
}