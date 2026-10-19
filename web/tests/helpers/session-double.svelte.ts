/* ============================================================================
 * web/tests/helpers/session-double.svelte.ts — a stand-in session store (S41)
 * ----------------------------------------------------------------------------
 * The fields of #lib/stores/session.svelte.js that pages and the real perms
 * store read — status, profile, user — as runes state, so a test can sign an
 * account in (or change its role) after mount and watch the page react. The
 * real perms store (the D-006 oracle) derives from it unchanged, so per-role
 * tests exercise the real visibility rules. Load it through vi.hoisted: the
 * vi.mock factory runs before the file's imports, and both must share one
 * instance.
 *
 * Usage:
 *   const double = vi.hoisted(async () => import('../helpers/session-double.svelte'));
 *   vi.mock('#lib/stores/session.svelte.js', async () => ({ session: (await double).session }));
 *   const { signIn, resetSession } = await double;
 *   signIn({ role: 'treasurer' });
 * ========================================================================== */

type Status = 'loading' | 'ready' | 'signed-out' | 'expired' | 'error';
type Profile = Record<string, unknown> & { role: string | null; display_name: string | null };

let status = $state<Status>('loading');
let profile = $state.raw<Profile | null>(null);
let user = $state.raw<{ id: string; email: string } | null>(null);

export const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

export const session = {
  get status(): Status {
    return status;
  },
  get profile(): Profile | null {
    return profile;
  },
  get user(): { id: string; email: string } | null {
    return user;
  },
};

/** A staff profile as fetchOwnProfile returns it; `over` replaces fields. */
export function profileFor(over: Partial<Profile> = {}): Profile {
  return {
    id: USER_ID,
    display_name: 'Ana María López',
    role: 'admin',
    allowed_tabs: [],
    ministry_id: null,
    ministry_ids: [],
    preset_id: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00Z',
    ministries: null,
    ...over,
  };
}

/** Signed in at aal2 with this profile: status `ready`. */
export function signIn(over: Partial<Profile> = {}): void {
  user = { id: USER_ID, email: 'ana@example.org' };
  profile = profileFor(over);
  status = 'ready';
}

export function setStatus(next: Status): void {
  status = next;
}

/** Back to the store's first state: loading, nobody signed in. */
export function resetSession(): void {
  status = 'loading';
  profile = null;
  user = null;
}
