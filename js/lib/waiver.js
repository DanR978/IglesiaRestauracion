// js/lib/waiver.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the liability waiver (Exoneración de
// Responsabilidad). Shared by:
//   • the public registration wizard  → live, pre-filled document the attendee
//     signs before the review step (js/pages/eventos/registro-wizard.js)
//   • the admin special-events tab     → blank printable form + the signed copy
//     reproduced from a stored registration (js/pages/admin/special-events-tab.js)
//
// Keeping the clause text + version here means the document a person signs and
// the copy an admin later prints can never drift apart. Bump WAIVER_VERSION and
// add a clause whenever the legal wording changes — stored registrations keep
// the version they actually agreed to.
//
// Supports one OR several participants (a parent registering multiple children
// in one submission). The waiver lists every participant and is covered by a
// single signature from the signing adult / guardian.
// ─────────────────────────────────────────────────────────────────────────────

import { esc } from '/js/utils/escape.js';

export const WAIVER_VERSION = '2026-06-v1';

export const WAIVER_CHURCH = 'Iglesia Restauración Divina';
export const WAIVER_ADDRESS = '2601 Clays Mill Rd, Lexington, KY 40503';

export const WAIVER_TITLE = 'Exoneración de Responsabilidad y Asunción de Riesgo';

export const WAIVER_PARTICIPANT_NOTE =
  'Si el participante es menor de edad, debe firmar el padre, la madre o el tutor legal en su representación.';

export const WAIVER_ACK =
  'He leído, entendido y aceptado voluntariamente los términos de este documento.';

export const WAIVER_CLAUSES = [
  'Participo (o el/los menor(es) que represento participa(n)) de forma libre y voluntaria en el evento ' +
    'o actividad indicado anteriormente, organizado o auspiciado por la Iglesia Restauración Divina, ' +
    'y reconozco que dicha participación puede conllevar riesgos inherentes de lesión, daño o pérdida.',
  'Asumo voluntariamente todos los riesgos asociados con dicha participación y, en mi nombre y el de ' +
    'mis herederos y representantes, libero, exonero y acuerdo no demandar a la Iglesia Restauración ' +
    'Divina, sus pastores, líderes, voluntarios, empleados y representantes (las «Partes Liberadas») de ' +
    'toda reclamación, responsabilidad, daño o gasto que surja de o esté relacionado con dicha ' +
    'participación, salvo en casos de negligencia grave o conducta dolosa.',
  'Declaro que el/los participante(s) se encuentra(n) en condiciones físicas adecuadas para participar, ' +
    'y autorizo a las Partes Liberadas a procurar atención médica de emergencia si fuese necesario, ' +
    'aceptando ser responsable de los costos médicos derivados.',
  'Acepto que el/los participante(s) seguirá(n) las reglas e instrucciones del personal y entiendo que ' +
    'el incumplimiento de las normas de conducta puede resultar en el retiro de la actividad.',
  'He leído y entendido este documento en su totalidad, firmo de forma libre y voluntaria, y confirmo ' +
    'que soy mayor de edad o el tutor legal con autoridad para firmar en representación del/de los ' +
    'menor(es) indicado(s).',
];

