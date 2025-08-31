// /js/utils/detect-device.js
function getUA() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || navigator.vendor || '';
}

/** iOS + iPadOS */
export function isIOS() {
  const ua = getUA();
  const iOS = /iPad|iPhone|iPod/i.test(ua);
  const iPadOS = (typeof navigator !== 'undefined'
    && navigator.platform === 'MacIntel'
    && navigator.maxTouchPoints > 1);
  return iOS || iPadOS;
}

export function isAndroid() {
  const ua = getUA();
  return /Android/i.test(ua);
}

export function isDesktop() { return !isIOS() && !isAndroid(); }

export function getPlatform() {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}
