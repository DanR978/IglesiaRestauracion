// js/pages/home/signup-cta.js
// ─────────────────────────────────────────────────────────────────────────────
// Homepage "¡Regístrate ahora!" banner. Surfaces the soonest upcoming special
// event whose registration is open, right near the top of the page. If there's
// no open event, the section stays hidden — zero footprint.
//
// "Featured" = the soonest open event. Admins control it simply by toggling an
// event's "Inscripciones abiertas" switch; no extra flag to manage.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from '/js/lib/supabase.js';
import { esc } from '/js/utils/escape.js';

const TZ = 'America/New_York';

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
    });
  } catch { return ''; }
}

function render(ev) {
  const root = document.getElementById('homeSignup');
  if (!root) return;

  const href = `/eventos/evento-especial.html?e=${encodeURIComponent(ev.slug)}`;
  const dateLabel = fmtDate(ev.event_at);
  const meta = [dateLabel, ev.location].filter(Boolean).map(esc).join(' · ');

  root.innerHTML = `
    <a class="home-signup__card" href="${href}" aria-label="Regístrate: ${esc(ev.title)}">
      ${ev.image_url ? `
        <div class="home-signup__media">
          <img src="${esc(ev.image_url)}" alt="" loading="lazy" decoding="async">
        </div>` : ''}
      <div class="home-signup__body">
        <span class="home-signup__kicker">
          <i class="fas fa-bullhorn" aria-hidden="true"></i> Inscripciones abiertas
        </span>
        <h2 class="home-signup__title" id="homeSignupTitle">${esc(ev.title)}</h2>
        ${meta ? `<p class="home-signup__meta">${meta}</p>` : ''}
        <span class="ird-btn home-signup__btn">¡Regístrate ahora!</span>
      </div>
    </a>`;
}

async function initSignupCta() {
  const section = document.getElementById('homeSignupSection');
  if (!section || !sb) return;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from('special_events')
      .select('id,title,slug,image_url,event_at,location,registration_open')
      .eq('registration_open', true)
      .or(`event_at.gte.${nowIso},event_at.is.null`)
      .order('event_at', { ascending: true, nullsFirst: false })
      .limit(1);

    const ev = data && data[0];
    if (error || !ev) { section.hidden = true; return; }

    render(ev);
    section.hidden = false;
  } catch (e) {
    console.warn('[home-signup]', e);
    section.hidden = true;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSignupCta);
} else {
  initSignupCta();
}
