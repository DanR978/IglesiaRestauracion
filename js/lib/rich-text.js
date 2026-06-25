// js/lib/rich-text.js
// Lightweight, dependency-free rich-text editor for the admin panel, styled
// after the Microsoft Teams compose box: a clean writing surface with a
// formatting toolbar that stays hidden until you click the "Formato" toggle.
//
// • mountRichText(container, opts)   → mount into an empty element, returns API.
// • enhanceTextarea(textarea, opts)  → progressively upgrade an existing
//   <textarea> in place. The textarea stays in the DOM as the value carrier and
//   its `.value` / `.readOnly` are kept transparently in sync, so existing save
//   logic (which reads `el.value`) and behaviours (presets toggling readOnly)
//   keep working untouched.
//
// All output — including pasted content — is run through the allowlist
// sanitizer, so what callers store and what the public site renders is safe.
//
// Uses document.execCommand: deprecated but universally supported and the right
// fit for a small internal tool with no build-time dependencies.

import { sanitizeHtml, htmlIsEmpty } from '/js/lib/sanitize-html.js';

// On-brand text colors (teal, gold, orange, red, green, ink).
const SWATCHES = ['#0e2d38', '#9a6a2c', '#be660e', '#dc2626', '#16a34a', '#394548'];

const escAttr = (s) => String(s ?? '').replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
const tbtn = (cmd, icon, title) =>
  `<button type="button" class="rt-btn" data-cmd="${cmd}" title="${escAttr(title)}" aria-label="${escAttr(title)}"><i class="fas fa-${icon}" aria-hidden="true"></i></button>`;

// Commands whose on/off state we reflect in the toolbar.
const STATEFUL = [
  ['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'],
  ['strikeThrough', 'strikethrough'],
  ['insertUnorderedList', 'list-ul'], ['insertOrderedList', 'list-ol'],
];

/**
 * Mount an editor into `container` (its contents are replaced).
 * @returns {{ getHtml():string, setHtml(h:string):void, focus():void,
 *             setEditable(on:boolean):void, onChange(fn:()=>void):void }}
 */
