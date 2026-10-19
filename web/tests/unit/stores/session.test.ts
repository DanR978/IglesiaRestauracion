// S38 — the session store: the one onAuthStateChange subscriber, its state
// transitions with a mocked auth layer, and guardAdmin's decisions (the
// legacy email contract first, then the access state). Each test imports a
// fresh store instance (vi.resetModules), so no state leaks between cases.
import { isRedirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  USER,
  emit,
  failure,
  h,
  happyPath,
  ok,
  profileFor,
  sessionFor,
  settle,
} from './session-mocks';

// One instance of the mocks for the whole file: resetModules (fresh store per
// test) must not re-evaluate them, or the store would get blank vi.fn()s.
const mocks = vi.hoisted(async () => import('./session-mocks'));

vi.mock('$app/env', () => ({ browser: true, dev: false, building: false, version: 'test' }));
vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
vi.mock('#lib/auth/session.js', async () => (await mocks).authSessionMock);
vi.mock('#lib/auth/mfa.js', async () => ({ listFactors: (await mocks).h.listFactors }));
vi.mock('#lib/repos/profiles.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/repos/profiles.js')>()),
  fetchOwnProfile: (await mocks).h.fetchOwnProfile,
}));

type Store = typeof import('#lib/stores/session.svelte.js');

async function fresh(): Promise<Store> {
  vi.resetModules();
  return import('#lib/stores/session.svelte.js');
}

/** A store whose first read settled on the happy path (or what the test set up). */
async function started(): Promise<Store> {
  const store = await fresh();
  await store.session.ready();
  return store;
}

// Each store instance adds a visibilitychange listener; drop them between tests.
const added: Array<[string, EventListenerOrEventListenerObject]> = [];
const addListener = document.addEventListener.bind(document);

beforeEach(() => {
  happyPath();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    added.push([type, listener]);
    addListener(type, listener, options);
  });
});

