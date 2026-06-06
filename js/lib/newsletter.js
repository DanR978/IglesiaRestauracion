// js/lib/newsletter.js
// Wires any <form data-newsletter> on the page: validates the email, inserts the
// subscriber into Supabase (anon INSERT-only — see the 20260607_newsletter
// migration), and gives friendly Spanish feedback. Auto-init is idempotent.

import { sb } from '/js/lib/supabase.js';
import { isValidEmail } from '/js/lib/validators.js';
import { showToast } from '/js/lib/toast.js';

async function handleSubmit(form) {
  const emailInput = form.querySelector('input[type="email"]');
  const email = (emailInput?.value || '').trim();
  // Honeypot — real users never fill this hidden field.
  const trap = form.querySelector('input[name="company"]');
  if (trap && trap.value) return;

  if (!isValidEmail(email)) {
    showToast('Ingresa un correo electrónico válido.', { ok: false });
    emailInput?.focus();
    return;
  }

  const btn = form.querySelector('button[type="submit"], button:not([type])');
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

  try {
    const { error } = await sb
      .from('newsletter_subscribers')
      .insert({ email, source: location.pathname });

    if (error) {
      if (error.code === '23505') {           // already subscribed
        showToast('Ya estás suscrito. ¡Gracias!');
        form.reset();
      } else {
        throw error;
      }
    } else {
      showToast('¡Listo! Te avisaremos de los próximos eventos.');
      form.reset();
    }
  } catch (err) {
    console.error('[newsletter] subscribe failed', err);
    showToast('No se pudo completar. Inténtalo de nuevo más tarde.', { ok: false });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

export function initNewsletter(root = document) {
  root.querySelectorAll('form[data-newsletter]').forEach((form) => {
    if (form.dataset.newsletterWired) return;
    form.dataset.newsletterWired = '1';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmit(form);
    });
  });
}
