// tests/project-treasury-sharing.test.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Regression test for shared ministry finances: D-019 as scoped by D-027's
// guard (both in 20260824120100_fin_ministry_shared.sql). Every leader of a ministry
// sees ONE ministry tab: the entries all of its leaders entered, plus the
// church budget. Each leader keeps a fin_projects row of their own for it, so
// one ministry is backed by several rows. The rules that must never regress:
//
//   1. One tab per ministry, however many rows back it. Its totals, its entry
//      list and its PDF report add up every one of those rows.
//   2. The tab is the leader's OWN row and their new entries go there. A
//      leader who sees a ministry's rows but owns none gets exactly one.
//   3. Personal projects stay private: never turned into a ministry row,
//      whatever they are called. The query itself asks only for my rows or my
//      ministries' rows, so they stay hidden even if RLS returned them.
//   4. A ministry-mate's row is drawn on my screen, so only a hex colour and a
//      Font Awesome class from it ever reach the markup or the PDF.
//   5. Before the migrations (or if the shared query errors) the screen is the
//      old per-owner view.
//
// This exercises js/pages/admin/project-treasury.js as it actually ships; the
// only edits are textual swaps of its imports. The admin state/UI modules and
// pdf.js delivery become in-memory stubs; the pure utils, states.js and the
// pdf.js document builders are the real ones. The fake `sb` applies each query's
// filters to tables seen through a model of the fin_* RLS policies of the
// baseline, D-019 and D-027, and records every write RLS turns down: the module
// must never ask for one. Keep that model in step with those policies; the last
// block checks it against the holes D-027 closes.
//
// Run: npm test
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'ird-test-'));
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));
const STUBS = 'globalThis.__projectTreasuryStubs';
const real = (rel) => pathToFileURL(join(REPO, rel)).href;
const specifier = (url) => JSON.stringify(url);

// Copy a repo module into TMP with its imports swapped. Every swap must match
// and no root-absolute or relative import may survive, so a changed import list
// fails here instead of quietly reaching for a browser-only module.
function stage(rel, swaps) {
  let src = readFileSync(join(REPO, rel), 'utf8');
  for (const [from, to] of swaps) {
    if (!src.includes(from)) throw new Error(`${rel}: import not found: ${from}`);
    src = src.replace(from, () => to);
  }
  const left = src.match(/^import\s[^;]*from\s+'[./][^']*';/m);
  if (left) throw new Error(`${rel}: unstubbed import: ${left[0]}`);
  const out = join(TMP, rel.split('/').pop().replace(/\.js$/, '.mjs'));
  writeFileSync(out, src);
  return pathToFileURL(out).href;
}
const fromRepo = (line) => [line, line.replace(/'\/(js\/[^']+)'/, (_, path) => specifier(real(path)))];
const stubbed = (line) => [line, line.replace(/^import (\{[^}]*\}) from '[^']*';$/, `const $1 = ${STUBS};`)];

const statesUrl = stage('js/components/states.js', [
  fromRepo(`import { html } from '/js/utils/escape.js';`),
]);

const sutUrl = stage('js/pages/admin/project-treasury.js', [
  fromRepo(`import { esc } from '/js/utils/escape.js';`),
  fromRepo(`import { money as fmt } from '/js/utils/number.js';`),
  fromRepo(`import { pad2 as pad, todayISO } from '/js/utils/date.js';`),
  fromRepo(`import { fmtDateShort } from '/js/utils/format-date.js';`),
  [`import { loadingHtml, emptyHtml } from '/js/components/states.js';`,
   `import { loadingHtml, emptyHtml } from ${specifier(statesUrl)};`],
  stubbed(`import { sb, currentUser, currentProfile, ministries, MONTHS } from './state.js';`),
  stubbed(`import { toast, confirm } from './ui.js';`),
  stubbed(`import { openFormWizard } from './form-wizard.js';`),
  stubbed(`import { showActionSheet } from '/js/components/action-sheet.js';`),
  // The document builders are pure, so they are the real ones; only delivery
  // and the logo (Image + canvas) are stubbed. The captured docDef is real.
  [`import { savePdf, churchDocDef, sectionHeading, kpiBox, th, churchLogo, CONTENT_W } from '/js/lib/pdf.js';`,
   `import { churchDocDef, sectionHeading, kpiBox, th, CONTENT_W } from ${specifier(real('js/lib/pdf.js'))};\n`
   + `const { savePdf, churchLogo } = ${STUBS};`],
]);

let pass = 0, fail = 0;
const is = (name, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       got:  ${got}\n       want: ${want}`}`);
};
// render() is fire-and-forget behind every click: a rejection there is a failure.
process.on('unhandledRejection', (e) => is('no unhandled rejection', e?.stack || e, 'none'));

/* ── The data: Joe and Chloe both lead Youth ──────────────────────────────── */

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MINISTRIES = [{ id: 'm-youth', name: 'Youth' }, { id: 'm-kids', name: 'Kids' }];
// Every leader here has the treasury page (this screen sits behind it) and none
// is finance, so is_finance() and can_finance() are false throughout.
const LEADER = { role: 'ministry_leader', allowed_tabs: ['treasury'] };
const JOE   = { ...LEADER, id: 'u-joe',   ministry_ids: ['m-youth'] };
const CHLOE = { ...LEADER, id: 'u-chloe', ministry_ids: ['m-youth', 'm-kids'] };
const LEO   = { ...LEADER, id: 'u-leo',   ministry_ids: ['m-kids'] };
const ANA   = { ...LEADER, id: 'u-ana',   ministry_ids: [] };
// Joe again, on a profile from before ministry_ids existed.
const JOE_LEGACY = { ...JOE, ministry_ids: [], ministry_id: 'm-youth' };

