import IRD from './core/ird.js';

import * as Toast from './lib/toast.js';
import * as Captcha from './lib/captcha.js';
import * as Validators from './lib/validators.js';
import * as Forms from './lib/forms.js';

import {
  loadExternalScripts,
  setCurrentYear,
  setupBurgerMenu,
  setupFAQAccordion,
  loadRandomVerse,
  initAnimations,
  setupDirectionsButton
} from './app/ui.js';

// Expose for legacy/partials (e.g., include.js uses IRD.Forms)
IRD.Toast = Toast;
IRD.Captcha = Captcha;
IRD.Validators = Validators;
IRD.Forms = Forms;

document.addEventListener("DOMContentLoaded", () => {
  // Optional external libs
  loadExternalScripts();

  // Page-wide UI
  setCurrentYear();
  loadRandomVerse();
  initAnimations();
  setupFAQAccordion();
  setupDirectionsButton();
  setTimeout(setupBurgerMenu, 100);

  // Contact form AJAX wiring (works with injected partials)
  IRD.Forms.initContactFormWiring();

  // If you want to bring in your components via modules too, you can:
  // (Uncomment if you’ve converted them to ESM)
  // import('./components/login-modal.js');
  // import('./components/rail.js');
});

// If you still have a non-module include.js, convert it to ESM and import it here.
// If it’s already ESM, you can just:
// import './include.js';
