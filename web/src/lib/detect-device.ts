/* ============================================================================
 * web/src/lib/detect-device.ts — platform sniffing (port of
 * js/utils/detect-device.js, S07)
 * ----------------------------------------------------------------------------
 * UX-only device detection (which "add to calendar" flow to offer, etc.).
 * Never a security or capability boundary. SSR/prerender-safe: with no
 * `navigator` every check reports desktop.
 *
 * Usage:
 *   import { isIOS, isAndroid, isDesktop, getPlatform } from '$lib/detect-device';
 * ========================================================================== */

function getUA(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || navigator.vendor || '';
}

/** iOS + iPadOS */
export function isIOS(): boolean {
  const ua = getUA();
  const iOS = /iPad|iPhone|iPod/i.test(ua);
  const iPadOS =
    typeof navigator !== 'undefined' &&
    navigator.platform === 'MacIntel' &&
    navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

export function isAndroid(): boolean {
  const ua = getUA();
  return /Android/i.test(ua);
}

export function isDesktop(): boolean {
  return !isIOS() && !isAndroid();
}

export function getPlatform(): 'ios' | 'android' | 'desktop' {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}