afterEach(() => {
  for (const [type, listener] of added.splice(0)) document.removeEventListener(type, listener);
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

describe('the first read', () => {
  it('is loading until it settles, then ready for a staff profile at aal2', async () => {
    const { session } = await fresh();
    expect(session.status).toBe('loading');
    await session.ready();
    expect(session.status).toBe('ready');
    expect(session.user?.id).toBe(USER);
    expect(session.profile?.display_name).toBe('Ana Pérez');
    expect(session.aal).toEqual({ current: 'aal2', next: 'aal2' });
    expect(session.error).toBeNull();
    expect(h.listFactors).not.toHaveBeenCalled(); // aal2 needs no factor list
  });

  it('subscribes once and reads once, however often ready() is awaited', async () => {
    const { session } = await fresh();
    await Promise.all([session.ready(), session.ready(), session.ready()]);
    expect(h.onAuthChange).toHaveBeenCalledTimes(1);
    expect(h.getSession).toHaveBeenCalledTimes(1);
  });

  it('no session: signed out, and nothing else is asked', async () => {
    h.getSession.mockResolvedValue(ok(null));
    const { session } = await started();
    expect(session.status).toBe('signed-out');
    expect(h.fetchOwnProfile).not.toHaveBeenCalled();
  });

  it('aal1 with a verified factor: needs-mfa (fresh factor list)', async () => {
    h.getAal.mockResolvedValue(ok({ current: 'aal1', next: 'aal2' }));
    h.listFactors.mockResolvedValue(ok([{ status: 'verified' }]));
    const { session } = await started();
    expect(session.status).toBe('needs-mfa');
    expect(h.listFactors).toHaveBeenCalledTimes(1);
  });

  it('aal1 without a factor: needs-enroll', async () => {
    h.getAal.mockResolvedValue(ok({ current: 'aal1', next: 'aal1' }));
    const { session } = await started();
    expect(session.status).toBe('needs-enroll');
  });

  it('no profile, or a role outside the three: forbidden', async () => {
    h.fetchOwnProfile.mockResolvedValue(ok(null));
    expect((await started()).session.status).toBe('forbidden');
    h.fetchOwnProfile.mockResolvedValue(ok(profileFor({ role: null })));
    expect((await started()).session.status).toBe('forbidden');
  });

  it('a session read that never got an answer is an error — never a sign-out', async () => {
    h.getSession.mockResolvedValue(failure('network'));
    const { session } = await started();
    expect(session.status).toBe('error');
    expect(session.error?.kind).toBe('network');
  });

  it('a profile read that failed in transit is an error with its RepoError', async () => {
    h.fetchOwnProfile.mockResolvedValue(failure('network'));
    const { session } = await started();
    expect(session.status).toBe('error');
    expect(session.error).toEqual({ kind: 'network', message: 'copy for network', code: null });
  });

  it('retry() shows loading, then the new answer', async () => {
    h.fetchOwnProfile.mockResolvedValueOnce(failure('network'));
    const { session } = await started();
    expect(session.status).toBe('error');
    const retrying = session.retry();
    expect(session.status).toBe('loading');
    await retrying;
    expect(session.status).toBe('ready');
    expect(session.error).toBeNull();
  });
});

describe('auth events', () => {
  it('the callback stays synchronous: Supabase is asked only after it returns', async () => {
    const { session } = await started();
    const reads = h.getSession.mock.calls.length;
    emit('SIGNED_IN', sessionFor());
    expect(h.getSession).toHaveBeenCalledTimes(reads);
    await settle();
    expect(h.getSession.mock.calls.length).toBeGreaterThan(reads);
    expect(session.status).toBe('ready');
  });

  it('SIGNED_OUT the user asked for → signed-out; the scope reaches auth', async () => {
    const { session } = await started();
    h.signOut.mockImplementation(async () => {
      emit('SIGNED_OUT', null); // auth-js emits it before signOut() resolves
      return ok(undefined);
    });
    expect(await session.signOut('local')).toEqual(ok(undefined));
    expect(h.signOut).toHaveBeenCalledWith('local');
    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
    expect(session.profile).toBeNull();
  });

  it('a SIGNED_OUT nobody asked for → expired ("Tu sesión expiró")', async () => {
    const { session } = await started();
    emit('SIGNED_OUT', null);
    expect(session.status).toBe('expired');
    expect(session.user).toBeNull();
    expect(session.profile).toBeNull();
    expect(session.aal).toBeNull();
  });

  it('a SIGNED_OUT before any session loaded is just signed-out', async () => {
    h.getSession.mockResolvedValue(ok(null));
    const { session } = await started();
    emit('SIGNED_OUT', null);
    expect(session.status).toBe('signed-out');
  });

  it('signOut("others") keeps this session', async () => {
    const { session } = await started();
    await session.signOut('others');
    expect(h.signOut).toHaveBeenCalledWith('others');
    expect(session.status).toBe('ready');
  });

  it('a sign-out cancels the confirms still open (they belonged to the session)', async () => {
    const { session } = await started();
    const { confirm } = await import('#lib/stores/confirm.svelte.js');
    const answer = confirm('¿Eliminar?');
    emit('SIGNED_OUT', null);
    expect(await answer).toBe(false);
    expect(session.status).toBe('expired');
  });

  it('another account signing in elsewhere reloads the page', async () => {
    const { session } = await started();
    emit('SIGNED_IN', sessionFor('someone-else'));
    expect(h.reloadPage).toHaveBeenCalledTimes(1);
    expect(session.user?.id).toBe(USER);
  });

  it('TOKEN_REFRESHED re-reads the session and level, not the profile', async () => {
    await started();
    emit('TOKEN_REFRESHED', sessionFor(USER, 'token-2'));
    await settle();
    expect(h.getSession).toHaveBeenCalledTimes(2);
    expect(h.getAal).toHaveBeenCalledTimes(2);
    expect(h.fetchOwnProfile).toHaveBeenCalledTimes(1);
  });

  it('USER_UPDATED refetches the profile', async () => {
    const { session } = await started();
    h.fetchOwnProfile.mockResolvedValueOnce(ok(profileFor({ display_name: 'Ana P.' })));
    emit('USER_UPDATED', sessionFor());
    await settle();
    expect(h.fetchOwnProfile).toHaveBeenCalledTimes(2);
    expect(session.profile?.display_name).toBe('Ana P.');
  });

  it('MFA_CHALLENGE_VERIFIED hands Realtime the aal2 token and opens the admin', async () => {
    h.getAal.mockResolvedValue(ok({ current: 'aal1', next: 'aal2' }));
    h.listFactors.mockResolvedValue(ok([{ status: 'verified' }]));
    const { session } = await started();
    expect(session.status).toBe('needs-mfa');

    h.getAal.mockResolvedValue(ok({ current: 'aal2', next: 'aal2' }));
    emit('MFA_CHALLENGE_VERIFIED', sessionFor(USER, 'token-aal2'));
    expect(h.setRealtimeAuth).not.toHaveBeenCalled(); // deferred, never inside the callback
    await settle();
    expect(h.setRealtimeAuth).toHaveBeenCalledWith('token-aal2');
    expect(session.status).toBe('ready');
    expect(h.fetchOwnProfile).toHaveBeenCalledTimes(2); // the ministries embed reads at aal2
  });

  it('signing in again after an expiry loads everything', async () => {
    const { session } = await started();
    emit('SIGNED_OUT', null);
    expect(session.status).toBe('expired');
    emit('SIGNED_IN', sessionFor());
    await settle();
    expect(session.status).toBe('ready');
    expect(h.fetchOwnProfile).toHaveBeenCalledTimes(2);
  });

  it('a fresh aal1 session for the same user (signed in again elsewhere) drops to needs-mfa', async () => {
    const { session } = await started();
    h.getAal.mockResolvedValue(ok({ current: 'aal1', next: 'aal2' }));
    h.listFactors.mockResolvedValue(ok([{ status: 'verified' }]));
    emit('SIGNED_IN', sessionFor());
    await settle();
    expect(session.status).toBe('needs-mfa');
  });

  it('a background refresh that fails in transit keeps the page as it was', async () => {
    const { session } = await started();
    h.fetchOwnProfile.mockResolvedValueOnce(failure('network'));
    emit('USER_UPDATED', sessionFor());
    await settle();
    expect(session.status).toBe('ready');
    expect(session.profile?.display_name).toBe('Ana Pérez');
  });

  it('a background refresh that finds the access withdrawn applies it', async () => {
    const { session } = await started();
    h.fetchOwnProfile.mockResolvedValueOnce(ok(null));
    emit('USER_UPDATED', sessionFor());
    await settle();
    expect(session.status).toBe('forbidden');
  });

  it('a load overtaken by a sign-out never brings the old session back', async () => {
    const { session } = await started();
    let release: (v: unknown) => void = () => {};
    h.fetchOwnProfile.mockReturnValueOnce(new Promise((done) => (release = done)));
    const refreshing = session.refresh();
    await settle();
    emit('SIGNED_OUT', null);
    release(ok(profileFor()));
    await refreshing;
    expect(session.status).toBe('expired');
    expect(session.profile).toBeNull();
  });

  it('a read queued during the first one decides the status ready() resolves with', async () => {
    let answer: (v: unknown) => void = () => {};
    h.getSession.mockReturnValueOnce(new Promise((done) => (answer = done)));
    h.getSession.mockResolvedValue(failure('network'));
    const { session } = await fresh();
    const ready = session.ready();
    emit('TOKEN_REFRESHED', sessionFor()); // a background read, but nothing is on screen yet
    await new Promise((tick) => setTimeout(tick, 0)); // …which starts, superseding the first
    answer(ok(sessionFor()));
    await ready;
    expect(session.status).toBe('error'); // never stuck at 'loading'
  });

  it('INITIAL_SESSION is ignored (the first read covers it)', async () => {
    await started();
    emit('INITIAL_SESSION', sessionFor());
    await settle();
    expect(h.getSession).toHaveBeenCalledTimes(1);
  });
});

describe('profile refetch on a visible tab', () => {
  const visible = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('at most once a minute', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await started();
    visible();
    await settle();
    expect(h.fetchOwnProfile).toHaveBeenCalledTimes(1); // read moments ago

    now += 60_000;
    visible();
    await settle();
    expect(h.fetchOwnProfile).toHaveBeenCalledTimes(2);
  });

  it('nothing to refetch while signed out', async () => {
    h.getSession.mockResolvedValue(ok(null));
    await started();
    visible();
    await settle();
    expect(h.getSession).toHaveBeenCalledTimes(1);
  });
});

describe('settled()', () => {
  it('resolves at once when nothing is pending, after the queued read otherwise', async () => {
    const { session } = await started();
    await session.settled();
    h.fetchOwnProfile.mockResolvedValueOnce(ok(profileFor({ display_name: 'Después' })));
    emit('USER_UPDATED', sessionFor());
    await session.settled();
    expect(session.profile?.display_name).toBe('Después');
  });
});

describe('refresh()', () => {
  it('re-reads the profile behind the current page (after Mi cuenta saved)', async () => {
    const { session } = await started();
    h.fetchOwnProfile.mockResolvedValueOnce(ok(profileFor({ avatar_url: 'https://cdn/x.jpg' })));
    await session.refresh();
    expect(session.status).toBe('ready');
    expect(session.profile?.avatar_url).toBe('https://cdn/x.jpg');
  });
});

describe('guardAdmin', () => {
  const at = (path: string) => new URL(path, 'https://www.irdlex.org');

  async function redirectOf(guard: Promise<void>): Promise<string | null> {
    try {
      await guard;
      return null;
    } catch (e) {
      if (isRedirect(e)) return e.location;
      throw e;
    }
  }

  it('sends an invitation link on before reading the session', async () => {
    const { guardAdmin } = await fresh();
    const to = await redirectOf(
      guardAdmin(at('/admin/?action=accept-invite&token_hash=abc&type=invite')),
    );
    expect(to).toBe('/admin/acceso/invitacion/?action=accept-invite&token_hash=abc&type=invite');
    expect(h.getSession).not.toHaveBeenCalled();
  });

  it('a recovery link keeps its hash', async () => {
    history.replaceState(null, '', '/#error_code=otp_expired');
    const { guardAdmin } = await fresh();
    expect(await redirectOf(guardAdmin(at('/admin/?action=reset-password')))).toBe(
      '/admin/acceso/restablecer/?action=reset-password#error_code=otp_expired',
    );
  });

  it('ready: the page renders', async () => {
    const { guardAdmin } = await fresh();
    expect(await redirectOf(guardAdmin(at('/admin/cuenta/')))).toBeNull();
  });

  it('signed out: to sign in, keeping the page asked for', async () => {
    h.getSession.mockResolvedValue(ok(null));
    const { guardAdmin } = await fresh();
    expect(await redirectOf(guardAdmin(at('/admin/cuenta/?tab=seguridad')))).toBe(
      `/admin/acceso/?next=${encodeURIComponent('/admin/cuenta/?tab=seguridad')}`,
    );
  });

  it('expired: to sign in as well', async () => {
    const { guardAdmin, session } = await started();
    emit('SIGNED_OUT', null);
    expect(session.status).toBe('expired');
    expect(await redirectOf(guardAdmin(at('/admin/cuenta/')))).toBe(
      `/admin/acceso/?next=${encodeURIComponent('/admin/cuenta/')}`,
    );
  });

  it('a second factor pending: to verificar/', async () => {
    h.getAal.mockResolvedValue(ok({ current: 'aal1', next: 'aal2' }));
    h.listFactors.mockResolvedValue(ok([{ status: 'verified' }]));
    const { guardAdmin } = await fresh();
    expect(await redirectOf(guardAdmin(at('/admin/')))).toBe('/admin/acceso/verificar/');
  });

  it('no access: to sin-acceso/', async () => {
    h.fetchOwnProfile.mockResolvedValue(ok(profileFor({ role: null })));
    const { guardAdmin } = await fresh();
    expect(await redirectOf(guardAdmin(at('/admin/')))).toBe('/admin/acceso/sin-acceso/');
  });

  it('waits for the read a sign-in just queued (no bounce back to sign in)', async () => {
    h.getSession.mockResolvedValue(ok(null));
    const { guardAdmin, session } = await started();
    expect(session.status).toBe('signed-out');
    h.getSession.mockResolvedValue(ok(sessionFor()));
    emit('SIGNED_IN', sessionFor()); // the login page navigates right after this
    expect(await redirectOf(guardAdmin(at('/admin/cuenta/')))).toBeNull();
    expect(session.status).toBe('ready');
  });

  it('error: the page renders its error state with Retry — never a trip to sign in', async () => {
    h.fetchOwnProfile.mockResolvedValue(failure('network'));
    const { guardAdmin, session } = await fresh();
    expect(await redirectOf(guardAdmin(at('/admin/')))).toBeNull();
    expect(session.status).toBe('error');
  });
});