const project = (id, owner_id, ministry_id, name, day, archived = false) => ({
  id, owner_id, ministry_id, name, archived, color: '#345a65',
  icon: ministry_id ? 'fa-hand-holding-dollar' : 'fa-folder', created_at: `2026-07-0${day}T12:00:00Z`,
});
const income = (id, project_id, amount, source, occurred_on) => ({ id, project_id, amount, source, occurred_on, note: null });
const expense = (id, project_id, amount, payee, occurred_on, ministry_id = null, note = null) =>
  ({ id, project_id, ministry_id, amount, payee, occurred_on, note });

// Every row in the database, whoever may see it. Chloe's Youth row is the OLDER
// one, so Joe's tab has to be re-pointed at his own. Pass ids to get a database
// without those rows; a project's entries go with it.
function world(...without) {
  const db = {
    fin_projects: [
      project('p-chloe-youth',   'u-chloe', 'm-youth', 'Youth',           1),
      project('p-joe-youth',     'u-joe',   'm-youth', 'Youth',           2),
      project('p-joe-camp',      'u-joe',   null,      'Campamento',      3),
      project('p-chloe-retreat', 'u-chloe', null,      'Retiro de Chloe', 4),
      project('p-chloe-kids',    'u-chloe', 'm-kids',  'Kids',            5),
      project('p-joe-old',       'u-joe',   null,      'Archivado',       6, true),
      project('p-ana-choir',     'u-ana',   null,      'Coro',            7),
    ],
    fin_income: [
      income('i-joe-1',      'p-joe-youth',      120, 'Venta de pasteles', '2026-08-10'),
      income('i-chloe-1',    'p-chloe-youth',     80, 'Ofrenda juvenil',   '2026-08-12'),
      income('i-joe-camp',   'p-joe-camp',       300, 'Inscripciones',     '2026-08-01'),
      income('i-chloe-ret',  'p-chloe-retreat',  999, 'Privado de Chloe',  '2026-08-02'),
      income('i-chloe-kids', 'p-chloe-kids',      55, 'Rifa',              '2026-08-03'),
      income('i-ana-choir',  'p-ana-choir',       40, 'Ofrenda del coro',  '2026-08-04'),
      income('i-church',     null,              5000, 'Diezmos',           '2026-08-04'),
    ],
    fin_expenses: [
      // The church's allocations: the treasurer's rows, project_id NULL.
      expense('e-budget-youth', null, 500, null, '2026-08-05', 'm-youth', 'auto:budget'),
      expense('e-budget-kids',  null, 400, null, '2026-08-05', 'm-kids',  'auto:budget'),
      expense('e-church',       null, 1200, 'Luz', '2026-08-08'),
      expense('e-joe-1',     'p-joe-youth',      45.5, 'Pizza',      '2026-08-15'),
      expense('e-chloe-1',   'p-chloe-youth',    30,   'Transporte', '2026-08-18'),
      expense('e-chloe-2',   'p-chloe-youth',    20,   'Volantes',   '2026-07-20'),
      expense('e-joe-camp',  'p-joe-camp',      100,   'Carpas',     '2026-08-06'),
      expense('e-chloe-ret', 'p-chloe-retreat',  77,   'Privado',    '2026-08-07'),
    ],
    fin_recurring: [{ id: 'r-youth', ministry_id: 'm-youth', active: true }],
  };
  for (const t of Object.keys(db)) db[t] = db[t].filter((r) => !without.includes(r.id) && !without.includes(r.project_id));
  return db;
}

/* ── Fake Supabase: the query builder over RLS-filtered tables ────────────── */

// public.my_ministry_ids(): the profile's ministry_ids, else its legacy ministry_id.
const myMinistryIds = (p) => (p.ministry_ids?.length ? p.ministry_ids : p.ministry_id ? [p.ministry_id] : []);
// public.has_tab(tab): an admin, or a profile whose allowed_tabs hold the page.
const hasTab = (p, tab) => p.role === 'admin' || (p.allowed_tabs ?? []).includes(tab);
const rlsError = (table) => `new row violates row-level security policy for table "${table}"`;

// PostgREST or=(…): comma-separated `column.operator.value` terms, where `in`
// takes a parenthesised list. Only the operators the module uses are modelled.
function orFilter(expr) {
  const terms = [];
  let depth = 0, term = '';
  for (const ch of expr) {
    if (ch === ',' && !depth) { terms.push(term); term = ''; continue; }
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    term += ch;
  }
  terms.push(term);
  const tests = terms.map((t) => {
    const [, col, op, val] = /^(\w+)\.(eq|in)\.(.+)$/.exec(t) || [];
    if (op === 'eq') return (r) => r[col] != null && String(r[col]) === val;
    const list = /^\((.*)\)$/.exec(val || '')?.[1].split(',');
    if (op !== 'in' || !list) throw new Error(`fake sb: unsupported or() term "${t}"`);
    return (r) => r[col] != null && list.includes(String(r[col]));
  });
  return (r) => tests.some((test) => test(r));
}

let seq = 0;   // ids for inserted rows, unique across sessions sharing a database

