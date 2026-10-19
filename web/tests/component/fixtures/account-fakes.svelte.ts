/* ============================================================================
 * tests/component/fixtures/account-fakes.svelte.ts — Mi cuenta's collaborators (S45)
 * ----------------------------------------------------------------------------
 * Reactive stand-ins for the session and ministries stores and for
 * $app/state's page, so a component test can render the account components
 * with a signed-in account and change it mid-test (a refreshed profile, a
 * session that ended, another ?seccion=). Runes state, so a change re-renders
 * whatever reads it. The auth module, the mfa module and the repos are mocked
 * in each test file with plain vi.fn()s.
 *
 * Usage (top of a test file — vi.mock factories may import this module):
 *   vi.mock('#lib/stores/session.svelte.js', async () => ({
 *     session: (await import('../fixtures/account-fakes.svelte')).sessionFake,
 *   }));
 *   import { sessionFake, resetAccountFakes, setSession } from '../fixtures/account-fakes.svelte';
 * ========================================================================== */
import { SvelteURL } from 'svelte/reactivity';
import { vi } from 'vitest';
import type { AuthResult } from '#lib/auth/errors.js';
import type { SignOutScope } from '#lib/auth/session.js';
import type { Ministry } from '#lib/repos/ministries.js';
import type { OwnProfile } from '#lib/repos/profiles.js';
import type { RepoError } from '#lib/repos/types.js';
import type { SessionStatus, SessionUser } from '#lib/stores/session.svelte.js';

export const USER_ID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

type Identity = NonNullable<SessionUser['identities']>[number];

export function identityFixture(provider: string, over: Partial<Identity> = {}): Identity {
  return {
    id: `id-${provider}`,
    identity_id: `iid-${provider}`,
    user_id: USER_ID,
    provider,
    created_at: '2026-01-15T12:00:00Z',
    last_sign_in_at: '2026-10-19T12:00:00Z',
    ...over,
  };
}

export function userFixture(over: Partial<SessionUser> = {}): SessionUser {
  return {
    id: USER_ID,
    aud: 'authenticated',
    email: 'ana@example.org',
    created_at: '2026-01-15T12:00:00Z',
    last_sign_in_at: '2026-10-19T12:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [identityFixture('email')],
    ...over,
  };
}

export function profileFixture(over: Partial<OwnProfile> = {}): OwnProfile {
  return {
    id: USER_ID,
    display_name: 'Ana Pérez',
    role: 'admin',
    allowed_tabs: [],
    ministry_id: null,
    ministry_ids: [],
    preset_id: null,
    avatar_url: null,
    created_at: '2026-01-15T12:00:00Z',
    ministries: null,
    role_presets: null,
    ...over,
  };
}

const ok: AuthResult = { ok: true, data: undefined };

/* ── session ───────────────────────────────────────────────────────────── */

const sessionState = $state<{
  status: SessionStatus;
  user: SessionUser | null;
  profile: OwnProfile | null;
}>({ status: 'ready', user: userFixture(), profile: profileFixture() });

export const sessionFake = {
  get status(): SessionStatus {
    return sessionState.status;
  },
  get user(): SessionUser | null {
    return sessionState.user;
  },
  get profile(): OwnProfile | null {
    return sessionState.profile;
  },
  aal: null,
  error: null,
  ready: vi.fn<() => Promise<void>>(async () => {}),
  settled: vi.fn<() => Promise<void>>(async () => {}),
  retry: vi.fn<() => Promise<void>>(async () => {}),
  refresh: vi.fn<() => Promise<void>>(async () => {}),
  signOut: vi.fn<(scope?: SignOutScope) => Promise<AuthResult>>(async () => ok),
};

/** Change what the fake session reports; the components re-render. */
export function setSession(next: Partial<typeof sessionState>): void {
  Object.assign(sessionState, next);
}

/* ── ministries ────────────────────────────────────────────────────────── */

const ministriesState = $state<{
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: Ministry[];
  error: RepoError | null;
}>({ status: 'idle', items: [], error: null });

/**
 * The real load() reads the store's status before its first await, so a
 * caller's effect that does not untrack it re-runs whenever the status moves.
 */
async function readsLikeTheStore(): Promise<void> {
  void ministriesState.status;
}

export const ministriesFake = {
  get items(): Ministry[] {
    return ministriesState.items;
  },
  get status() {
    return ministriesState.status;
  },
  get error(): RepoError | null {
    return ministriesState.error;
  },
  load: vi.fn<(options?: { force?: boolean }) => Promise<void>>(readsLikeTheStore),
  byId(id: string | null | undefined): Ministry | undefined {
    return id ? ministriesState.items.find((m) => m.id === id) : undefined;
  },
  namesFor(ids: readonly string[] | null | undefined): string[] {
    return (ids ?? []).flatMap((id) => ministriesState.items.find((m) => m.id === id)?.name ?? []);
  },
};

export function setMinistries(next: Partial<typeof ministriesState>): void {
  Object.assign(ministriesState, next);
}

/* ── $app/state ────────────────────────────────────────────────────────── */

export const PAGE_URL = 'http://localhost/admin/cuenta/';

/** $app/state's `page`, as far as Mi cuenta reads it: a reactive URL, like Kit's. */
export const pageFake = { url: new SvelteURL(PAGE_URL) };

/** Land on Mi cuenta with this query ('' for none). */
export function visit(query: string): void {
  pageFake.url.href = `${PAGE_URL}${query}`;
}

/** Every fake back to a signed-in admin at aal2 on /admin/cuenta/, calls cleared. */
export function resetAccountFakes(): void {
  setSession({ status: 'ready', user: userFixture(), profile: profileFixture() });
  setMinistries({ status: 'idle', items: [], error: null });
  visit('');
  for (const fn of [
    sessionFake.ready,
    sessionFake.settled,
    sessionFake.retry,
    sessionFake.refresh,
    sessionFake.signOut,
    ministriesFake.load,
  ]) {
    fn.mockClear();
  }
  sessionFake.signOut.mockImplementation(async () => ok);
  sessionFake.refresh.mockImplementation(async () => {});
  ministriesFake.load.mockImplementation(readsLikeTheStore);
}
