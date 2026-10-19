/* ============================================================================
 * web/tests/unit/repos/session-gate.ts — which repo calls need a session
 * ----------------------------------------------------------------------------
 * Signed out, supabase-js sends the anon key and RLS answers a staff table
 * with an empty 200, so a staff-only call must check `requireSession` FIRST
 * (repos/session.ts) — and a public call must not: a visitor has no session.
 * Whether a call is staff-only comes from the RLS policies: it is when a
 * signed-out visitor cannot legitimately get what it needs.
 *
 * `describeSessionGate` registers three checks for one repo module:
 *   · every exported function is classified — staff-only, public, or not a
 *     repo call — so a new function cannot skip the decision;
 *   · signed out, each staff-only call returns `auth`, sends nothing, asks
 *     for the session once and logs once under its OWN name — a call that
 *     only inherits a delegate's check (`fetchCatalog` → `fetchFunds`) fails;
 *   · signed out, each public call still goes out and never asks for one.
 * The thunks pass VALID input, so a missing check would issue a query. One
 * function can appear under several keys (`fetchAlbums includeUnpublished`);
 * its name is the key's first word. The suite must spy on `console.warn`.
 *
 * Usage (inside a suite whose beforeEach calls `mock.reset()`):
 *   describeSessionGate(galleryModule, '[gallery]', {
 *     staffOnly: { 'fetchAlbums includeUnpublished': () => fetchAlbums({ includeUnpublished: true }) },
 *     publicCalls: { fetchAlbums: () => fetchAlbums() },
 *     notRepoCalls: ['subscribeAlbums'],
 *   });
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { mock, supabase } from './mock-client';
import { NO_SESSION, SIGNED_OUT } from './results';

type RepoCall = () => Promise<{ ok: boolean }>;

export type SessionGate = {
  staffOnly?: Record<string, RepoCall>;
  publicCalls?: Record<string, RepoCall>;
  /** Exported functions that are not repo calls: pure helpers, `subscribe*`. */
  notRepoCalls?: string[];
};

const nameOf = (key: string): string => key.split(' ')[0];

export function describeSessionGate(
  mod: object,
  tag: string,
  { staffOnly = {}, publicCalls = {}, notRepoCalls = [] }: SessionGate,
): void {
  const staff = Object.entries(staffOnly);
  const open = Object.entries(publicCalls);

  describe('the session check (repos/session.ts)', () => {
    it('classifies every exported function as staff-only, public or not a repo call', () => {
      const exported = Object.entries(mod)
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => name)
        .sort();
      const classified = new Set([...staff, ...open].map(([key]) => nameOf(key)));
      expect(exported).toEqual([...classified, ...notRepoCalls].sort());
    });

    if (staff.length) {
      it.each(staff)('signed out, %s is auth and sends nothing', async (key, call) => {
        mock.session = SIGNED_OUT;
        expect(await call()).toEqual(NO_SESSION);
        expect(mock.queries).toEqual([]);
        expect(mock.storage.calls).toEqual([]);
        expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledWith(`${tag} ${nameOf(key)}:`, 'no signed-in session');
      });
    }

    if (open.length) {
      it.each(open)(
        'signed out, public %s still goes out and asks no session',
        async (_key, call) => {
          mock.session = SIGNED_OUT;
          expect((await call()).ok).toBe(true);
          expect(mock.queries.length).toBeGreaterThan(0);
          expect(supabase.auth.getSession).not.toHaveBeenCalled();
        },
      );
    }
  });
}