// `user` is signed in; d019 / guard = whether §2 (sharing) / §1 (guard) of
// 20260824120100_fin_ministry_shared.sql are applied; leak = pretend RLS
// returned every row, so only the query filters; fail(q) = an error message to
// return for that query instead of running it.
function fakeDb(tables, { user, d019, guard, leak, fail }) {
  const uid = user.id, mids = myMinistryIds(user);
  const mine = (mid) => mid != null && mids.includes(mid);
  // pp_fin_projects_scope (guard; RESTRICTIVE, every command): a personal row,
  // or a row of a ministry the user leads NOW, with the treasury page.
  const inScope = (p) => !guard || p.ministry_id == null || (mine(p.ministry_id) && hasTab(user, 'treasury'));
  // pp_fin_projects (owner) + pp_fin_projects_ministry_read (D-019), in scope.
  const seesProject = (p) => inScope(p) && (p.owner_id === uid || (d019 && mine(p.ministry_id)));
  // pp_fin_{income,expenses}_owner and _ministry (D-019) both find the project
  // through an EXISTS on fin_projects, which runs under the caller's own
  // fin_projects RLS: an entry is reachable exactly when its project is.
  const entryAccess = (r) => {
    const p = r.project_id != null && tables.fin_projects.find((x) => x.id === r.project_id);
    return !!p && seesProject(p);
  };
  const read = {
    fin_projects: seesProject,
    fin_income: entryAccess,
    // + pp_fin_expenses_budget (the church's allocations to my ministries) and
    //   the legacy fin_expenses_leader_read (rows of my first ministry).
    fin_expenses: (r) => entryAccess(r) || (r.project_id == null && mine(r.ministry_id))
      || (r.ministry_id != null && r.ministry_id === mids[0]),
    fin_recurring: (r) => mine(r.ministry_id),   // pp_fin_recurring_budget
  };
  // A row a write may leave behind (INSERT, UPDATE's new row) or touch (UPDATE /
  // DELETE's old row, which their WHERE must also be able to read). On
  // fin_projects: pp_fin_projects (owner) in scope, and for UPDATE / DELETE
  // pp_fin_projects_ministry_update / _delete (guard; RESTRICTIVE): only finance
  // changes a ministry row, so none turns personal and no personal one is tagged.
  const writable = (table, r, op) => (table === 'fin_projects'
    ? r.owner_id === uid && inScope(r) && (op === 'insert' || !guard || r.ministry_id == null)
    : table !== 'fin_recurring' && entryAccess(r));
  // trg_fin_{income,expenses}_project_guard (guard): only finance moves an entry
  // to another project.
  const moves = (table, old, next) =>
    guard && table !== 'fin_projects' && next.project_id != null && next.project_id !== old.project_id;

  const log = [];
  const refused = [];   // every write RLS turned down, with an error or silently
  const refuse = (q, why) => refused.push(`${uid} ${q.op} ${q.table} ${JSON.stringify(q.row ?? q.patch ?? {})}`
    + `${q.params.length ? ` where ${q.params.join('&')}` : ''}: ${why}`);
  const refusal = (q, why) => { refuse(q, why); return { data: null, error: { message: why } }; };

  function run(q) {
    log.push(q);
    const failure = fail(q);
    if (failure) return { data: null, error: { message: failure } };
    const rows = tables[q.table];
    const matches = (r) => q.where.every((test) => test(r));
    if (q.op === 'select') {
      const out = rows.filter((r) => (leak || read[q.table](r)) && matches(r));
      if (q.order) {
        const { col, asc } = q.order;
        out.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1));
      }
      const cols = q.cols === '*' ? null : q.cols.split(',').map((c) => c.trim());
      return { data: out.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r })), error: null };
    }
    if (q.op === 'insert') {
      const n = ++seq;
      const row = {
        id: `${q.table}-${n}`, created_at: `2026-10-12T00:00:00.${String(n).padStart(3, '0')}Z`,
        ...(q.table === 'fin_projects' ? { archived: false, ministry_id: null } : {}),   // column defaults
        ...q.row,
      };
      if (!writable(q.table, row, 'insert')) return refusal(q, rlsError(q.table));
      rows.push(row);
      return { data: null, error: null };
    }
    // UPDATE / DELETE reach only the rows the user may read AND write; any other
    // row the filters match is silently skipped, as in Postgres.
    const hit = rows.filter(matches);
    const reach = hit.filter((r) => read[q.table](r) && writable(q.table, r, q.op));
    if (reach.length < hit.length) refuse(q, `${hit.length - reach.length} row(s) silently skipped`);
    if (q.op === 'delete') {
      reach.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { data: null, error: null };
    }
    // One refused row fails the whole statement.
    for (const r of reach) {
      const next = { ...r, ...q.patch };
      if (moves(q.table, r, next)) return refusal(q, 'Solo tesorería puede mover un movimiento a otro proyecto.');
      if (!writable(q.table, next, 'update')) return refusal(q, rlsError(q.table));
    }
    reach.forEach((r) => Object.assign(r, q.patch));
    return { data: null, error: null };
  }

  const sb = {
    from(table) {
      if (!tables[table]) throw new Error(`fake sb: unexpected table ${table}`);
      const q = { table, op: 'select', cols: '*', where: [], params: [], order: null, or: null };
      const filter = (param, test) => { q.params.push(param); q.where.push(test); return b; };
      const b = {
        select: (cols = '*') => { if (q.op === 'select') q.cols = cols; return b; },
        insert: (row) => { q.op = 'insert'; q.row = row; return b; },
        update: (patch) => { q.op = 'update'; q.patch = patch; return b; },
        delete: () => { q.op = 'delete'; return b; },
        eq: (col, val) => filter(`${col}=eq.${val}`, (r) => r[col] === val),
        is: (col, val) => filter(`${col}=is.${val}`, (r) => (val === null ? r[col] == null : r[col] === val)),
        in: (col, vals) => filter(`${col}=in.(${vals.join(',')})`, (r) => vals.includes(r[col])),
        or: (expr) => { q.or = expr; return filter(`or=(${expr})`, orFilter(expr)); },
        order: (col, { ascending = true } = {}) => { q.order = { col, asc: ascending }; return b; },
        then: (ok, ko) => Promise.resolve().then(() => run(q)).then(ok, ko),
      };
      return b;
    },
  };
  return { sb, log, tables, refused };
}

