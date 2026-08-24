// js/lib/sanitize-html.js
// Allowlist HTML sanitizer for the small amount of rich text admins can author
// (special-event description / information). Strict by default: anything not on
// the allowlist is dropped. Runs both when saving (so the DB only ever holds
// clean markup) and when rendering on the public page (defense-in-depth — never
// trust stored HTML, even from an admin-only table).
//
// Allowed: basic inline emphasis, lists, headings, links and a constrained set
// of inline styles (color / background / weight / style / decoration / align).
// Disallowed: scripts, styles, iframes, images, event handlers, javascript:/data:
// URLs, and every CSS property outside the allowlist.

const ALLOWED = {
  B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [], BR: [],
  P: ['style'], DIV: ['style'], SPAN: ['style'],
  UL: [], OL: [], LI: ['style'],
  H3: ['style'], H4: ['style'],
  BLOCKQUOTE: [], FONT: ['color'], A: ['href'],
};

// Elements whose *contents* must be discarded entirely (not just unwrapped).
const DROP = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT',
  'TEMPLATE', 'LINK', 'META', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'FORM',
]);

const STYLE_PROPS = new Set([
  'color', 'background-color', 'font-weight', 'font-style',
  'text-decoration', 'text-align',
]);

// CSS values may only contain these characters — blocks url(), expression(),
// comments and any attempt to break out of the declaration.
const SAFE_VALUE = /^[#a-z0-9.,%()\s-]+$/i;

function safeStyle(raw) {
  if (!raw) return '';
  const out = [];
  for (const decl of String(raw).split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val  = decl.slice(idx + 1).trim();
    if (!STYLE_PROPS.has(prop)) continue;
    if (!SAFE_VALUE.test(val)) continue;
    if (/url|expression|javascript|@import/i.test(val)) continue;
    out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

function safeColor(raw) {
  const v = String(raw || '').trim();
  return SAFE_VALUE.test(v) && !/url|expression/i.test(v) ? v : '';
}

function safeHref(raw) {
  // Control characters are stripped by the browser while it canonicalizes a
  // URL, so the scheme test has to run on the canonicalized value: "java\nscript:"
  // matches none of the patterns below, falls through as a bare relative path,
  // and then executes as javascript: when clicked (DF-002).
  const v = String(raw || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!v) return '';
  // Relative, anchor, and explicit safe schemes only.
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[/#]/.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return '';   // any other scheme → reject
  return v;                                         // bare relative path
}

function appendClean(node, parent, doc) {
  if (node.nodeType === 3) {                        // text
    parent.appendChild(doc.createTextNode(node.nodeValue));
    return;
  }
  if (node.nodeType !== 1) return;                  // comments etc. → drop

  const tag = node.tagName.toUpperCase();
  if (DROP.has(tag)) return;                         // drop element AND content

  const allowedAttrs = ALLOWED[tag];
  if (!allowedAttrs) {                               // unknown tag → unwrap (keep children)
    for (const c of [...node.childNodes]) appendClean(c, parent, doc);
    return;
  }

  const el = doc.createElement(tag.toLowerCase());
  for (const attr of allowedAttrs) {
    if (attr === 'style') {
      const s = safeStyle(node.getAttribute('style'));
      if (s) el.setAttribute('style', s);
    } else if (attr === 'href') {
      const h = safeHref(node.getAttribute('href'));
      if (h) {
        el.setAttribute('href', h);
        el.setAttribute('rel', 'noopener noreferrer nofollow');
        if (/^https?:/i.test(h)) el.setAttribute('target', '_blank');
      }
    } else if (attr === 'color') {
      const c = safeColor(node.getAttribute('color'));
      if (c) el.setAttribute('color', c);
    }
  }
  for (const c of [...node.childNodes]) appendClean(c, el, doc);
  parent.appendChild(el);
}

/** Return a sanitized copy of `dirty` HTML containing only allowlisted markup. */
export function sanitizeHtml(dirty) {
  if (!dirty || typeof dirty !== 'string') return '';
  const doc = new DOMParser().parseFromString(dirty, 'text/html');
  const out = doc.createElement('div');
  for (const node of [...doc.body.childNodes]) appendClean(node, out, doc);
  return out.innerHTML;
}

/** True when sanitized HTML carries no visible text (used to skip empty fields). */
export function htmlIsEmpty(htmlStr) {
  if (!htmlStr) return true;
  const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
  return !doc.body.textContent.trim();
}

const LOOKS_LIKE_HTML = /<[a-z!/][\s\S]*>/i;
const escapeText = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Render a stored description/info value as safe HTML for a public page.
 * - New values are rich HTML → sanitized through the allowlist.
 * - Legacy plain-text values (no tags) → escaped and turned into paragraphs,
 *   preserving the old blank-line / newline behaviour. Backward compatible.
 */
export function renderRichText(value) {
  if (!value) return '';
  if (LOOKS_LIKE_HTML.test(value)) return sanitizeHtml(value);
  return String(value)
    .split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escapeText(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * Flatten a rich/plain value to a single line of plain text — for teaser cards,
 * list excerpts, calendar invites (.ics / Google Calendar `details`), etc.
 * Returns unescaped text; escape it yourself before injecting into HTML.
 */
export function richToPlain(value) {
  if (!value) return '';
  if (LOOKS_LIKE_HTML.test(value)) {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    return doc.body.textContent.replace(/\s+/g, ' ').trim();
  }
  return String(value).replace(/\s+/g, ' ').trim();
}
