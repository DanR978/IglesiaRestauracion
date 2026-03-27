/**
 * IRD Splash — module script.
 *
 * The HTML has <div id="ird-splash"></div> in <body> (instant dark overlay via CSS).
 * This module either populates it with fish + logo + morph, or removes it if
 * the splash was already shown this session.
 *
 * Add ?splash to URL to force replay during development.
 */

import { buildFishScene } from './fish-scene.js';

const splash = document.getElementById('ird-splash');
if (!splash) { /* no mount point — nothing to do */ }
else {

  const KEY   = 'ird-splash-shown';
  const force = new URLSearchParams(location.search).has('splash');

  if (!force && sessionStorage.getItem(KEY)) {
    // Already shown this session — remove the empty overlay immediately
    splash.remove();
  } else {
    sessionStorage.setItem(KEY, '1');

    const MIN_DURATION = 2800;

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
      fishCount: 30,
      bubbleCount: 14,
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