/* ── Fake DOM: the three elements the view renders into ───────────────────── */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);
const text = (markup) => decode(String(markup).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Everything the view makes clickable is a <button>: parse those out of the
// markup so the module can attach listeners and the test can fire them.
function buttons(markup) {
  return [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrSrc, inner]) => {
    const attrs = Object.fromEntries([...attrSrc.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)]));
    const dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
      .map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
    const handlers = [];
    return { attrs, dataset, text: text(inner),
      addEventListener: (type, fn) => { if (type === 'click') handlers.push(fn); },
      click: () => handlers.forEach((fn) => fn({ preventDefault() {} })) };
  });
}

function select(nodes, selector) {
  const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (!m) throw new Error(`fake DOM: unsupported selector ${selector}`);
  return nodes.filter((n) => m[1] in n.attrs && (m[2] === undefined || n.attrs[m[1]] === m[2]));
}

function element() {
  let markup = '';
  const el = { kids: [], querySelectorAll: (selector) => select(el.kids, selector) };
  Object.defineProperty(el, 'innerHTML', {
    get: () => markup,
    set: (v) => { markup = String(v); el.kids = buttons(markup); },
  });
  return el;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
let session = 0;
const SESSIONS = [];   // every session's database, for the closing check on RLS refusals

// One leader opening the Tesorería tab: a fresh module instance (its `projects`
// and `activeId` are module state) over a database the sessions may share. By
// default both migrations are applied; { d019: false } is the database before.
async function openTreasury(user, tables, { d019 = true, guard = d019, leak = false, fail = () => null } = {}) {
  const db = fakeDb(tables, { user, d019, guard, leak, fail });
  SESSIONS.push(db);
  const body = element(), nav = element();
  const month = { closest: () => ({ style: {} }) };
  globalThis.document = {
    getElementById: (id) => ({ treasuryBody: body, trezSubnav: nav, trezMonth: month })[id]
      ?? [...nav.kids, ...body.kids].find((n) => n.attrs.id === id) ?? null,
  };
  const ui = { toasts: [], wizards: [], pdfs: [] };
  globalThis.__projectTreasuryStubs = {
    sb: db.sb, currentUser: { id: user.id }, currentProfile: user, ministries: MINISTRIES, MONTHS,
    toast: (msg, type) => { ui.toasts.push(`${type}:${msg}`); },
    confirm: async () => true,
    openFormWizard: (cfg) => { ui.wizards.push(cfg); },
    showActionSheet: () => {},
    savePdf: async (docDef, filename) => { ui.pdfs.push({ docDef, filename }); },
    churchLogo: async () => null,
  };
  const mod = await import(`${sutUrl}?session=${++session}`);
  const click = async (selector) => {
    const [target] = select([...nav.kids, ...body.kids], selector);
    if (!target) return is(`something to click at ${selector}`, 'nothing', 'a button');
    target.click();
    await settle();
  };
  const v = {
    db, ui, body, nav, click,
    // What the admin shell does each time the Tesorería tab is opened.
    async mount() {
      try { await mod.mountProjectTreasury(); }
      catch (e) { is(`${user.id} opens the treasury`, e?.stack || e, 'no exception'); }
      await settle();
    },
    // Click, and hand back the form wizard that click opened.
    async openForm(selector) {
      const opened = ui.wizards.length;
      await click(selector);
      return ui.wizards[opened] ?? { onSubmit: () => ({ error: { message: `no form opened by ${selector}` } }) };
    },
  };
  await v.mount();
  return v;
}

// What form-wizard.js does on submit: onSubmit, then onDone unless it errored.
async function submit(form, data) {
  let res;
  try { res = await form.onSubmit(data); } catch (e) { res = { error: { message: e?.message || 'Error' } }; }
  if (res?.error) return res.error.message;
  await form.onDone?.();
  await settle();
  return 'ok';
}

// What the leader sees.
const navBar = (v) => v.nav.kids.map((b) => b.text + (/\bactive\b/.test(b.attrs.class) ? '*' : '')).join(' | ');
const tabId = (v, name) => v.nav.kids.find((b) => b.text === name)?.dataset.proj;
const card = (v, id) => v.body.kids.find((b) => b.dataset.open === id)?.text;
const tiles = (v) => text(/<div class="trez-tiles">([\s\S]*?)<div class="trez-addbar">/.exec(v.body.innerHTML)?.[1] ?? '');
const entries = (v) => [...v.body.innerHTML.matchAll(/<tr><td>[\s\S]*?<\/tr>/g)].map(([tr]) => {
  const [, who, amount, action] = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  const del = /data-del="([^"]*)"/.exec(action)?.[1];
  return `${text(who)} ${text(amount)} [${del ?? (action.includes('fa-lock') ? 'locked' : '?')}]`;
});
// The icon class / colour drawn first after `anchor` in some markup.
const drawnAfter = (markup, anchor, re) => {
  const at = markup.indexOf(anchor);
  return at < 0 ? `no ${anchor}` : re.exec(markup.slice(at))?.[1];
};
const iconAt = (markup, anchor) => drawnAfter(markup, anchor, /<i class="fas ([^"]*)"/);
const colorAt = (markup, anchor) => drawnAfter(markup, anchor, /color:([^"]*)"/);
// Every string the PDF prints, in document order.
const pdfText = (node) => (Array.isArray(node) ? node.flatMap(pdfText)
  : node && typeof node === 'object'
    ? Object.entries(node).flatMap(([k, val]) => (k === 'text' && typeof val !== 'object' ? [String(val)] : pdfText(val)))
    : []);
const lastPdf = (v) => v.ui.pdfs.at(-1)?.docDef;
const pdfRows = (doc) => doc?.content.find((c) => c.table?.headerRows === 1)?.table.body.slice(1)
  .map(([, who, amount]) => `${who.text} ${amount.text}`).join(' | ') ?? 'no PDF';
const pdfKpis = (doc) => (doc ? pdfText(doc.content.find((c) => c.columns)).join(' ') : 'no PDF');
// The whole PDF as text, its header/footer/table-layout callbacks included.
const pdfDump = (doc) => JSON.stringify(doc ?? null, (k, val) => (typeof val === 'function' ? val(0, { table: { body: [] } }) : val));
// What the module asked the database for.
const projectQueries = (v) => v.db.log.filter((q) => q.table === 'fin_projects' && q.op === 'select')
  .map((q) => [...q.params].sort().join('&')).join(' → ');
const sent = (v, table, op) => v.db.log.filter((q) => q.table === table && q.op === op).length;
// Who owns a row of a ministry; the rows one leader owns there.
const owners = (tables, mid) => tables.fin_projects.filter((p) => p.ministry_id === mid).map((p) => p.owner_id).sort().join(' ');
const owned = (tables, mid, uid) => tables.fin_projects.filter((p) => p.ministry_id === mid && p.owner_id === uid);

/* ── (a) After the migrations: two per-leader Youth rows are one tab ──────── */

let v = await openTreasury(JOE, world());
is('one Youth tab, not one per leader',          navBar(v), 'Resumen* | Youth | Campamento | Nuevo');
is('the tab is Joe\'s own row, though Chloe\'s is older', tabId(v, 'Youth'), 'p-joe-youth');
is('Youth card = both leaders + church budget',  card(v, 'p-joe-youth'), 'Youth $604.50 Presupuesto $700.00 Gastado $95.50');
is('his personal project is his alone',          card(v, 'p-joe-camp'), 'Campamento $200.00 Entró $300.00 Gastado $100.00');
is('no project row is created',                  sent(v, 'fin_projects', 'insert'), 0);

/* ── (b) The Youth tab lists every leader's entries ───────────────────────── */

await v.click('[data-proj="p-joe-youth"]');
is('tiles add up both leaders', tiles(v), '$700.00 Ingresos $95.50 Gastos $604.50 Balance');
is('entries of both leaders + the locked budget row', entries(v).join(' | '), [
  'Transporte −$30.00 [expense:e-chloe-1]',
  'Pizza −$45.50 [expense:e-joe-1]',
  'Ofrenda juvenil +$80.00 [income:i-chloe-1]',
  'Venta de pasteles +$120.00 [income:i-joe-1]',
  'Presupuesto de la iglesia Asignado por la tesorería +$500.00 [locked]',
  'Volantes −$20.00 [expense:e-chloe-2]',
].join(' | '));
// Only finance renames or deletes a ministry row (D-027), so a ministry tab must not offer it.
is('no rename/delete menu on a ministry tab', select(v.body.kids, '[id="projMenu"]').length, 0);

await v.click('[data-del="expense:e-chloe-1"]');
is('Joe can delete an entry Chloe made', v.db.tables.fin_expenses.some((r) => r.id === 'e-chloe-1'), false);
is('... is told so',                     v.ui.toasts.at(-1), 'success:Eliminado');
is('... and it leaves the tab',          entries(v).some((e) => e.startsWith('Transporte')), false);

/* ── (c) New entries are written to Joe's own row ─────────────────────────── */

v = await openTreasury(JOE, world());
await v.click('[data-proj="p-joe-youth"]');
const addExpense = await v.openForm('[data-add="expense"]');
const saved = await submit(addExpense, { amount: '12.25', who: ' Refrescos ', occurred_on: '2026-08-20', note: '' });
const row = v.db.tables.fin_expenses.at(-1);
is('the expense saves',               saved, 'ok');
is('... into Joe\'s own row, by Joe', `${row.project_id} ${row.created_by} ${row.amount} ${row.payee}`,
   'p-joe-youth u-joe 12.25 Refrescos');
is('... and heads the shared tab',    entries(v)[0], `Refrescos −$12.25 [expense:${row.id}]`);

/* ── (d) Chloe has a Youth row, Joe none: he gets one of his own ──────────── */

const solo = world('p-joe-youth');
v = await openTreasury(JOE, solo);
const [joes] = owned(solo, 'm-youth', 'u-joe');
is('Joe gets a Youth row of his own',             `${joes?.owner_id} ${joes?.name}`, 'u-joe Youth');
is('... just one, beside Chloe\'s',                owners(solo, 'm-youth'), 'u-chloe u-joe');
is('... and it is the tab, not Chloe\'s row',      tabId(v, 'Youth'), joes?.id);
is('... still holding her entries + the budget',   card(v, joes?.id), 'Youth $530.00 Presupuesto $580.00 Gastado $50.00');
await v.click(`[data-proj="${joes?.id}"]`);
const given = await submit(await v.openForm('[data-add="income"]'), { amount: '15', who: 'Donación', occurred_on: '2026-08-21' });
const gift = solo.fin_income.at(-1);
is('Joe adds to the tab',                         given, 'ok');
is('... into his own row',                        gift.project_id, joes?.id);
is('... listed with Chloe\'s entries and the budget', entries(v).join(' | '), [
  `Donación +$15.00 [income:${gift.id}]`,
  'Transporte −$30.00 [expense:e-chloe-1]',
  'Ofrenda juvenil +$80.00 [income:i-chloe-1]',
  'Presupuesto de la iglesia Asignado por la tesorería +$500.00 [locked]',
  'Volantes −$20.00 [expense:e-chloe-2]',
].join(' | '));
await v.mount();
is('a remount creates nothing more',              owners(solo, 'm-youth'), 'u-chloe u-joe');

/* ── (e) First visits after Youth is budgeted, no Youth row anywhere ──────── */

const fresh = world('p-chloe-youth', 'p-joe-youth');
v = await openTreasury(JOE, fresh);
const [made] = owned(fresh, 'm-youth', 'u-joe');
is('exactly one Youth row is created',        owners(fresh, 'm-youth'), 'u-joe');
is('... Joe\'s, named after the ministry',    `${made?.owner_id} ${made?.name}`, 'u-joe Youth');
is('... and it is the tab',                   tabId(v, 'Youth'), made?.id);
is('... seeded with the budget',              card(v, made?.id), 'Youth $500.00 Presupuesto $500.00 Gastado $0.00');
await v.mount();
is('a remount adds no second row',            owners(fresh, 'm-youth'), 'u-joe');
v = await openTreasury(CHLOE, fresh);
const [hers] = owned(fresh, 'm-youth', 'u-chloe');
is('Chloe\'s first visit adds her own row',   owners(fresh, 'm-youth'), 'u-chloe u-joe');
is('... which is her tab',                    tabId(v, 'Youth'), hers?.id);
is('... the same Youth Joe sees',             card(v, hers?.id), 'Youth $500.00 Presupuesto $500.00 Gastado $0.00');
await v.mount();
await openTreasury(JOE, fresh);
is('remounts on either side add nothing',     owners(fresh, 'm-youth'), 'u-chloe u-joe');

/* ── (f) Personal projects never leak, even if RLS returned them ──────────── */
// Reads ignore RLS here: only the query's own filters stand between Joe and
// Chloe's private project (and the Kids ministry he does not lead).

v = await openTreasury(JOE, world(), { leak: true });
is('asks only for my rows or my ministries\' rows', projectQueries(v),
   'archived=eq.false&or=(owner_id.eq.u-joe,ministry_id.in.(m-youth))');
is('Chloe\'s personal project and Kids stay out',   navBar(v), 'Resumen* | Youth | Campamento | Nuevo');
is('... of the Resumen too',                        text(v.body.innerHTML).includes('Retiro de Chloe'), false);
is('Youth totals are unchanged',                    card(v, 'p-joe-youth'), 'Youth $604.50 Presupuesto $700.00 Gastado $95.50');

/* ── (g) The PDF report covers every leader's entries ─────────────────────── */

v = await openTreasury(JOE, world());
await v.click('[data-proj="p-joe-youth"]');
const report = await v.openForm('[id="projReport"]');
await submit(report, { period: 'year', year: '2026', month: '2026-08' });
is('year report: both leaders + the budget', pdfRows(lastPdf(v)), [
  'Volantes −$20.00', 'Presupuesto de la iglesia +$500.00', 'Venta de pasteles +$120.00',
  'Ofrenda juvenil +$80.00', 'Pizza −$45.50', 'Transporte −$30.00',
].join(' | '));
is('year report totals', pdfKpis(lastPdf(v)), '$700.00 PRESUPUESTO $95.50 GASTOS $604.50 BALANCE');
await submit(report, { period: 'month', month: '2026-08', year: '2026' });
is('month report filters both leaders by date', pdfKpis(lastPdf(v)), '$700.00 PRESUPUESTO $75.50 GASTOS $624.50 BALANCE');
is('... file name',                             v.ui.pdfs.at(-1)?.filename, 'Reporte-Youth-Agosto-2026.pdf');
await v.click('[data-proj="p-joe-camp"]');
await v.click('[id="projReport"]');
is('a personal project\'s report is its own',   pdfRows(lastPdf(v)), 'Inscripciones +$300.00 | Carpas −$100.00');

/* ── (h) The shared query errors: fall back to the owner-only view ────────── */

v = await openTreasury(JOE, world(), {
  fail: (q) => (q.table === 'fin_projects' && q.or ? 'column fin_projects.ministry_id does not exist' : null),
});
is('retries with the owner-only query', projectQueries(v),
   'archived=eq.false&or=(owner_id.eq.u-joe,ministry_id.in.(m-youth)) → archived=eq.false&owner_id=eq.u-joe');
is('still renders his tabs',            navBar(v), 'Resumen* | Youth | Campamento | Nuevo');
is('... with his own entries only',     card(v, 'p-joe-youth'), 'Youth $574.50 Presupuesto $620.00 Gastado $45.50');

/* ── (i) Before the migrations are applied: the old per-owner view ────────── */

v = await openTreasury(JOE, world(), { d019: false });
is('Joe\'s own tabs',                  navBar(v), 'Resumen* | Youth | Campamento | Nuevo');
is('Youth card: his entries + budget', card(v, 'p-joe-youth'), 'Youth $574.50 Presupuesto $620.00 Gastado $45.50');
is('Campamento card',                  card(v, 'p-joe-camp'), 'Campamento $200.00 Entró $300.00 Gastado $100.00');
await v.click('[data-proj="p-joe-youth"]');
is('Youth tab: his entries + budget',  entries(v).join(' | '), [
  'Pizza −$45.50 [expense:e-joe-1]',
  'Venta de pasteles +$120.00 [income:i-joe-1]',
  'Presupuesto de la iglesia Asignado por la tesorería +$500.00 [locked]',
].join(' | '));

// Rollout: without a row of his own Joe gets one, as before; once the
// migrations are applied it merges with Chloe's into one tab.
const rollout = world('p-joe-youth');
v = await openTreasury(JOE, rollout, { d019: false });
const own = rollout.fin_projects.find((p) => p.ministry_id === 'm-youth' && p.owner_id === 'u-joe');
is('pre-migration: Chloe\'s row is hidden, so Joe gets his own', sent(v, 'fin_projects', 'insert'), 1);
v = await openTreasury(JOE, rollout);
is('post-migration: one Youth tab',     navBar(v), 'Resumen* | Youth | Campamento | Nuevo');
is('... on Joe\'s row',                 tabId(v, 'Youth'), own?.id);
is('... holding Chloe\'s entries too',  card(v, own?.id), 'Youth $530.00 Presupuesto $580.00 Gastado $50.00');

/* ── (j) No ministries: the owner-only query, as before ───────────────────── */

v = await openTreasury(ANA, world(), { leak: true });
is('owner-only query, no or()',            projectQueries(v), 'archived=eq.false&owner_id=eq.u-ana');
is('no budget lookups',                    v.db.log.some((q) => q.table === 'fin_recurring'), false);
is('only her project, even if RLS leaked', navBar(v), 'Resumen* | Coro | Nuevo');
is('no Ministerios section',               text(v.body.innerHTML).includes('Ministerios'), false);

/* ── Chloe sees the same Youth tab from her side ──────────────────────────── */

v = await openTreasury(CHLOE, world());
is('her tabs, none of Joe\'s personal ones', navBar(v), 'Resumen* | Youth | Kids | Retiro de Chloe | Nuevo');
is('her Youth tab is her own row',           tabId(v, 'Youth'), 'p-chloe-youth');
is('the same Youth totals Joe sees',         card(v, 'p-chloe-youth'), 'Youth $604.50 Presupuesto $700.00 Gastado $95.50');

/* ── A profile with only the legacy ministry_id ───────────────────────────── */

v = await openTreasury(JOE_LEGACY, world());
is('a legacy single-ministry profile shares too', card(v, 'p-joe-youth'), 'Youth $604.50 Presupuesto $700.00 Gastado $95.50');

/* ── Creating a personal project still opens it ───────────────────────────── */

v = await openTreasury(JOE, world());
const created = await submit(await v.openForm('[data-proj="__new"]'), { name: ' Retiro ' });
is('the project saves',                      created, 'ok');
is('the new project is its own, active tab', navBar(v), 'Resumen | Youth | Campamento | Retiro* | Nuevo');

/* ── A ministry with rows but no budget still earns a row ─────────────────── */
// Kids lost its allocation. Leo, its new leader, sees Chloe's Kids row: the
// shared group alone gets him one of his own.

const unfunded = world('e-budget-kids');
v = await openTreasury(LEO, unfunded);
const [leos] = owned(unfunded, 'm-kids', 'u-leo');
is('Leo gets a Kids row of his own',         owners(unfunded, 'm-kids'), 'u-chloe u-leo');
is('... and it is his Kids tab',             tabId(v, 'Kids'), leos?.id);
is('... holding Chloe\'s Kids entries',      card(v, leos?.id), 'Kids $55.00 Presupuesto $55.00 Gastado $0.00');

/* ── A personal project named like the ministry stays personal ────────────── */
// The old code "adopted" it as the ministry row, so its private history became
// every ministry-mate's. D-027 refuses that UPDATE; the module must not even
// ask for it, before the migrations either.

const twinWorld = () => {
  const db = world('p-joe-youth');
  db.fin_projects.push(project('p-joe-twin', 'u-joe', null, 'youth', 8));
  db.fin_income.push(income('i-joe-twin', 'p-joe-twin', 70, 'Ahorro privado', '2026-08-09'));
  return db;
};
const twin = twinWorld();
v = await openTreasury(JOE, twin);
is('no UPDATE is sent to fin_projects',      sent(v, 'fin_projects', 'update'), 0);
is('Joe gets a separate Youth row',          owned(twin, 'm-youth', 'u-joe').map((p) => p.name), 'Youth');
is('his "youth" project stays personal',     twin.fin_projects.find((p) => p.id === 'p-joe-twin').ministry_id, null);
is('... a tab of its own',                   navBar(v), 'Resumen* | Youth | Campamento | youth | Nuevo');
is('... with its own money',                 card(v, 'p-joe-twin'), 'youth $70.00 Entró $70.00 Gastado $0.00');
is('... none of it in Youth',                card(v, tabId(v, 'Youth')), 'Youth $530.00 Presupuesto $580.00 Gastado $50.00');
v = await openTreasury(CHLOE, twin);
is('Chloe never sees it',                    navBar(v), 'Resumen* | Youth | Kids | Retiro de Chloe | Nuevo');
is('... nor its money in Youth',             card(v, 'p-chloe-youth'), 'Youth $530.00 Presupuesto $580.00 Gastado $50.00');
const twinBefore = twinWorld();
v = await openTreasury(JOE, twinBefore, { d019: false });
is('before the migrations too: no UPDATE, a new Youth row, "youth" still personal',
   `${sent(v, 'fin_projects', 'update')} ${owned(twinBefore, 'm-youth', 'u-joe').map((p) => p.name)} `
   + `${twinBefore.fin_projects.find((p) => p.id === 'p-joe-twin').ministry_id}`, '0 Youth null');

/* ── Row colours and icons are whitelisted, a ministry-mate's above all ───── */
// Joe's tab is a ministry-mate's row whenever he has none of his own, e.g. when
// creating it fails (offline, here). Chloe set her row's colour and icon
// through the API; the colour of his own project only starts like a hex one.

const EVIL_COLOR = 'red;background:url(https://example.invalid/x)';
const EVIL_ICON = 'fa-x" onmouseover="alert(1)';
const evil = world('p-joe-youth');
Object.assign(evil.fin_projects.find((p) => p.id === 'p-chloe-youth'), { color: EVIL_COLOR, icon: EVIL_ICON });
Object.assign(evil.fin_projects.find((p) => p.id === 'p-joe-camp'), { color: '#fff;background:url(https://example.invalid/y)' });
v = await openTreasury(JOE, evil, { fail: (q) => (q.table === 'fin_projects' && q.op === 'insert' ? 'Failed to fetch' : null) });
let drawn = v.nav.innerHTML + v.body.innerHTML;
is('his row fails to save, so the tab is Chloe\'s', tabId(v, 'Youth'), 'p-chloe-youth');
is('... its icon falls back',                       iconAt(v.nav.innerHTML, 'data-proj="p-chloe-youth"'), 'fa-folder');
is('... so do its card\'s colour and icon',         `${colorAt(v.body.innerHTML, 'data-open="p-chloe-youth"')} `
   + `${iconAt(v.body.innerHTML, 'data-open="p-chloe-youth"')}`, '#475569 fa-folder');
is('a colour is all hex, not just its start',       colorAt(v.body.innerHTML, 'data-open="p-joe-camp"'), '#475569');
await v.click('[data-proj="p-chloe-youth"]');
drawn += v.nav.innerHTML + v.body.innerHTML;
is('Chloe\'s page header falls back too',           `${colorAt(v.body.innerHTML, 'trez-projhead__title')} `
   + `${iconAt(v.body.innerHTML, 'trez-projhead__title')}`, '#475569 fa-folder');
is('none of it reaches the markup',                 /example\.invalid|onmouseover/.test(drawn), false);
await submit(await v.openForm('[id="projReport"]'), { period: 'year', year: '2026', month: '2026-08' });
is('the PDF accent falls back',                     lastPdf(v)?.content.find((c) => c.canvas)?.canvas[0].lineColor, '#345a65');
is('... and none of it reaches the PDF',            /example\.invalid/.test(pdfDump(lastPdf(v))), false);

/* ── The module never asked for a write RLS turns down ────────────────────── */

is('RLS refused nothing the module asked for', SESSIONS.flatMap((db) => db.refused).join(' | ') || 'nothing', 'nothing');

/* ── The model still closes the holes D-027 closes ────────────────────────── */
// Hand-made API calls, not the module: the holes the migration's D-027 header
// lists. Were the model laxer than the migration, every check above could pass
// against a database that production doesn't have.

const holes = world();
// Joe led Kids once; Chloe kept writing into his old Kids row.
holes.fin_projects.push(project('p-joe-kids', 'u-joe', 'm-kids', 'Kids', 9));
holes.fin_income.push(income('i-kids-mate', 'p-joe-kids', 25, 'Rifa', '2026-08-11'));
const api = (user) => fakeDb(holes, { user, d019: true, guard: true, leak: false, fail: () => null }).sb;
// What a call came back with: its error, else the ids it read.
const said = async (query) => {
  const { data, error } = await query;
  return error?.message ?? ((data ?? []).map((r) => r.id).join(' ') || 'nothing');
};
const asJoe = api(JOE);
const joeYouth = () => holes.fin_projects.find((p) => p.id === 'p-joe-youth');

is('a leader who left Kids loses his old Kids row',
   await said(asJoe.from('fin_projects').select('id').eq('owner_id', 'u-joe').eq('archived', false)), 'p-joe-youth p-joe-camp');
is('... what his old mates wrote into it',
   await said(asJoe.from('fin_income').select('id').eq('project_id', 'p-joe-kids')), 'nothing');
is('... and writing into it',
   await said(asJoe.from('fin_income').insert({ project_id: 'p-joe-kids', amount: 1 })), rlsError('fin_income'));
is('no row is tagged with a ministry its owner doesn\'t lead',
   await said(asJoe.from('fin_projects').insert({ owner_id: 'u-joe', name: 'Kids', ministry_id: 'm-kids' })), rlsError('fin_projects'));
is('no personal project becomes a ministry one',
   await said(asJoe.from('fin_projects').update({ ministry_id: 'm-youth' }).eq('id', 'p-joe-camp')), rlsError('fin_projects'));
await asJoe.from('fin_projects').update({ ministry_id: null, name: 'Mío', archived: true }).eq('id', 'p-joe-youth');
await asJoe.from('fin_projects').delete().eq('id', 'p-joe-youth');
is('no ministry row is privatized, renamed, archived or deleted, even by its owner',
   `${joeYouth()?.ministry_id} ${joeYouth()?.name} ${joeYouth()?.archived}`, 'm-youth Youth false');
is('no mate\'s entry is moved into a private project',
   await said(asJoe.from('fin_expenses').update({ project_id: 'p-joe-camp' }).eq('id', 'e-chloe-1')),
   'Solo tesorería puede mover un movimiento a otro proyecto.');
const noTab = api({ ...JOE, allowed_tabs: [] });
is('without the treasury page, no ministry books',
   `${await said(noTab.from('fin_projects').select('id').eq('archived', false))} / ${await said(noTab.from('fin_income').select('id'))}`,
   'p-joe-camp / i-joe-camp');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
