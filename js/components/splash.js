/**
 * IRD Splash — module script.
 *
 * Behavior:
 *   • Shows ONCE per tab session (the very first page load).
 *   • Every subsequent page navigation removes the splash element instantly.
 *   • If the browser restores the page from the back/forward cache (bfcache),
 *     we also wipe any splash that comes back with the restored DOM —
 *     otherwise the user can get stuck looking at a frozen splash.
 *
 * Add ?splash to URL to force the splash to replay during development.
 */

import { buildFishScene } from './fish-scene.js';

const KEY = 'ird-splash-shown';

/** Force-remove any splash element that's currently in the DOM. */
function nukeSplash() {
  const el = document.getElementById('ird-splash');
  if (el) el.remove();
}

/** Belt-and-suspenders: if the page comes back from bfcache or any later
 *  navigation, ensure we never get stuck on a frozen splash. */
window.addEventListener('pageshow', (ev) => {
  // ev.persisted = true → page restored from bfcache (back/forward button)
  if (ev.persisted) nukeSplash();
});

// On a normal navigation away, mark splash as already-shown so the next
// page doesn't render it again (defensive — sessionStorage is also set
// when we first render it below).
window.addEventListener('pagehide', () => {
  try { sessionStorage.setItem(KEY, '1'); } catch (_) {}
});

const splash = document.getElementById('ird-splash');
if (splash) {
  const force = new URLSearchParams(location.search).has('splash');
  const alreadyShown = (() => { try { return !!sessionStorage.getItem(KEY); } catch (_) { return false; } })();

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if ((!force && alreadyShown) || reducedMotion) {
    // Already shown this session, or the user asked for reduced motion — wipe
    // the placeholder overlay immediately so it never blocks the hero (LCP).
    splash.remove();
  } else {
    try { sessionStorage.setItem(KEY, '1'); } catch (_) {}

    // Keep the brand moment, but don't hold the LCP element hostage. The hero
    // typically paints well under a second; a short floor keeps the reveal
    // graceful without the old ~2.8s stall.
    const MIN_DURATION = 1100;

    // Scale the animated scene down on phones / low-core / data-saver devices,
    // where it competes with the hero image, video and fonts for the main
    // thread at the most performance-sensitive moment.
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const lowPower =
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
      window.matchMedia?.('(max-width: 768px)').matches ||
      (!!conn && (conn.saveData === true || /^(slow-2g|2g|3g)$/i.test(conn.effectiveType || '')));
    const fishCount = lowPower ? 12 : 30;
    const bubbleCount = lowPower ? 6 : 14;

    // ── Logo ──
    splash.innerHTML = `<div class="splash-logo"><svg viewBox="0 0 236 365" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(-100.367,-0.797)">
        <path d="M255.651,343.531C234.113,314.605 247.73,273.395 277.367,248.02C321.004,210.66 291.551,186.25 222.547,177.93C153.547,169.613 228.797,148.734 228.797,148.734L228.797,86.516L263.188,86.516L263.188,65.289L228.797,65.289L228.797,30.25L207.57,30.25L207.57,65.289L173.184,65.289L173.184,86.516L207.57,86.516L207.57,148.734C135.273,169.887 156.59,191.43 207.57,197.703C258.551,203.977 225.5,228.199 161,241.34C142.68,245.07 127.609,249.641 115.477,254.969C115.301,252.539 115.184,250.09 115.184,247.613L115.184,118.613C115.184,61.816 161.391,15.609 218.184,15.609C274.98,15.609 321.188,61.816 321.188,118.613L321.188,247.613C321.188,291.191 293.969,328.513 255.651,343.531Z" fill="#88cceb"/>
        <path d="M111.977,256.609C116.562,311.199 162.43,354.227 218.184,354.227C232.266,354.227 245.707,351.461 258.023,346.477C297.129,330.66 324.801,292.32 324.801,247.613L324.801,118.613C324.801,59.828 276.973,11.996 218.184,11.996C159.398,11.996 111.57,59.828 111.57,118.613L111.57,247.613C111.57,250.645 111.727,253.641 111.977,256.609ZM101.332,262.375C100.719,257.531 100.367,252.613 100.367,247.613L100.367,118.613C100.367,53.812 153.387,0.797 218.184,0.797C282.984,0.797 336.004,53.812 336.004,118.613L336.004,247.613C336.004,295.109 307.504,336.242 266.773,354.844C251.938,361.617 235.492,365.43 218.184,365.43C158.383,365.43 108.656,320.27 101.332,262.375Z" fill="#88cceb"/>
      </g>
    </svg></div>`;

    // ── Fish from shared engine ──
    const scene = buildFishScene(splash, {
      prefix: 'sf',
      fishCount,
      bubbleCount,
    });

    // ── Dismiss ──
    const startT = performance.now();
    let dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;

      const elapsed = performance.now() - startT;
      const remaining = Math.max(0, MIN_DURATION - elapsed);

      setTimeout(() => {
        splash.classList.add('morphing');

        setTimeout(() => {
          splash.classList.remove('morphing');
          splash.classList.add('revealing');

          setTimeout(() => {
            splash.remove();
            scene.destroy();
          }, 850);
        }, 500);
      }, remaining);
    }

    document.addEventListener('includes:ready', dismiss, { once: true });
    window.addEventListener('load', () => setTimeout(dismiss, 500), { once: true });
    setTimeout(() => { if (document.getElementById('ird-splash')) dismiss(); }, 6000);
  }
}
