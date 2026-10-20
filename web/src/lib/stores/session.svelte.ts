/* ============================================================================
 * web/src/lib/stores/session.svelte.ts — who is signed in, and may they in (S38)
 * ----------------------------------------------------------------------------
 * The app's ONE onAuthStateChange subscriber. Retires the session half of
 * js/pages/admin/state.js (currentUser / currentProfile) and auth.js boot():
 * it reads the session, its assurance level, the factors (only below aal2)
 * and the profile, and resolveAccess() (#lib/auth/access) turns them into
 * the one status the guard, the sign-in screens and the shell share.
 *
 *   status   'loading' until the first read settles; then an access state,
 *            or 'expired' when the session ended without the user signing
 *            out (a refused refresh, a sign-out in another tab) — the shell
 *            shows "Tu sesión expiró" with a way back in (target-arch. §5)
 *   user · profile · aal · error (the RepoError behind 'error'; Retry →
 *            session.retry())
 *
 * Auth events — the callback stays synchronous and defers every Supabase
 * call to a timer, because auth-js calls it while holding its lock:
 *   SIGNED_IN / PASSWORD_RECOVERY  re-resolve (auth-js also sends SIGNED_IN
 *                                  each time a tab becomes visible again)
 *   another user's id              full reload: no state of one account
 *                                  survives into another's
 *   TOKEN_REFRESHED                re-read session + aal, profile kept
 *   USER_UPDATED                   refetch the profile
 *   MFA_CHALLENGE_VERIFIED         Realtime gets the aal2 token; refetch
 *   SIGNED_OUT                     'signed-out' when signOut() asked, else
 *                                  'expired'; pending confirms are cancelled
 * The profile is refetched on a visible tab at most once a minute — roles
 * change while a tab sleeps. A background refresh that fails in transit
 * keeps the page as it was; only the first read and Retry show 'error'.
 *
 * guardAdmin(url) is the (app) layout's guard: it answers where the visit
 * goes, and the layout moves it there. Browser-only: admin routes are
 * `ssr = false` shells (D-036), so none of this runs while prerendering.
 * UX only — RLS and the aal2 layer are the guard (D-002, D-034).
 *
 * Usage:
 *   // src/routes/(admin)/admin/(app)/+layout.svelte
 *   const target = await guardAdmin(url);
 *   if (target) await leaveTo(target); // else render the page
 *   // anywhere
 *   import { session } from '#lib/stores/session.svelte.js';
 *   if (session.status === 'expired') showExpired();
 *   await session.signOut('local');
 * ========================================================================== */

import { browser } from '$app/env';
import { resolveAccess } from '#lib/auth/access.js';
import type { AuthResult } from '#lib/auth/errors.js';
import { accessTarget, emailLinkTarget, type GuardStatus } from '#lib/auth/guard.js';
import { listFactors } from '#lib/auth/mfa.js';
import {
  getAal,
  getSession,
  onAuthChange,
  reloadPage,
  setRealtimeAuth,
  signOut as endSession,
  type AalState,
  type AuthEvent,
  type AuthSession,
  type SignOutScope,
} from '#lib/auth/session.js';
import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
import { fetchOwnProfile, type OwnProfile } from '#lib/repos/profiles.js';
import type { RepoError } from '#lib/repos/types.js';
import { confirmState } from '#lib/stores/confirm.svelte.js';

export type SessionStatus = GuardStatus;
export type SessionUser = AuthSession['user'];

/** A background profile refetch happens at most this often. */
export const PROFILE_REFRESH_MS = 60_000;

let status = $state<SessionStatus>('loading');
let user = $state.raw<SessionUser | null>(null);
let profile = $state.raw<OwnProfile | null>(null);
let aal = $state.raw<AalState | null>(null);
let error = $state.raw<RepoError | null>(null);

let started: Promise<void> | null = null;
/** Bumped by every load and sign-out: an older load's answer is then stale. */
let generation = 0;
let signingOut = false;
let profileReadAt = 0;
/** Loads running or queued; settled() waits for none. */
let pending = 0;
const waiters: Array<() => void> = [];

function begin(): void {
  pending++;
}

function end(): void {
  pending--;
  if (pending === 0) for (const wake of waiters.splice(0)) wake();
}

/** Resolves once no read is running or queued — the status is then current. */
function settled(): Promise<void> {
  return pending === 0 ? Promise.resolve() : new Promise((wake) => waiters.push(wake));
}

type ProfileRead = 'always' | 'if-stale' | 'never';
type LoadOptions = {
  profile: ProfileRead;
  /** Keep the current state when a read fails in transit (background refresh). */
  quiet: boolean;
};

function clear(next: SessionStatus): void {
  status = next;
  user = null;
  profile = null;
  aal = null;
  error = null;
  profileReadAt = 0;
}

async function load(options: LoadOptions): Promise<void> {
  begin();
  try {
    await readAll(options);
  } finally {
    end();
  }
}

