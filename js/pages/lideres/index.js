// js/pages/lideres/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Public "Nuestros Líderes" page. Renders the roster edited in the admin
// Líderes tab (js/lib/leaders.js) into #leadersDirectory: loading, then the
// roster, the empty state or an error box. The HTML holds no names on purpose —
// a person removed in the admin must be gone from the page, view-source included.
//
// Contact: a leader who opted in gets an envelope / phone icon button. The
// address and number never reach the DOM — they stay in _contacts and are only
// handed to mailto:/tel: on click, so nothing shows as text or as a hover URL.
// ─────────────────────────────────────────────────────────────────────────────

import { html } from '/js/utils/escape.js';
import { render } from '/js/utils/render.js';
import { loadingHtml, emptyHtml, errorHtml } from '/js/components/states.js';
import { fetchDirectory, photoUrl } from '/js/lib/leaders.js';
import { trackEvent } from '/js/lib/track.js';

const _contacts = new Map();   // member id → { email, phone }

// Titles that open a name here: "Pastor Raúl García Guerra" → "RG". Only leading
// ones are skipped — "Pastor" is also a surname ("Ana Pastor" → "AP").
const HONORIFICS = new Set(['pastor', 'pastora', 'pr', 'pra', 'hno', 'hna', 'hermano', 'hermana', 'ev', 'dr', 'dra']);
const LETTER = /\p{L}/u;

// Kept in this module, not js/utils/string.js: a new export on a shared URL that
// visitors already hold in the service-worker cache would fail to link against
// the stale copy on the first load after a deploy, leaving the roster blank.
function initials(name) {
  const words = String(name ?? '').normalize('NFC').trim().split(/\s+/).filter(w => LETTER.test(w));
  let i = 0;
  while (i < words.length - 1 && HONORIFICS.has(words[i].toLocaleLowerCase('es').replace(/\.$/, ''))) i++;
  const use = words.slice(i);
  const first = use.length ? use[0].match(LETTER)[0] : '';
  const last = use.length > 1 ? use[use.length - 1].match(LETTER)[0] : '';
  return (first + last).toLocaleUpperCase('es');
}

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

// The square tile always carries the initials (or the icon, for a name with no
// letters) underneath; the photo covers them, and a photo that fails to load is
// removed by initLeaders, so the tile is never left blank.
function personCard(p) {
  const src = photoUrl(p.photo_path);
  const mono = initials(p.name);
  return html`
    <li class="person-card">
      <span class="person-card__avatar" aria-hidden="true">
        ${mono ? html`<span class="person-card__initials">${mono}</span>` : html`<i class="fas fa-user"></i>`}
        ${src ? html`<img src="${src}" alt="" width="400" height="400" loading="lazy" decoding="async">` : ''}
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
  // Encoded so nothing in a stored address can act as a mailto: header (?bcc=…).
  window.location.href = isEmail
    ? `mailto:${encodeURIComponent(value).replace(/%40/g, '@')}`
    : `tel:${value}`;
}

async function initLeaders() {
  const root = document.getElementById('leadersDirectory');
  if (!root) return;
  root.addEventListener('click', onContactClick);
  // A photo that fails to load is removed, revealing the initials (or icon) under it.
  root.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  render(root, loadingHtml());

  const { data, error } = await fetchDirectory();
  if (error) {
    render(root, errorHtml('No se pudo cargar la lista de líderes. Inténtalo de nuevo más tarde.'));
  } else {
    _contacts.clear();
    data.forEach(s => s.members.forEach(m => {
      if (m.email || m.phone) _contacts.set(m.id, { email: m.email, phone: m.phone });
    }));
    render(root, data.length
      ? html`${data.map(sectionBlock)}`
      : emptyHtml('fa-people-group', 'Muy pronto presentaremos a las personas que sirven en cada ministerio.'));
  }
  root.setAttribute('aria-busy', 'false');
}

initLeaders();
