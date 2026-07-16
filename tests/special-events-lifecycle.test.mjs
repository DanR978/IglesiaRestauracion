// tests/special-events-lifecycle.test.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Regression test for the EBS bug (fixed by 20260716_event_lifecycle.sql):
// registration was gated on `event_at >= now()`, but event_at is the event's
// START — so a multi-day event hard-closed the moment it began, while `status`
// still read 'open'. The two rules that must never regress:
//
//   1. An event is over at its END, not at its start.
//   2. `registration_open` is the whole gate. A re-opened past event is OPEN.
//
// This exercises js/lib/special-events.js as it actually ships; the only edit is
// stubbing the root-absolute Supabase import, which none of the pure lifecycle
// functions touch. Keep it in step with public.special_event_ends() in the
// migration — the two implement the same rule on either side of the wire.
//
// Run: npm test
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const stubbed = readFileSync(join(REPO, 'js/lib/special-events.js'), 'utf8')
  .replace(`import { sb } from '/js/lib/supabase.js';`, `const sb = null;`);
const sutPath = join(mkdtempSync(join(tmpdir(), 'ird-test-')), 'special-events.mjs');
writeFileSync(sutPath, stubbed);

const { eventPhase, eventEndsAt, isRegistrationOpen, isPubliclyVisible, eventAlbum, LINGER_DAYS } =
  await import(pathToFileURL(sutPath).href);

let pass = 0, fail = 0;
const is = (name, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       got:  ${got}\n       want: ${want}`}`);
};
const at = (iso) => new Date(iso).getTime();

/* ── The fallback end: close of the start day, America/New_York ───────────── */

// July is EDT (UTC-4): 2026-07-14 10:00 ET ends 2026-07-15 00:00 ET = 04:00Z.
is('fallback end, EDT (summer)',
   eventEndsAt({ event_at: '2026-07-14T14:00:00Z' }).toISOString(),
   '2026-07-15T04:00:00.000Z');

// January is EST (UTC-5): the offset must follow DST, not be hard-coded.
is('fallback end, EST (winter)',
   eventEndsAt({ event_at: '2026-01-14T15:00:00Z' }).toISOString(),
   '2026-01-15T05:00:00.000Z');

// A late-evening ET start is already "tomorrow" in UTC — it must not borrow the
// wrong local day.
is('fallback end, late-evening start stays on its own local day',
   eventEndsAt({ event_at: '2026-07-15T03:30:00Z' }).toISOString(),
   '2026-07-15T04:00:00.000Z');

is('explicit ends_at wins over the fallback',
   eventEndsAt({ event_at: '2026-07-14T14:00:00Z', ends_at: '2026-07-18T23:00:00Z' }).toISOString(),
   '2026-07-18T23:00:00.000Z');

is('no dates → no end', eventEndsAt({}), 'null');

/* ── The EBS case: multi-day, started, not over ───────────────────────────── */

const EBS = { event_at: '2026-07-14T13:00:00Z', ends_at: '2026-07-19T01:00:00Z', registration_open: true };

is('EBS before it starts',                    eventPhase(EBS, at('2026-07-13T12:00:00Z')), 'upcoming');
is('EBS on day 1 — THE BUG: used to close',   eventPhase(EBS, at('2026-07-14T18:00:00Z')), 'running');
is('EBS mid-week',                            eventPhase(EBS, at('2026-07-16T18:00:00Z')), 'running');
is('EBS one minute before the end',           eventPhase(EBS, at('2026-07-19T00:59:00Z')), 'running');
is('EBS just after the end',                  eventPhase(EBS, at('2026-07-19T01:01:00Z')), 'ended');
is('EBS 6 days after → still shown',          eventPhase(EBS, at('2026-07-25T01:00:00Z')), 'ended');
is('EBS 7 days after → drops off the site',   eventPhase(EBS, at('2026-07-26T01:00:00Z')), 'gone');
is('linger window is 7 days',                 LINGER_DAYS, 7);

const oneDay = { event_at: '2026-07-14T14:00:00Z' };
is('single-day, same evening → still running', eventPhase(oneDay, at('2026-07-14T23:00:00Z')), 'running');
is('single-day, next morning → ended',         eventPhase(oneDay, at('2026-07-15T13:00:00Z')), 'ended');
is('dateless event never ends',                eventPhase({ title: 'x' }, at('2030-01-01T00:00:00Z')), 'upcoming');

/* ── The gate: the flag, and only the flag ────────────────────────────────── */
// Mirrors the event_reg_insert RLS policy. If a date check ever creeps back in
// here, the admin's "set it back to Abierto" silently stops working again.

is('a re-opened ended event IS open', isRegistrationOpen({ ...EBS, registration_open: true }),  'true');
is('closed flag on a live event',     isRegistrationOpen({ ...EBS, registration_open: false }), 'false');
is('missing flag is not open',        isRegistrationOpen({}), 'false');

/* ── Homepage visibility ──────────────────────────────────────────────────── */
// Closing registration must NOT hide an event that is already under way or just
// finished — that's the whole "don't disappear until it's over" ask. It must
// still hide an upcoming closed one: that's how admins park a draft.

const closed = (ev) => ({ ...ev, registration_open: false });

is('upcoming + open → shown',           isPubliclyVisible(EBS, at('2026-07-13T12:00:00Z')), 'true');
is('upcoming + closed → hidden (draft)', isPubliclyVisible(closed(EBS), at('2026-07-13T12:00:00Z')), 'false');
is('running + open → shown',            isPubliclyVisible(EBS, at('2026-07-16T18:00:00Z')), 'true');
is('running + closed → still shown',    isPubliclyVisible(closed(EBS), at('2026-07-16T18:00:00Z')), 'true');
is('ended + closed → still shown',      isPubliclyVisible(closed(EBS), at('2026-07-20T18:00:00Z')), 'true');
is('gone → hidden even if open',        isPubliclyVisible(EBS, at('2026-07-26T01:00:00Z')), 'false');

/* ── Photo link: only a published album that actually has photos ──────────── */

const full  = { id: 'a', slug: 's', is_published: true,  photo_count: 4 };
const empty = { id: 'b', slug: 't', is_published: true,  photo_count: 0 };
const draft = { id: 'c', slug: 'u', is_published: false, photo_count: 9 };

is('album with photos links',      eventAlbum({ gallery_albums: [full] })?.id, 'a');
is('empty album does not link',    eventAlbum({ gallery_albums: [empty] }), 'null');
is('draft album does not link',    eventAlbum({ gallery_albums: [draft] }), 'null');
is('no albums at all',             eventAlbum({ gallery_albums: [] }), 'null');
is('picks the fullest album',      eventAlbum({ gallery_albums: [full, { ...full, id: 'z', photo_count: 40 }] })?.id, 'z');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
