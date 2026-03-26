/**
 * IRD Logo Loader — edge-chase + comet trail + radiance
 *
 * Effects:
 *   1. Edge ring has a rotating gap that chases clockwise
 *   2. A bright comet dot + fading trail orbits at the gap's leading edge
 *   3. A soft radiance pulse glows behind the cross
 *   4. The cross breathes gently (scale/opacity)
 *
 * Usage:
 *   import { irdLoader } from './ird-loader.js';
 *
 *   // Show a loader (returns element handle for removal)
 *   const el = irdLoader.show(parent, { size: 'md', label: 'Cargando...' });
 *   irdLoader.hide(el);
 *
 *   // Wrap an async operation (auto show/hide)
 *   await irdLoader.wrap(parent, asyncFn, { size: 'sm', label: 'Enviando...' });
 *
 *   // Replace button content while loading
 *   await irdLoader.button(btn, asyncFn);
 *
 *   // Auto-inject into any <span class="ird-loader"> already in the DOM
 *   irdLoader.hydrate();
 */

const CROSS_D = "M255.651,343.531C234.113,314.605 247.73,273.395 277.367,248.02C321.004,210.66 291.551,186.25 222.547,177.93C153.547,169.613 228.797,148.734 228.797,148.734L228.797,86.516L263.188,86.516L263.188,65.289L228.797,65.289L228.797,30.25L207.57,30.25L207.57,65.289L173.184,65.289L173.184,86.516L207.57,86.516L207.57,148.734C135.273,169.887 156.59,191.43 207.57,197.703C258.551,203.977 225.5,228.199 161,241.34C142.68,245.07 127.609,249.641 115.477,254.969C115.301,252.539 115.184,250.09 115.184,247.613L115.184,118.613C115.184,61.816 161.391,15.609 218.184,15.609C274.98,15.609 321.188,61.816 321.188,118.613L321.188,247.613C321.188,291.191 293.969,328.513 255.651,343.531Z";

const EDGE_D = "M111.977,256.609C116.562,311.199 162.43,354.227 218.184,354.227C232.266,354.227 245.707,351.461 258.023,346.477C297.129,330.66 324.801,292.32 324.801,247.613L324.801,118.613C324.801,59.828 276.973,11.996 218.184,11.996C159.398,11.996 111.57,59.828 111.57,118.613L111.57,247.613C111.57,250.645 111.727,253.641 111.977,256.609ZM101.332,262.375C100.719,257.531 100.367,252.613 100.367,247.613L100.367,118.613C100.367,53.812 153.387,0.797 218.184,0.797C282.984,0.797 336.004,53.812 336.004,118.613L336.004,247.613C336.004,295.109 307.504,336.242 266.773,354.844C251.938,361.617 235.492,365.43 218.184,365.43C158.383,365.43 108.656,320.27 101.332,262.375Z";

// Center of logo in viewBox coords (after translate)
const CX = 118;
const CY = 182;

// Timings
const CHASE_DUR  = "2.5s";  // edge gap rotation
const BREATH_DUR = "3s";    // cross + radiance pulse

let _uid = 0;

/**
 * Build the animated SVG string with unique IDs.
 * @param {Object} opts
 * @param {string} opts.fill  - Logo fill color (default: primary teal)
 * @param {number} opts.dotR  - Comet head radius in SVG units (auto-scaled)
 * @returns {string} SVG markup
 */
function buildSVG(opts = {}) {
  const id = ++_uid;
  const fill  = opts.fill || "#345a65";
  const light = opts.light || "#abccd4";
  const mid   = opts.mid   || "#89b6c2";
  const dr    = opts.dotR  || 3.5;

  return `<svg viewBox="0 0 236 365" xmlns="http://www.w3.org/2000/svg" style="fill-rule:evenodd">
<defs>
<mask id="ird-em${id}">
<rect x="-150" y="-150" width="550" height="700" fill="white"/>
<polygon points="${CX},${CY} ${CX},-220 504,78" fill="black">
<animateTransform attributeName="transform" type="rotate" from="0 ${CX} ${CY}" to="360 ${CX} ${CY}" dur="${CHASE_DUR}" repeatCount="indefinite"/>
</polygon>
</mask>
<path id="ird-op${id}" d="M${CX},6 A112,176 0 1,1 ${CX - 0.01},6" fill="none"/>
<radialGradient id="ird-rg${id}"><stop offset="0%" stop-color="${fill}" stop-opacity="0.22"/><stop offset="100%" stop-color="${fill}" stop-opacity="0"/></radialGradient>
</defs>

<ellipse class="ird-radiance" cx="${CX}" cy="${CY}" rx="128" ry="198" fill="url(#ird-rg${id})">
<animate attributeName="opacity" values="0.3;0.75;0.3" dur="${BREATH_DUR}" repeatCount="indefinite"/>
</ellipse>

<g transform="translate(-100.367,-0.797)">
<path class="ird-cross" d="${CROSS_D}" fill="${fill}">
<animate attributeName="opacity" values="0.82;1;0.82" dur="${BREATH_DUR}" repeatCount="indefinite"/>
</path>
</g>

<g transform="translate(-100.367,-0.797)">
<path d="${EDGE_D}" fill="${fill}" opacity="0.12"/>
</g>

<g transform="translate(-100.367,-0.797)" mask="url(#ird-em${id})">
<path class="ird-edge-chase" d="${EDGE_D}" fill="${fill}"/>
</g>

<circle class="ird-comet" r="${dr}" fill="${light}" opacity="0.95">
<animateMotion dur="${CHASE_DUR}" repeatCount="indefinite" begin="-0.52s"><mpath href="#ird-op${id}"/></animateMotion>
</circle>
<circle class="ird-comet" r="${dr * 0.65}" fill="${mid}" opacity="0.45">
<animateMotion dur="${CHASE_DUR}" repeatCount="indefinite" begin="-0.38s"><mpath href="#ird-op${id}"/></animateMotion>
</circle>
<circle class="ird-comet" r="${dr * 0.35}" fill="${mid}" opacity="0.18">
<animateMotion dur="${CHASE_DUR}" repeatCount="indefinite" begin="-0.24s"><mpath href="#ird-op${id}"/></animateMotion>
</circle>
</svg>`;
}

