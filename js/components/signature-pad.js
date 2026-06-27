// js/components/signature-pad.js
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight, dependency-free signature pad. Draws with a single <canvas>
// using Pointer Events, so it works with mouse, touch and pen alike. High-DPI
// aware (renders at devicePixelRatio for a crisp signature) and exports a
// transparent PNG data URL that prints cleanly on white paper.
//
//   const pad = createSignaturePad({ onChange });
//   host.appendChild(pad.element);
//   pad.isEmpty();          // → boolean
//   pad.toDataURL();        // → 'data:image/png;base64,…' (trimmed) or ''
//   pad.clear();
//   pad.loadDataURL(url);   // restore a previously captured signature
//   pad.resize();           // call if the container width changes
//   pad.destroy();
// ─────────────────────────────────────────────────────────────────────────────

const STROKE = '#0e2d38';
const STROKE_W = 2.2;

export function createSignaturePad({ onChange, height = 170 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sig-pad';

  const canvas = document.createElement('canvas');
  canvas.className = 'sig-pad__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Área de firma');
  wrap.appendChild(canvas);

  const hint = document.createElement('span');
  hint.className = 'sig-pad__hint';
  hint.textContent = 'Firma aquí';
  wrap.appendChild(hint);

  const ctx = canvas.getContext('2d');
  let drawing = false;
  let dirty = false;
  let last = null;
  let dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

  function cssSize() {
    const w = Math.max(1, Math.round(canvas.clientWidth || wrap.clientWidth || 320));
    return { w, h: height };
  }

  // Re-scale the backing store to the element's CSS size * DPR, preserving any
  // existing drawing by snapshotting before the resize.
  function resize() {
    const { w, h } = cssSize();
    const snapshot = dirty ? canvas.toDataURL('image/png') : null;
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = STROKE_W;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE;
    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = snapshot;
    }
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    last = pos(e);
    // A dot so a tap leaves a mark.
    ctx.beginPath();
    ctx.arc(last.x, last.y, STROKE_W / 2, 0, Math.PI * 2);
    ctx.fillStyle = STROKE;
    ctx.fill();
    markDirty();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }

  function end(e) {
    if (!drawing) return;
    drawing = false;
    last = null;
    if (e) { try { canvas.releasePointerCapture(e.pointerId); } catch {} }
    onChange?.();
  }

  function markDirty() {
    if (!dirty) { dirty = true; wrap.classList.add('sig-pad--inked'); }
    onChange?.();
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointerleave', end);
  canvas.addEventListener('pointercancel', end);

  const onWinResize = () => resize();
  window.addEventListener('resize', onWinResize);

  function clear() {
    const { w, h } = cssSize();
    ctx.clearRect(0, 0, w, h);
    dirty = false;
    wrap.classList.remove('sig-pad--inked');
    onChange?.();
  }

  function isEmpty() { return !dirty; }

  // Export the inked area trimmed to its bounding box (keeps the stored PNG
  // small and the signature nicely cropped). Returns '' when empty.
  function toDataURL() {
    if (!dirty) return '';
    const { width, height: H } = canvas;
    let data;
    try { data = ctx.getImageData(0, 0, width, H).data; }
    catch { return canvas.toDataURL('image/png'); }
    let minX = width, minY = H, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] !== 0) {
          found = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return '';
    const pad = Math.round(6 * dpr);
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad); maxY = Math.min(H, maxY + pad);
    const cw = maxX - minX, ch = maxY - minY;
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');
  }

  function loadDataURL(url) {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      const { w, h } = cssSize();
      // Fit the image within the pad, centered.
      const scale = Math.min(w / img.width, h / img.height, 1);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      markDirty();
    };
    img.src = url;
  }

  function destroy() {
    window.removeEventListener('resize', onWinResize);
  }

  // Size once the element is in the DOM and has a measurable width.
  requestAnimationFrame(resize);

  return { element: wrap, canvas, clear, isEmpty, toDataURL, loadDataURL, resize, destroy };
}
