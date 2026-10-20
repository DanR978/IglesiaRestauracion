// S38 — perms (the D-006 oracle over the live session) and the ministries
// store. perms is empty until the session is `ready`: nothing shows to a
// session that has not passed its second factor. The ministries list is
// loaded per account and a failure is an error state, never an empty list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emit, failure, h, happyPath, ok, profileFor, sessionFor } from './session-mocks';

const mocks = vi.hoisted(async () => import('./session-mocks'));

vi.mock('$app/env', () => ({ browser: true, dev: false, building: false, version: 'test' }));
vi.mock('#lib/db/client.js', () => ({ supabase: {} }));
vi.mock('#lib/auth/session.js', async () => (await mocks).authSessionMock);
vi.mock('#lib/auth/mfa.js', async () => ({ listFactors: (await mocks).h.listFactors }));
vi.mock('#lib/repos/profiles.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/repos/profiles.js')>()),
  fetchOwnProfile: (await mocks).h.fetchOwnProfile,
}));
vi.mock('#lib/repos/ministries.js', async () => ({
  fetchMinistries: (await mocks).h.fetchMinistries,
}));

async function fresh() {
  vi.resetModules();
  const { session } = await import('#lib/stores/session.svelte.js');
  const { perms } = await import('#lib/stores/perms.svelte.js');
  const { ministries } = await import('#lib/stores/ministries.svelte.js');
  return { session, perms, ministries };
}

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
});

describe('perms', () => {
  it('is empty while loading', async () => {
    const { perms } = await fresh();
    expect(perms.surfaces).toEqual([]);
    expect(perms.has('inicio')).toBe(false);
    expect(perms.roleLabel).toBe('');
  });

  it('a Desarrollador sees every surface; the nav lists the ported ones', async () => {
    h.fetchOwnProfile.mockResolvedValue(
      ok(profileFor({ allowed_tabs: ['ministries', 'users', 'activity', 'settings'] })),
    );
    const { session, perms } = await fresh();
    await session.ready();
    expect(perms.surfaces).toHaveLength(14);
    expect(perms.nav.map((s) => s.key)).toEqual(['inicio', 'cuenta']);
    expect(perms.legacy.map((s) => s.key)).not.toContain('inicio');
    expect(perms.has('users')).toBe(true);
    expect(perms.can('church-books')).toBe(true);
    expect(perms.can('notifications')).toBe(true);
    expect(perms.roleLabel).toBe('Administrador');
  });

  it('a treasurer: church books, never registrations or discipulado', async () => {
    h.fetchOwnProfile.mockResolvedValue(ok(profileFor({ role: 'treasurer' })));
    const { session, perms } = await fresh();
    await session.ready();
    expect(perms.has('treasury')).toBe(true);
    expect(perms.can('church-books')).toBe(true);
    expect(perms.has('special-events')).toBe(false);
    expect(perms.has('discipulado')).toBe(false);
    expect(perms.can('notifications')).toBe(false);
    expect(perms.roleLabel).toBe('Tesorería');
  });

  it('nothing for a session that has not passed its second factor', async () => {
    h.getAal.mockResolvedValue(ok({ current: 'aal1', next: 'aal2' }));
    h.listFactors.mockResolvedValue(ok([{ status: 'verified' }]));
    const { session, perms } = await fresh();
    await session.ready();
    expect(session.status).toBe('needs-mfa');
    expect(session.profile).not.toBeNull();
    expect(perms.surfaces).toEqual([]);
    expect(perms.can('church-books')).toBe(false);
  });

  it('follows the session: emptied by a sign-out', async () => {
    const { session, perms } = await fresh();
    await session.ready();
    expect(perms.has('analytics')).toBe(true);
    emit('SIGNED_OUT', null);
    expect(perms.surfaces).toEqual([]);
  });
});

describe('ministries', () => {
  const LIST = [
    { id: 'm-1', name: 'Alabanza', color: '#345a65', created_at: null },
    { id: 'm-2', name: 'Jóvenes', color: null, created_at: null },
  ];

  it('loads once for the signed-in account', async () => {
    h.fetchMinistries.mockResolvedValue(ok(LIST));
    const { session, ministries } = await fresh();
    await session.ready();
    expect(ministries.status).toBe('idle');
    await ministries.load();
    await ministries.load();
    expect(h.fetchMinistries).toHaveBeenCalledTimes(1);
    expect(ministries.status).toBe('ready');
    expect(ministries.items).toEqual(LIST);
    expect(ministries.byId('m-2')?.name).toBe('Jóvenes');
    expect(ministries.namesFor(['m-2', 'gone', 'm-1'])).toEqual(['Jóvenes', 'Alabanza']);
    await ministries.load({ force: true });
    expect(h.fetchMinistries).toHaveBeenCalledTimes(2);
  });

  it('a failed load is the error state, never an empty list', async () => {
    h.fetchMinistries.mockResolvedValue(failure('network'));
    const { session, ministries } = await fresh();
    await session.ready();
    await ministries.load();
    expect(ministries.status).toBe('error');
    expect(ministries.error?.kind).toBe('network');
    expect(ministries.items).toEqual([]);
  });

  it('signed out it asks nothing', async () => {
    h.getSession.mockResolvedValue(ok(null));
    const { session, ministries } = await fresh();
    await session.ready();
    await ministries.load();
    expect(h.fetchMinistries).not.toHaveBeenCalled();
    expect(ministries.status).toBe('idle');
  });

  it('never shows one account the list it loaded for another', async () => {
    h.fetchMinistries.mockResolvedValue(ok(LIST));
    const { session, ministries } = await fresh();
    await session.ready();
    await ministries.load();
    emit('SIGNED_OUT', null);
    expect(ministries.items).toEqual([]);
    expect(ministries.status).toBe('idle');
    expect(ministries.namesFor(['m-1'])).toEqual([]);
    h.getSession.mockResolvedValue(ok(sessionFor('u-2')));
    emit('SIGNED_IN', sessionFor('u-2'));
    await vi.waitFor(() => expect(session.user?.id).toBe('u-2'));
    expect(ministries.items).toEqual([]);
  });
});
