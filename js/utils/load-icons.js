// Minimal, idempotent SVG-sprite loader that works on iOS + desktop.
// - No visibility:hidden/display:none (Safari bug).
// - Adds xlink:href fallback.
// - If loaded after components, it patches existing <use> so they render.

(async () => {
  const URL_SPRITE = '/resources/icons/icons.svg';
  if (document.getElementById('svg-sprite-holder')) return; // already injected

  try {
    // NOTE: no `cache: 'no-store'` here. When the PWA service worker is active
    // (phones/installed app), a no-store request re-issued from inside the SW
    // can fail on iOS, which would drop the whole sprite and silently hide every
    // <use> icon (e.g. the footer church logo). A normal fetch lets the SW's
    // stale-while-revalidate serve it reliably; the sprite is also precached in
    // the app shell. Cache-busting on real changes is handled by CACHE_VERSION.
    const res = await fetch(URL_SPRITE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sprite = await res.text();

    const holder = document.createElement('div');
    holder.id = 'svg-sprite-holder';
    holder.setAttribute('aria-hidden', 'true');
    // IMPORTANT: not hidden; just clipped out of view
    holder.style.cssText = [
      'position:absolute','width:0','height:0','overflow:hidden',
      'clip-path:inset(50%)','white-space:nowrap','border:0',
      'pointer-events:none','z-index:-1'
    ].join(';');
    holder.innerHTML = sprite;

    // ensure xlink ns for old Safari
    const root = holder.querySelector('svg');
    if (root && !root.getAttribute('xmlns:xlink')) {
      root.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
    }

    document.body.prepend(holder);

    // Patch existing <use> for Safari (add xlink:href + nudge href to repaint)
    document.querySelectorAll('use[href^="#"]').forEach(u => {
      const ref = u.getAttribute('href');
      if (!u.hasAttribute('xlink:href'))
        u.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href', ref);
      // nudge: remove & re-set to trigger repaint on stubborn engines
      u.removeAttribute('href'); u.setAttribute('href', ref);
    });

    document.dispatchEvent(new Event('icons:ready'));
  } catch (e) {
    console.error('[icons] load failed:', e);
  }
})();
