// /js/utils/detect-device.js (hardened but same API)

function getUA() {
  if (typeof navigator === 'undefined') return '';
  // Some browsers stick device hints in vendor; include both.
  return (navigator.userAgent || navigator.vendor || '');
}

/** iOS + iPadOS (which can report as "Mac" with touch) */
export function isIOS() {
  const ua = getUA();
  const iOS = /iPad|iPhone|iPod/i.test(ua);
  const iPadOS13Plus = (typeof navigator !== 'undefined'
    && navigator.platform === 'MacIntel'
    && navigator.maxTouchPoints > 1);
  return iOS || iPadOS13Plus;
}

export function isAndroid() {
  const ua = getUA();
  return /Android/i.test(ua);
}

export function isDesktop() {
  return !isIOS() && !isAndroid();
}

/** A simple label you can switch on anywhere */
export function getPlatform() {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}