export const irdLoader = {

  /**
   * Show a loader inside a parent element.
   * @param {HTMLElement} parent
   * @param {Object}      opts
   * @param {'xs'|'sm'|'md'|'lg'|'xl'} opts.size    - default 'md'
   * @param {string}      opts.label   - text beside the logo
   * @param {boolean}     opts.replace - hide parent's children (default false)
   * @param {boolean}     opts.center  - center in parent (default true)
   * @returns {HTMLElement} Handle — pass to .hide()
   */
  show(parent, opts = {}) {
    const { size = 'md', label, replace = false, center = true } = opts;

    if (replace) {
      Array.from(parent.children).forEach(c => {
        c.dataset.irdHidden = c.style.display || '';
        c.style.display = 'none';
      });
    }

    const wrap = center ? document.createElement('div') : null;
    if (wrap) {
      wrap.className = 'ird-loader--center';
      wrap.dataset.irdLoaderWrap = '';
    }

    const loader = document.createElement('span');
    loader.className = 'ird-loader';
    loader.dataset.size = size;
    if (label) loader.dataset.label = label;
    loader.innerHTML = buildSVG();

    if (wrap) {
      wrap.appendChild(loader);
      parent.appendChild(wrap);
      return wrap;
    }
    parent.appendChild(loader);
    return loader;
  },

  /**
   * Remove a previously-shown loader and restore siblings.
   */
  hide(loaderEl) {
    if (!loaderEl) return;
    const parent = loaderEl.parentElement;
    if (parent) {
      Array.from(parent.children).forEach(c => {
        if ('irdHidden' in c.dataset) {
          c.style.display = c.dataset.irdHidden || '';
          delete c.dataset.irdHidden;
        }
      });
    }
    loaderEl.remove();
  },

  /**
   * Wrap an async function — shows loader before, hides after.
   */
  async wrap(parent, fn, opts = {}) {
    const el = this.show(parent, opts);
    try { return await fn(); }
    finally { this.hide(el); }
  },

  /**
   * Replace a button's content with a tiny loader while async fn runs.
   */
  async button(btn, fn) {
    const original = btn.innerHTML;
    const wasDisabled = btn.disabled;
    btn.disabled = true;

    const loader = document.createElement('span');
    loader.className = 'ird-loader';
    loader.dataset.size = 'xs';
    loader.innerHTML = buildSVG({ dotR: 2 });

    btn.innerHTML = '';
    btn.appendChild(loader);

    try { return await fn(); }
    finally {
      btn.innerHTML = original;
      btn.disabled = wasDisabled;
    }
  },

  /**
   * Create a standalone loader element (doesn't attach to DOM).
   */
  create(opts = {}) {
    const { size = 'md', label } = opts;
    const loader = document.createElement('span');
    loader.className = 'ird-loader';
    loader.dataset.size = size;
    if (label) loader.dataset.label = label;
    loader.innerHTML = buildSVG();
    return loader;
  },

  /**
   * Inject animated SVG into every <span class="ird-loader"> on the page
   * that hasn't been hydrated yet. Call once on DOMContentLoaded or
   * after dynamically inserting loader placeholders.
   */
  hydrate() {
    document.querySelectorAll('.ird-loader').forEach(el => {
      if (el.querySelector('svg')) return;       // already hydrated
      el.innerHTML = buildSVG();
    });
  }
};

// Expose globally for non-module usage
if (typeof window !== 'undefined') {
  window.irdLoader = irdLoader;

  // Auto-hydrate on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => irdLoader.hydrate());
  } else {
    irdLoader.hydrate();
  }
}