async function readAll({ profile: read, quiet: asked }: LoadOptions): Promise<void> {
  const gen = ++generation;
  // Nothing on screen yet: even a background read must settle the status.
  const quiet = asked && status !== 'loading';
  try {
    const current = await getSession();
    if (gen !== generation) return;
    if (!current.ok) {
      if (!quiet) {
        status = 'error';
        error = current.error;
      }
      return;
    }
    if (!current.data) return clear(user ? 'expired' : 'signed-out');
    if (user && current.data.user.id !== user.id) return reloadPage();

    const fresh =
      read === 'always' ||
      profile === null ||
      (read === 'if-stale' && Date.now() - profileReadAt >= PROFILE_REFRESH_MS);
    const [level, own] = await Promise.all([
      getAal(),
      fresh ? fetchOwnProfile() : Promise.resolve(null),
    ]);
    const factors = level.ok && level.data.current !== 'aal2' ? await listFactors() : null;
    if (gen !== generation) return;

    const nextProfile = own ? (own.ok ? own.data : null) : profile;
    const profileError = own && !own.ok ? own.error : null;
    const next = resolveAccess({
      session: current.data,
      aal: level.ok ? level.data : null,
      factors: factors?.ok ? factors.data : null,
      profile: nextProfile,
      profileError,
    });
    if (next === 'error' && quiet) return;

    user = current.data.user;
    profile = nextProfile;
    aal = level.ok ? level.data : null;
    if (own) profileReadAt = Date.now();
    status = next;
    error =
      next === 'error'
        ? (profileError ??
          (level.ok ? null : level.error) ??
          (factors && !factors.ok ? factors.error : null))
        : null;
  } catch (e) {
    // The repos and auth wrappers never throw; this is a bug, not a state.
    console.error('[session] load:', e);
    if (gen === generation && !quiet) {
      status = 'error';
      error = { kind: 'unknown', message: REPO_ERROR_MESSAGES.unknown };
    }
  }
}

/* Loads requested by events in one tick run once, with the widest options. */
let queued: LoadOptions | null = null;
const PROFILE_ORDER: readonly ProfileRead[] = ['never', 'if-stale', 'always'];

function queueLoad(options: LoadOptions): void {
  if (queued) {
    queued = {
      profile:
        PROFILE_ORDER.indexOf(options.profile) > PROFILE_ORDER.indexOf(queued.profile)
          ? options.profile
          : queued.profile,
      quiet: queued.quiet && options.quiet,
    };
    return;
  }
  queued = options;
  begin();
  setTimeout(() => {
    const run = queued;
    queued = null;
    void (run ? load(run) : Promise.resolve()).finally(end);
  }, 0);
}

function onAuthEvent(event: AuthEvent, next: AuthSession | null): void {
  if (event === 'INITIAL_SESSION') return; // the first load reads the same session
  if (event === 'SIGNED_OUT') {
    generation++;
    queued = null;
    const asked = signingOut;
    signingOut = false;
    confirmState.cancelAll();
    // Only a session this tab had loaded can expire; before that it is just absent.
    clear(asked || !user ? 'signed-out' : 'expired');
    return;
  }
  if (!next) return;
  if (user && next.user.id !== user.id) {
    reloadPage();
    return;
  }
  const settled = status === 'ready';
  switch (event) {
    case 'TOKEN_REFRESHED':
      user = next.user;
      queueLoad({ profile: 'never', quiet: true });
      return;
    case 'USER_UPDATED':
      user = next.user;
      queueLoad({ profile: 'always', quiet: settled });
      return;
    case 'MFA_CHALLENGE_VERIFIED':
      setTimeout(() => setRealtimeAuth(next.access_token), 0);
      queueLoad({ profile: 'always', quiet: false });
      return;
    default: // SIGNED_IN, PASSWORD_RECOVERY
      queueLoad({ profile: user ? 'if-stale' : 'always', quiet: settled });
  }
}

function onVisibility(): void {
  if (document.visibilityState === 'visible' && user) {
    queueLoad({ profile: 'if-stale', quiet: true });
  }
}

/** Start listening (once) and settle the first read. Resolves at once off the browser. */
function ready(): Promise<void> {
  if (!browser) return Promise.resolve();
  started ??= (async () => {
    onAuthChange(onAuthEvent);
    document.addEventListener('visibilitychange', onVisibility);
    await load({ profile: 'always', quiet: false });
    await settled(); // an auth event meanwhile may have queued a newer read
  })();
  return started;
}

/** Read everything again, showing 'loading' — the error state's Retry. */
async function retry(): Promise<void> {
  status = 'loading';
  error = null;
  if (!started) return ready();
  await started;
  await load({ profile: 'always', quiet: false });
  await settled();
}

/** Read everything again behind the current page — after Mi cuenta saved a name or photo. */
async function refresh(): Promise<void> {
  await ready();
  await load({ profile: 'always', quiet: true });
  await settled();
}

/**
 * End this device's session (`local`, the logout button), every session
 * (`global`), or every other one (`others`, which keeps this one).
 */
async function signOut(scope: SignOutScope = 'local'): Promise<AuthResult> {
  signingOut = scope !== 'others';
  try {
    return await endSession(scope);
  } finally {
    signingOut = false;
  }
}

export const session = {
  get status(): SessionStatus {
    return status;
  },
  /** The auth user: email, identities, created_at, last_sign_in_at. */
  get user(): SessionUser | null {
    return user;
  },
  get profile(): OwnProfile | null {
    return profile;
  },
  get aal(): AalState | null {
    return aal;
  },
  /** Why status is 'error'; null otherwise. Show `message`, never `detail`. */
  get error(): RepoError | null {
    return error;
  },
  ready,
  /** Resolves once no read is pending — e.g. after a sign-in, before choosing where to go. */
  settled,
  retry,
  refresh,
  signOut,
};

/**
 * The (app) layout's guard: email links first (the legacy `?action=` /
 * `token_hash` contract), then the access state. Resolves with the page
 * the visit must go to instead, or null when it may render (`ready`, or
 * `error`, which the shell shows with Retry). A return value, not Kit's
 * redirect(): the layout navigates itself, and redirect() would put Kit's
 * redirect checks into every page's runtime (S37 "Public-page cost").
 */
export async function guardAdmin(url: URL): Promise<string | null> {
  if (!browser) return null;
  const emailLink = emailLinkTarget(url, location.hash);
  if (emailLink) return emailLink;
  await ready();
  await settled(); // a sign-in or verify a moment ago is still being read
  return accessTarget(url, status);
}
