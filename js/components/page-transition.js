/**
 * IRD Page Transition
 *
 * How it works across page navigation:
 *   1. User clicks link → overlay fades IN (0.3s) on current page
 *   2. sessionStorage flag set → browser navigates
 *   3. New page loads → sees the flag → overlay starts VISIBLE → fades OUT (0.4s)
 *   4. Flag cleared
 */

const LOGO = `<svg viewBox="0 0 236 365" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-100.367,-0.797)"><path d="M255.651,343.531C234.113,314.605 247.73,273.395 277.367,248.02C321.004,210.66 291.551,186.25 222.547,177.93C153.547,169.613 228.797,148.734 228.797,148.734L228.797,86.516L263.188,86.516L263.188,65.289L228.797,65.289L228.797,30.25L207.57,30.25L207.57,65.289L173.184,65.289L173.184,86.516L207.57,86.516L207.57,148.734C135.273,169.887 156.59,191.43 207.57,197.703C258.551,203.977 225.5,228.199 161,241.34C142.68,245.07 127.609,249.641 115.477,254.969C115.301,252.539 115.184,250.09 115.184,247.613L115.184,118.613C115.184,61.816 161.391,15.609 218.184,15.609C274.98,15.609 321.188,61.816 321.188,118.613L321.188,247.613C321.188,291.191 293.969,328.513 255.651,343.531Z" fill="#88cceb"/><path d="M111.977,256.609C116.562,311.199 162.43,354.227 218.184,354.227C232.266,354.227 245.707,351.461 258.023,346.477C297.129,330.66 324.801,292.32 324.801,247.613L324.801,118.613C324.801,59.828 276.973,11.996 218.184,11.996C159.398,11.996 111.57,59.828 111.57,118.613L111.57,247.613C111.57,250.645 111.727,253.641 111.977,256.609ZM101.332,262.375C100.719,257.531 100.367,252.613 100.367,247.613L100.367,118.613C100.367,53.812 153.387,0.797 218.184,0.797C282.984,0.797 336.004,53.812 336.004,118.613L336.004,247.613C336.004,295.109 307.504,336.242 266.773,354.844C251.938,361.617 235.492,365.43 218.184,365.43C158.383,365.43 108.656,320.27 101.332,262.375Z" fill="#88cceb"/></g></svg>`;

const KEY = 'ird-transitioning';

// ── Create overlay ──
const overlay = document.createElement('div');
overlay.id = 'ird-transition';
overlay.innerHTML = `<div class="transition-logo">${LOGO}</div>`;
document.body.appendChild(overlay);

// ── INCOMING: if previous page set the flag, play the exit ──
if (sessionStorage.getItem(KEY)) {
  sessionStorage.removeItem(KEY);
  overlay.classList.add('exiting');
  // Remove after animation
  overlay.addEventListener('animationend', () => {
    overlay.classList.remove('exiting');
    overlay.style.pointerEvents = 'none';
  }, { once: true });
}

// ── OUTGOING: intercept internal link clicks ──
const ORIGIN = location.origin;

function isInternal(href) {
  try {
    const url = new URL(href, ORIGIN);
    if (url.origin !== ORIGIN) return false;
    if (url.pathname.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|webp|ico|mp4|mp3)$/i)) return false;
    if ((url.pathname + url.search) === (location.pathname + location.search)) return false;
    return true;
  } catch { return false; }
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (!link) return;

  const href = link.getAttribute('href');
  if (!href) return;
  if (link.target === '_blank' || link.hasAttribute('download')) return;
  if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

  const fullUrl = new URL(href, ORIGIN).href;
  if (!isInternal(fullUrl)) return;

  e.preventDefault();

  // Set flag for incoming page
  sessionStorage.setItem(KEY, '1');

  // Show overlay
  overlay.classList.add('entering');

  // Navigate after overlay is visible
  setTimeout(() => {
    window.location.href = fullUrl;
  }, 300);
});