// Print stylesheet for the full document. Comfortably spaced across two Letter
// pages (sections never split mid-block). Lines bottom-align their content so a
// filled value (or signature) sits ON the rule, not floating above it.
export const WAIVER_CSS = `
  @page { size: portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Lexend Deca', system-ui, sans-serif; color: #1a1a1a; padding: 16mm 18mm; font-size: 10.5pt; line-height: 1.45; }
  .wv-brand { text-align: center; font-size: 17pt; font-weight: 800; color: #0e2d38; margin: 0; letter-spacing: .01em; }
  .wv-addr { text-align: center; font-size: 8.5pt; color: #5a5a5a; margin: 2px 0 12px; }
  .wv-title { text-align: center; font-size: 13.5pt; font-weight: 700; color: #1a1a1a; margin: 2px 0 12px; }
  .wv-rule { border: 0; border-top: 2px solid #0e2d38; margin: 0 0 16px; }
  .wv-section { break-inside: avoid; page-break-inside: avoid; }
  /* Page 1 = event + participants + guardian + emergency; page 2 = terms + signature.
     padding-top restores a top margin after the forced break (@page margin is 0). */
  .wv-page2 { break-before: page; page-break-before: always; padding-top: 16mm; }
  .wv-band { background: #0e2d38; color: #fff; font-weight: 700; text-transform: uppercase; font-size: 9.5pt; letter-spacing: .03em; padding: 5px 11px; margin: 26px 0 12px; }
  .wv-event { display: flex; flex-wrap: wrap; gap: 5px 28px; font-size: 10.5pt; margin: 2px 0 6px; }
  .wv-event b { color: #0e2d38; }
  .wv-fields { width: 100%; border-collapse: collapse; margin: 10px 0 6px; }
  .wv-fields td { padding: 0 12px; vertical-align: bottom; }
  .wv-fields tr + tr td:not(.wv-lbl) { padding-top: 14px; }
  .wv-line { border-bottom: 1px solid #9aa4b2; min-height: 22px; display: flex; flex-direction: column; justify-content: flex-end; }
  .wv-line--filled { font-weight: 600; color: #111; }
  .wv-lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .02em; color: #5a5a5a; padding: 2px 12px 12px; }
  .wv-participants { margin: 8px 0; padding-left: 24px; font-size: 10.5pt; }
  .wv-participants li { margin: 0 0 8px; }
  .wv-participants .wv-age { color: #5a5a5a; }
  .wv-note { font-size: 8.5pt; font-style: italic; color: #5a5a5a; margin: 3px 0 0; }
  ol.wv-clauses { margin: 6px 0; padding-left: 22px; }
  ol.wv-clauses li { margin: 0 0 9px; text-align: justify; break-inside: avoid; page-break-inside: avoid; }
  ol.wv-clauses li::marker { color: #0e2d38; font-weight: 700; }
  .wv-ack { font-weight: 700; margin: 12px 0 6px; }
  .wv-sign { width: 100%; border-collapse: collapse; margin-top: 26px; break-inside: avoid; page-break-inside: avoid; }
  .wv-sign td { vertical-align: bottom; padding: 0 12px; }
  .wv-sign .wv-line { border-bottom: 1px solid #333; min-height: 50px; }
  .wv-sig-img { max-height: 56px; max-width: 100%; display: block; }
  .wv-sig-typed { font-family: 'Segoe Script', 'Brush Script MT', cursive; font-size: 19pt; color: #111; line-height: 1.05; }
  .wv-sig-cap { font-size: 7pt; color: #777; font-style: italic; }
  .wv-foot { text-align: center; font-size: 7.5pt; color: #5a5a5a; margin-top: 22px; }
  .wv-foot-note { font-style: italic; }
`;

// A line cell: filled value (bordered) or an empty blank to write on.
function line(value, { sign = false } = {}) {
  if (sign) return `<div class="wv-line">${value || ''}</div>`;
  return value || value === 0
    ? `<div class="wv-line wv-line--filled">${esc(value)}</div>`
    : `<div class="wv-line"></div>`;
}

// Render the signature mark for the signature line.
function signatureMark(signature) {
  if (!signature) return '';
  if (signature.image) return `<img class="wv-sig-img" src="${esc(signature.image)}" alt="Firma">`;
  if (signature.name)
    return `<span class="wv-sig-typed">${esc(signature.name)}</span>` +
           `<div class="wv-sig-cap">Firma electrónica (nombre escrito)</div>`;
  return '';
}

// The "Participante(s)" section — a single filled line, or a numbered list when
// several attendees share one submission.
function participantsSection(list, blank) {
  if (blank || list.length === 0) {
    return `<table class="wv-fields">
      <tr><td style="width:70%">${line('')}</td><td>${line('')}</td></tr>
      <tr><td class="wv-lbl">Nombre completo del participante</td><td class="wv-lbl">Edad</td></tr>
    </table>`;
  }
  if (list.length === 1) {
    const only = list[0];
    return `<table class="wv-fields">
      <tr><td style="width:70%">${line(only.name)}</td><td>${line(only.age)}</td></tr>
      <tr><td class="wv-lbl">Nombre completo del participante</td><td class="wv-lbl">Edad</td></tr>
    </table>`;
  }
  return `<ol class="wv-participants">${list.map(pp =>
    `<li>${esc(pp.name)}${(pp.age != null && pp.age !== '') ? ` <span class="wv-age">— ${esc(pp.age)} años</span>` : ''}</li>`,
  ).join('')}</ol>`;
}

