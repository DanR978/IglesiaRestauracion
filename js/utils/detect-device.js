// /js/utils/detect-device.js

// Guard for SSR or very old browsers
const UA = (typeof navigator !== 'undefined' && (navigator.userAgent || navigator.vendor || '')) || '';

/** True on iPhone/iPad/iPod and iPadOS (which sometimes reports as "Mac"). */
export function isIOS() {
  const iOS = /iPad|iPhone|iPod/i.test(UA);
  const iPadOS = typeof navigator !== 'undefined'
    && navigator.platform === 'MacIntel'
    && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

export function isAndroid() {
  return /Android/i.test(UA);
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