export function mountRichText(container, { placeholder = '' } = {}) {
  container.classList.add('rt');
  container.innerHTML = `
    <div class="rt-toolbar" role="toolbar" aria-label="Formato de texto" hidden>
      <div class="rt-grp">
        ${tbtn('bold', 'bold', 'Negrita (Ctrl+B)')}
        ${tbtn('italic', 'italic', 'Cursiva (Ctrl+I)')}
        ${tbtn('underline', 'underline', 'Subrayado (Ctrl+U)')}
        ${tbtn('strikeThrough', 'strikethrough', 'Tachado')}
      </div>
      <span class="rt-sep"></span>
      <div class="rt-grp rt-color">
        <button type="button" class="rt-btn rt-color-btn" data-pop title="Color del texto" aria-label="Color del texto">
          <i class="fas fa-font" aria-hidden="true"></i><span class="rt-color-bar"></span>
        </button>
        <div class="rt-pop" hidden>
          <div class="rt-pop__swatches">
            ${SWATCHES.map(c => `<button type="button" class="rt-sw" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}
          </div>
          <label class="rt-pop__custom"><span>Personalizado</span><input type="color" class="rt-color-input" value="#0e2d38" aria-label="Color personalizado"></label>
        </div>
      </div>
      <span class="rt-sep"></span>
      <div class="rt-grp">
        ${tbtn('insertUnorderedList', 'list-ul', 'Lista con viñetas')}
        ${tbtn('insertOrderedList', 'list-ol', 'Lista numerada')}
      </div>
      <span class="rt-sep"></span>
      <div class="rt-grp">
        ${tbtn('createLink', 'link', 'Insertar enlace')}
        ${tbtn('removeFormat', 'eraser', 'Quitar formato')}
      </div>
    </div>
    <div class="rt-area" contenteditable="true" role="textbox" aria-multiline="true" data-ph="${escAttr(placeholder)}"></div>
    <div class="rt-foot">
      <button type="button" class="rt-toggle" aria-pressed="false" aria-label="Mostrar opciones de formato" title="Opciones de formato">
        <i class="fas fa-font" aria-hidden="true"></i><span>Formato</span>
      </button>
    </div>`;

  const q       = (sel) => container.querySelector(sel);
  const area    = q('.rt-area');
  const toolbar = q('.rt-toolbar');
  const toggle  = q('.rt-toggle');
  const pop     = q('.rt-pop');
  const colorBar = q('.rt-color-bar');
  let editable  = true;
  let changeFn  = null;

  try { document.execCommand('styleWithCSS', false, true); } catch {}
  setBar('#0e2d38');

  function setBar(c) { if (colorBar) colorBar.style.background = c; }
  function updatePh() { area.classList.toggle('rt-empty', !area.textContent.trim()); }
  function selectionInside() {
    const s = document.getSelection();
    return s && s.rangeCount && area.contains(s.anchorNode);
  }
  function syncActive() {
    if (!selectionInside()) return;
    for (const [cmd] of STATEFUL) {
      const btn = toolbar.querySelector(`.rt-btn[data-cmd="${cmd}"]`);
      if (!btn) continue;
      let on = false;
      try { on = document.queryCommandState(cmd); } catch {}
      btn.classList.toggle('is-active', on);
    }
  }
  function exec(cmd, arg) {
    if (!editable) return;
    area.focus();
    try { document.execCommand(cmd, false, arg); } catch {}
    updatePh(); syncActive(); changeFn?.();
  }

  // Pop-over (color) open/close
  const closePop = () => { pop.hidden = true; };
  const onDocClick = (e) => { if (!container.contains(e.target)) closePop(); };
  document.addEventListener('click', onDocClick);

  // Toggle the formatting bar (Teams-style hide/show)
  toggle.addEventListener('click', () => {
    const open = toolbar.hidden;
    toolbar.hidden = !open;
    toggle.setAttribute('aria-pressed', String(open));
    container.classList.toggle('rt--open', open);
    if (!open) closePop();
  });

  toolbar.addEventListener('click', (e) => {
    const sw = e.target.closest('.rt-sw');
    if (sw) { e.preventDefault(); exec('foreColor', sw.dataset.color); setBar(sw.dataset.color); closePop(); return; }
    if (e.target.closest('[data-pop]')) { e.preventDefault(); pop.hidden = !pop.hidden; return; }
    const btn = e.target.closest('.rt-btn');
    if (!btn || !btn.dataset.cmd) return;
    e.preventDefault();
    if (btn.dataset.cmd === 'createLink') {
      const url = window.prompt('Enlace (URL):', 'https://');
      if (url) exec('createLink', url.trim());
      return;
    }
    exec(btn.dataset.cmd);
  });

  q('.rt-color-input').addEventListener('input', (e) => { exec('foreColor', e.target.value); setBar(e.target.value); closePop(); });

  // Sanitize anything pasted in.
  area.addEventListener('paste', (e) => {
    e.preventDefault();
    const data = e.clipboardData || window.clipboardData;
    const htmlIn = data?.getData('text/html');
    const clean = htmlIn
      ? sanitizeHtml(htmlIn)
      : (data?.getData('text/plain') || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>');
    try { document.execCommand('insertHTML', false, clean); } catch {}
    updatePh(); changeFn?.();
  });

  area.addEventListener('input', () => { updatePh(); changeFn?.(); });
  document.addEventListener('selectionchange', () => { if (selectionInside()) syncActive(); });
  updatePh();

  return {
    getHtml: () => sanitizeHtml(area.innerHTML),
    setHtml: (h) => { area.innerHTML = sanitizeHtml(h || ''); updatePh(); },
    focus:   () => area.focus(),
    onChange: (fn) => { changeFn = fn; },
    setEditable: (on) => {
      editable = !!on;
      area.setAttribute('contenteditable', editable ? 'true' : 'false');
      container.classList.toggle('rt--readonly', !editable);
      toggle.disabled = !editable;
      if (!editable) { toolbar.hidden = true; toggle.setAttribute('aria-pressed', 'false'); container.classList.remove('rt--open'); closePop(); }
    },
  };
}

// ── Progressive enhancement of an existing <textarea> ────────────────────────
const VAL = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
const RO  = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'readOnly');

/**
 * Upgrade a textarea to a rich editor without changing any code that reads its
 * `.value` or sets `.value` / `.readOnly`. Returns the editor API (or null).
 */
export function enhanceTextarea(textarea, opts = {}) {
  if (!textarea || textarea.dataset.rtEnhanced) return null;
  try {
    textarea.dataset.rtEnhanced = '1';
    const wrap = document.createElement('div');
    textarea.insertAdjacentElement('afterend', wrap);
    textarea.hidden = true;                       // keep as value carrier, hide from view

    const editor = mountRichText(wrap, { placeholder: opts.placeholder || textarea.getAttribute('placeholder') || '' });
    editor.setHtml(VAL.get.call(textarea) || '');
    editor.setEditable(!(RO.get.call(textarea) || textarea.disabled));

    let syncing = false;
    editor.onChange(() => {
      const h = editor.getHtml();
      syncing = true;
      VAL.set.call(textarea, htmlIsEmpty(h) ? '' : h);   // write underlying value
      syncing = false;
    });

    // Intercept programmatic value / readOnly changes → reflect into the editor.
    Object.defineProperty(textarea, 'value', {
      configurable: true,
      get() { return VAL.get.call(this); },
      set(v) { VAL.set.call(this, v); if (!syncing) editor.setHtml(v); },
    });
    Object.defineProperty(textarea, 'readOnly', {
      configurable: true,
      get() { return RO.get.call(this); },
      set(v) { RO.set.call(this, v); editor.setEditable(!v); },
    });
    return editor;
  } catch (e) {
    console.error('[rich-text] enhanceTextarea failed:', e);
    textarea.hidden = false;                       // fail safe → keep the plain textarea
    return null;
  }
}
