// js/pages/lideres/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Public "Nuestros Líderes" page. Renders the roster edited in the admin
// Líderes tab (js/lib/leaders.js) over the static markup in #leadersDirectory.
//
// That static markup is the fallback for no-JS visitors and for a failed load,
// so an error leaves it in place instead of swapping in an error box.
//
// Contact: a leader who opted in gets an envelope / phone icon button. The
// address and number never reach the DOM — they stay in _contacts and are only
// handed to mailto:/tel: on click, so nothing shows as text or as a hover URL.
// ─────────────────────────────────────────────────────────────────────────────

import { html } from '/js/utils/escape.js';
import { render } from '/js/utils/render.js';
import { emptyHtml } from '/js/components/states.js';
import { fetchDirectory, photoUrl } from '/js/lib/leaders.js';
import { trackEvent } from '/js/lib/track.js';

const _contacts = new Map();   // member id → { email, phone }

function contactButtons(p) {
  if (!p.email && !p.phone) return '';
  return html`
    <div class="person-card__contact">
      ${p.email ? html`<button type="button" class="person-card__contact-btn" data-contact="email" data-member="${p.id}"
        aria-label="Enviar un correo a ${p.name}" title="Enviar correo"><i class="fas fa-envelope" aria-hidden="true"></i></button>` : ''}
      ${p.phone ? html`<button type="button" class="person-card__contact-btn" data-contact="phone" data-member="${p.id}"
        aria-label="Llamar a ${p.name}" title="Llamar"><i class="fas fa-phone" aria-hidden="true"></i></button>` : ''}
    </div>`;
}

function personCard(p) {
  const src = photoUrl(p.photo_path);
  return html`
    <li class="person-card">
      <span class="person-card__avatar" aria-hidden="true">
        <i class="fas fa-user"></i>
        ${src ? html`<img src="${src}" alt="" width="84" height="84" loading="lazy" decoding="async">` : ''}
      </span>
      <p class="person-card__name">${p.name}</p>
      ${p.role ? html`<p class="person-card__role">${p.role}</p>` : ''}
      ${contactButtons(p)}
    </li>`;
}

function sectionBlock(s) {
  return html`
    <section class="ministry scroll-fade-up">
      <header class="ministry__head">
        <span class="ministry__icon" aria-hidden="true"><i class="fas ${s.icon}"></i></span>
        <div class="ministry__heading">
          <h3 class="ministry__name">${s.name}</h3>
          ${s.verse_text ? html`<p class="ministry__verse">"${s.verse_text}"${s.verse_ref ? html` <cite>${s.verse_ref}</cite>` : ''}</p>` : ''}
        </div>
      </header>
      ${s.members.length ? html`<ul class="ministry__people">${s.members.map(personCard)}</ul>` : ''}
    </section>`;
}

function onContactClick(e) {
  const btn = e.target.closest('[data-contact]');
  if (!btn) return;
  const c = _contacts.get(btn.dataset.member);
  const isEmail = btn.dataset.contact === 'email';
  const value = isEmail ? c?.email : c?.phone;
  if (!value) return;
  trackEvent(isEmail ? 'email' : 'call', 'lideres');
  window.location.href = `${isEmail ? 'mailto' : 'tel'}:${value}`;
}

async function initLeaders() {
  const root = document.getElementById('leadersDirectory');
  if (!root) return;
  root.addEventListener('click', onContactClick);
  // A photo that fails to load falls back to the icon underneath it.
  root.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);

  const { data, error } = await fetchDirectory();
  if (error) return;

  _contacts.clear();
  data.forEach(s => s.members.forEach(m => {
    if (m.email || m.phone) _contacts.set(m.id, { email: m.email, phone: m.phone });
  }));

  // Carry over scroll-reveal state, so a block that already faded in doesn't
  // blink out and fade in again when its markup is replaced.
  const shown = [...root.querySelectorAll('.ministry')].map(el => el.classList.contains('is-visible'));
  render(root, data.length
    ? html`${data.map(sectionBlock)}`
    : emptyHtml('fa-people-group', 'Muy pronto presentaremos a las personas que sirven en cada ministerio.'));
  root.querySelectorAll('.ministry').forEach((el, i) => { if (shown[i]) el.classList.add('is-visible'); });
}

initLeaders();