/**
 * Full waiver document body (pair with WAIVER_CSS for the browser-print flow).
 *
 * @param {object}   opts
 * @param {object}   opts.event          { title, date, location } — date is a formatted string.
 * @param {object[]}[opts.participants]  [{ name, age }] attendees. Single `participant` also accepted.
 * @param {object}  [opts.participant]   { name, age } convenience for a single attendee.
 * @param {object}  [opts.guardian]      { name, relationship, phone, email } parent / legal guardian.
 * @param {object}  [opts.emergency]     { name, phone } emergency contact.
 * @param {object}  [opts.signer]        { name, relationship } who signs — defaults to the guardian.
 * @param {object}  [opts.signature]     { image?, name? } the captured signature.
 * @param {string}  [opts.signedDate]    formatted signing date.
 * @param {boolean} [opts.blank]         force an empty fillable form.
 * @param {string}  [opts.signatureSlot] raw HTML for the signature cell (live wizard mounts a pad).
 */
export function renderWaiverPrintDoc({
  event = {}, participants = null, participant = null, guardian = null, emergency = null,
  signer = null, signature = null, signedDate = '', blank = false, signatureSlot = null,
} = {}) {
  const list = blank ? [] : (participants && participants.length ? participants : (participant ? [participant] : []));
  const g = blank ? null : guardian;
  const em = blank ? null : emergency;
  const sgnr = blank ? null : (signer || guardian || participant);
  const sig = blank ? null : signature;
  const date = blank ? '' : signedDate;
  const sigCell = signatureSlot != null ? signatureSlot : signatureMark(sig);
  const partLabel = list.length > 1 ? 'Participantes' : 'Participante';

  return `
    <h1 class="wv-brand">${esc(WAIVER_CHURCH.toUpperCase())}</h1>
    <div class="wv-addr">${esc(WAIVER_ADDRESS)}</div>
    <div class="wv-title">${esc(WAIVER_TITLE)}</div>
    <hr class="wv-rule">

    <div class="wv-section">
      <div class="wv-band">Evento / Actividad</div>
      <div class="wv-event">
        <span><b>Evento:</b> ${esc(event.title || '—')}</span>
        <span><b>Fecha:</b> ${esc(event.date || '—')}</span>
        <span><b>Lugar:</b> ${esc(event.location || WAIVER_ADDRESS)}</span>
      </div>
    </div>

    <div class="wv-section">
      <div class="wv-band">${esc(partLabel)}</div>
      ${participantsSection(list, blank)}
      <div class="wv-note">${esc(WAIVER_PARTICIPANT_NOTE)}</div>
    </div>

    <div class="wv-section">
      <div class="wv-band">Padre / Madre / Tutor legal</div>
      <table class="wv-fields">
        <tr><td style="width:60%">${line(g?.name)}</td><td>${line(g?.relationship)}</td></tr>
        <tr><td class="wv-lbl">Nombre completo</td><td class="wv-lbl">Parentesco</td></tr>
        <tr><td>${line(g?.phone)}</td><td>${line(g?.email)}</td></tr>
        <tr><td class="wv-lbl">Teléfono</td><td class="wv-lbl">Correo electrónico</td></tr>
      </table>
    </div>

    <div class="wv-section">
      <div class="wv-band">Contacto de emergencia</div>
      <table class="wv-fields">
        <tr><td style="width:60%">${line(em?.name)}</td><td>${line(em?.phone)}</td></tr>
        <tr><td class="wv-lbl">Nombre del contacto</td><td class="wv-lbl">Teléfono</td></tr>
      </table>
    </div>

    <div class="wv-page2">
      <div class="wv-band">Términos de la exoneración</div>
      <ol class="wv-clauses">${WAIVER_CLAUSES.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
      <div class="wv-ack">${esc(WAIVER_ACK)}</div>

      <div class="wv-section">
        <div class="wv-band">Firma</div>
        <table class="wv-sign">
          <tr><td style="width:62%">${line(sigCell, { sign: true })}</td><td>${line(date)}</td></tr>
          <tr><td class="wv-lbl">Firma del padre / madre / tutor legal</td><td class="wv-lbl">Fecha</td></tr>
          <tr><td>${line(sgnr?.name)}</td><td>${line(sgnr?.relationship)}</td></tr>
          <tr><td class="wv-lbl">Nombre en letra de molde</td><td class="wv-lbl">Parentesco</td></tr>
        </table>
      </div>

      <div class="wv-foot">
        ${esc(WAIVER_CHURCH)} · ${esc(WAIVER_ADDRESS)} · irdlex.org${blank ? '' : ` · Doc. ${esc(WAIVER_VERSION)}`}<br>
        <span class="wv-foot-note">Documento legal — conservar una copia firmada en el archivo de la iglesia.</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// pdfmake version — used by the admin tab to generate a real PDF (the app-wide
// standard, see /js/lib/pdf.js) instead of the browser print dialog. Same
// constants + clause text as renderWaiverPrintDoc above, so the on-screen /
// signed document and this PDF stay identical. Takes the SAME opts object.
// Returns a complete pdfmake document definition; hand it to savePdf/openPdf.
// ─────────────────────────────────────────────────────────────────────────────
const WV_DARK = '#0e2d38';
const WV_MX = 44;                       // side margin (pt)
const WV_W = 612 - WV_MX * 2;           // content width on Letter portrait
const WV_GAP = 24;

// A full-width dark band heading.
function pdfBand(text) {
  return {
    table: { widths: ['*'], body: [[{ text: String(text).toUpperCase(), color: '#fff',
      bold: true, fontSize: 9.5, characterSpacing: 0.3, margin: [8, 4, 8, 4] }]] },
    layout: { fillColor: () => WV_DARK, hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 16, 0, 9],
  };
}

// A fill-in line: value (or blank) sitting on a rule, small-caps label beneath.
function pdfLine(value, label, width, opts = {}) {
  const stack = [];
  if (opts.image) {
    stack.push({ image: opts.image, fit: [width - 10, 50], margin: [0, 0, 0, 2] });
  } else if (opts.typed) {
    stack.push({ text: opts.typed, italics: true, fontSize: 16, color: '#111', margin: [0, 0, 0, 2] });
    stack.push({ text: 'Firma electrónica (nombre escrito)', italics: true, fontSize: 7, color: '#777', margin: [0, 1, 0, 1] });
  } else {
    const has = value || value === 0;
    stack.push({ text: has ? String(value) : ' ', bold: has, color: '#111', fontSize: 10, margin: [0, 0, 0, 3] });
  }
  stack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: width - 8, y2: 0, lineWidth: 0.8, lineColor: opts.strong ? '#333' : '#9aa4b2' }] });
  if (label) stack.push({ text: String(label).toUpperCase(), fontSize: 7.5, color: '#5a5a5a', characterSpacing: 0.2, margin: [0, 3, 0, 0] });
  return { width, stack };
}
// Two fill-in lines side by side. `split` = left column fraction.
function pdfPair(a, b, { split = 0.5, strong = false, tall = false } = {}) {
  const lw = Math.round((WV_W - WV_GAP) * split), rw = WV_W - WV_GAP - lw;
  const extra = tall ? { strong } : {};
  return { columns: [
    pdfLine(a.value, a.label, lw, { ...extra, ...(a.opts || {}) }),
    pdfLine(b.value, b.label, rw, { ...extra, ...(b.opts || {}) }),
  ], columnGap: WV_GAP, margin: [0, 6, 0, 2] };
}

export function buildWaiverDocDef(opts = {}) {
  const {
    event = {}, participants = null, participant = null, guardian = null, emergency = null,
    signer = null, signature = null, signedDate = '', blank = false,
  } = opts;
  const list = blank ? [] : (participants && participants.length ? participants : (participant ? [participant] : []));
  const g = blank ? null : guardian;
  const em = blank ? null : emergency;
  const sgnr = blank ? null : (signer || guardian || participant);
  const sig = blank ? null : signature;
  const date = blank ? '' : signedDate;
  const partLabel = list.length > 1 ? 'Participantes' : 'Participante';

  // Participants block: numbered list for several; a name/age line otherwise.
  const participantsBlock = (!blank && list.length > 1)
    ? { ol: list.map((pp) => (pp.age != null && pp.age !== '')
        ? `${pp.name}  —  ${pp.age} años` : `${pp.name}`), margin: [4, 2, 0, 4], fontSize: 10 }
    : pdfPair(
        { value: list[0]?.name, label: 'Nombre completo del participante' },
        { value: list[0]?.age, label: 'Edad' }, { split: 0.7 });

  // Signature cell: reproduced image, typed name, or a blank rule.
  const sigOpts = { strong: true };
  if (sig?.image) sigOpts.image = sig.image;
  else if (sig?.name) sigOpts.typed = sig.name;

  const content = [
    { text: WAIVER_CHURCH.toUpperCase(), alignment: 'center', bold: true, fontSize: 17, color: WV_DARK },
    { text: WAIVER_ADDRESS, alignment: 'center', fontSize: 8.5, color: '#5a5a5a', margin: [0, 2, 0, 10] },
    { text: WAIVER_TITLE, alignment: 'center', bold: true, fontSize: 13.5, color: '#1a1a1a', margin: [0, 0, 0, 10] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: WV_W, y2: 0, lineWidth: 2, lineColor: WV_DARK }], margin: [0, 0, 0, 4] },

    pdfBand('Evento / Actividad'),
    { columns: [
      { text: [{ text: 'Evento: ', bold: true, color: WV_DARK }, event.title || '—'], fontSize: 10 },
      { text: [{ text: 'Fecha: ', bold: true, color: WV_DARK }, event.date || '—'], fontSize: 10 },
      { text: [{ text: 'Lugar: ', bold: true, color: WV_DARK }, event.location || WAIVER_ADDRESS], fontSize: 10 },
    ], columnGap: 16 },

    pdfBand(partLabel),
    participantsBlock,
    { text: WAIVER_PARTICIPANT_NOTE, italics: true, fontSize: 8.5, color: '#5a5a5a', margin: [0, 4, 0, 0] },

    pdfBand('Padre / Madre / Tutor legal'),
    pdfPair({ value: g?.name, label: 'Nombre completo' }, { value: g?.relationship, label: 'Parentesco' }, { split: 0.6 }),
    pdfPair({ value: g?.phone, label: 'Teléfono' }, { value: g?.email, label: 'Correo electrónico' }, { split: 0.6 }),

    pdfBand('Contacto de emergencia'),
    pdfPair({ value: em?.name, label: 'Nombre del contacto' }, { value: em?.phone, label: 'Teléfono' }, { split: 0.6 }),

    { text: '', pageBreak: 'after' },

    pdfBand('Términos de la exoneración'),
    { ol: WAIVER_CLAUSES.map((c) => ({ text: c, alignment: 'justify', margin: [0, 0, 0, 7] })),
      markerColor: WV_DARK, fontSize: 10, margin: [0, 2, 0, 4] },
    { text: WAIVER_ACK, bold: true, margin: [0, 8, 0, 4] },

    pdfBand('Firma'),
    pdfPair({ value: '', label: 'Firma del padre / madre / tutor legal', opts: sigOpts },
            { value: date, label: 'Fecha' }, { split: 0.62, tall: true, strong: true }),
    pdfPair({ value: sgnr?.name, label: 'Nombre en letra de molde' },
            { value: sgnr?.relationship, label: 'Parentesco' }, { split: 0.62 }),

    { text: [
      `${WAIVER_CHURCH} · ${WAIVER_ADDRESS} · irdlex.org`, blank ? '' : ` · Doc. ${WAIVER_VERSION}`,
    ], alignment: 'center', fontSize: 7.5, color: '#5a5a5a', margin: [0, 22, 0, 2] },
    { text: 'Documento legal — conservar una copia firmada en el archivo de la iglesia.',
      alignment: 'center', italics: true, fontSize: 7.5, color: '#5a5a5a' },
  ];

  return {
    pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: [WV_MX, 40, WV_MX, 36],
    info: { title: `${WAIVER_TITLE} — ${event.title || 'Evento'}` },
    content,
    defaultStyle: { fontSize: 10, color: '#1a1a1a', lineHeight: 1.35 },
  };
}
