// js/pages/admin/auth-scene.js
// Underwater background for the admin login screen.
// Uses the shared fish-scene engine — one codebase for all fish animations.

import { buildFishScene } from '/js/components/fish-scene.js';

export function initAuthScene() {
  const screen = document.getElementById('authScreen');
  if (!screen) return;

  buildFishScene(screen, {
    prefix: 'fish',
    fishCount: 55,
    bubbleCount: 20,
  });
}