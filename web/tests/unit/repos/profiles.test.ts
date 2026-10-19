// S40 — repos/profiles: the signed-in account's profile and its two
// self-service RPCs. Legacy sources: js/pages/admin/auth.js bootApp (the
// profile + ministries embed), js/pages/admin/account.js saveProfile /
// onAvatarPick / removeAvatar. Every call is staff-only: no session is an
// `auth` failure, never "no profile".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { TEST_USER_ID, mock } from './mock-client';
import { NO_SESSION, OFFLINE, RLS_DENIED, SIGNED_OUT, failure, invalidInput } from './results';
import { describeSessionGate } from './session-gate';
import * as profiles from '#lib/repos/profiles.js';
import {
  AVATAR_MAX_BYTES,
  STAFF_ROLES,
  fetchOwnProfile,
  isStaffRole,
  normalizeDisplayName,
  setAvatarUrl,
  setDisplayName,
  uploadAvatar,
} from '#lib/repos/profiles.js';

const ROW = {
  id: TEST_USER_ID,
  display_name: 'Ana Pérez',
  role: 'admin',
  allowed_tabs: ['users'],
  ministry_id: null,
  ministry_ids: [],
  preset_id: null,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  ministries: null,
};
const image = (size: number, type = 'image/jpeg'): Blob =>
  new Blob([new Uint8Array(size)], { type });

describe('repos/profiles', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('roles', () => {
    it('knows exactly the three roles profiles_role_check allows', () => {
      expect(STAFF_ROLES).toEqual(['admin', 'treasurer', 'ministry_leader']);
      for (const role of STAFF_ROLES) expect(isStaffRole(role)).toBe(true);
    });

    it.each(['pastor', 'Admin', 'admin ', '', null, undefined, 1, {}])('refuses %j', (role) => {
      expect(isStaffRole(role)).toBe(false);
    });
  });

  describe('fetchOwnProfile (auth.js bootApp)', () => {
    it('reads the own row with the ministries embed, by the session user id', async () => {
      mock.results.profiles = [{ data: ROW }];
      expect(await fetchOwnProfile()).toEqual({ ok: true, data: ROW });
      expect(mock.query().table).toBe('profiles');
      expect(mock.chain()).toEqual(['select', 'eq', 'maybeSingle']);
      expect(mock.args('select')).toEqual([
        'id,display_name,role,allowed_tabs,ministry_id,ministry_ids,preset_id,avatar_url,created_at,ministries(name,color)',
      ]);
      expect(mock.args('eq')).toEqual(['id', TEST_USER_ID]);
    });

    it('an account without a profile is a successful null (the oracle forbids it)', async () => {
      mock.results.profiles = [{ data: null }];
      expect(await fetchOwnProfile()).toEqual({ ok: true, data: null });
    });

    it('a role outside the three comes back null, so access fails closed', async () => {
      mock.results.profiles = [{ data: { ...ROW, role: 'pastor' } }];
      const res = await fetchOwnProfile();
      expect(res.ok && res.data?.role).toBeNull();
      expect(warn).toHaveBeenCalledWith('[profiles] fetchOwnProfile:', 'unrecognised role');
    });

    it('signed out is an auth failure — never "no profile" — and asks nothing', async () => {
      mock.session = SIGNED_OUT;
      const res = await fetchOwnProfile();
      expect(res).toEqual(NO_SESSION);
      expect(res).not.toEqual({ ok: true, data: null });
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed read is an error, never a null profile', async () => {
      mock.results.profiles = [OFFLINE];
      const res = await fetchOwnProfile();
      expect(res).toEqual(failure('network', 'TypeError: Failed to fetch'));
      expect(warn).toHaveBeenCalledWith(
        '[profiles] fetchOwnProfile:',
        'TypeError: Failed to fetch',
      );
    });
  });

  describe('normalizeDisplayName (admin-invite parseDisplayName rules)', () => {
    it.each([
      ['  Ana   Pérez ', 'Ana Pérez'],
      ['Ana‮Pérez', 'Ana Pérez'],
      ['Ana\nPérez', 'Ana Pérez'],
      ['Jo', 'Jo'],
      ['ñ'.repeat(80), 'ñ'.repeat(80)],
    ])('%j → %j', (raw, expected) => {
      expect(normalizeDisplayName(raw)).toBe(expected);
    });

    it.each(['', ' ', 'A', '\u0000A', 'x'.repeat(81)])('refuses %j', (raw) => {
      expect(normalizeDisplayName(raw)).toBeNull();
    });
  });

  describe('setDisplayName (account.js saveProfile → set_my_display_name)', () => {
    it('sends the normalised name and returns the one the RPC stored', async () => {
      mock.results['rpc:set_my_display_name'] = [{ data: 'Ana Pérez' }];
      expect(await setDisplayName('  Ana   Pérez ')).toEqual({ ok: true, data: 'Ana Pérez' });
      expect(mock.query().calls[0]).toEqual({
        method: 'rpc',
        args: ['set_my_display_name', { p_name: 'Ana Pérez' }],
      });
    });

    it('refuses a name out of bounds before any request', async () => {
      expect(await setDisplayName('A')).toEqual(
        invalidInput('El nombre debe tener entre 2 y 80 caracteres.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('signed out is an auth failure', async () => {
      mock.session = SIGNED_OUT;
      expect(await setDisplayName('Ana')).toEqual(NO_SESSION);
      expect(mock.queries).toHaveLength(0);
    });

    it('the aal2 refusal maps to forbidden copy, never the raw Postgres text', async () => {
      mock.results['rpc:set_my_display_name'] = [
        {
          data: null,
          error: { message: 'Esta acción requiere la verificación en dos pasos.', code: '42501' },
          status: 403,
        },
      ];
      expect(await setDisplayName('Ana')).toEqual(
        failure('forbidden', '42501: Esta acción requiere la verificación en dos pasos.'),
      );
    });
  });

  describe('uploadAvatar (account.js onAvatarPick)', () => {
    it('uploads to <uid>/avatar-<ms>.<ext> in avatars and returns the public URL', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000);
      const res = await uploadAvatar(TEST_USER_ID, image(10), 'jpg');
      now.mockRestore();
      const path = `${TEST_USER_ID}/avatar-1760000000000.jpg`;
      expect(res).toEqual({ ok: true, data: `https://cdn.test/${path}` });
      expect(mock.storage.buckets).toEqual(['avatars']);
      const [upload] = mock.storage.calls;
      expect(upload.method).toBe('upload');
      expect(upload.args[0]).toBe(path);
      expect(upload.args[2]).toEqual({
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg',
      });
    });

    it('types an untyped blob from its extension', async () => {
      await uploadAvatar(TEST_USER_ID, image(10, ''), 'png');
      const body = mock.storage.calls[0].args[1] as Blob;
      expect(body.type).toBe('image/png');
      expect(mock.storage.calls[0].args[2]).toMatchObject({ contentType: 'image/png' });
    });

    it.each([
      [
        'a user id that is not a UUID',
        'nope',
        image(10),
        'jpg',
        'No se pudo identificar tu cuenta. Recarga la página.',
      ],
      [
        'an extension the server would not serve as an image',
        TEST_USER_ID,
        image(10),
        'gif',
        'Elige una imagen JPG, PNG o WebP.',
      ],
      ['an empty file', TEST_USER_ID, image(0), 'jpg', 'Elige un archivo de imagen.'],
      [
        'a file that is not an image',
        TEST_USER_ID,
        image(10, 'application/pdf'),
        'jpg',
        'Elige un archivo de imagen.',
      ],
      [
        'a file over 5 MB',
        TEST_USER_ID,
        image(AVATAR_MAX_BYTES + 1),
        'jpg',
        'La imagen es muy grande (máx. 5 MB).',
      ],
    ] as const)('refuses %s before any request', async (_label, uid, blob, ext, message) => {
      expect(await uploadAvatar(uid, blob, ext as 'jpg')).toEqual(invalidInput(message));
      expect(mock.storage.calls).toHaveLength(0);
    });

    it('signed out is an auth failure', async () => {
      mock.session = SIGNED_OUT;
      expect(await uploadAvatar(TEST_USER_ID, image(10), 'jpg')).toEqual(NO_SESSION);
      expect(mock.storage.calls).toHaveLength(0);
    });

    it('a storage refusal is a mapped failure', async () => {
      mock.storage.uploadError = {
        message: 'new row violates row-level security policy',
        statusCode: '403',
        status: 400,
      };
      expect(await uploadAvatar(TEST_USER_ID, image(10), 'jpg')).toEqual(
        failure('forbidden', '403: new row violates row-level security policy'),
      );
    });
  });

  describe('setAvatarUrl (set_my_avatar)', () => {
    it('stores the URL', async () => {
      expect(await setAvatarUrl('https://cdn.test/a.jpg')).toEqual({ ok: true, data: undefined });
      expect(mock.query().calls[0].args).toEqual([
        'set_my_avatar',
        { p_url: 'https://cdn.test/a.jpg' },
      ]);
    });

    it('null removes the photo (the RPC stores a blank value as NULL)', async () => {
      await setAvatarUrl(null);
      expect(mock.query().calls[0].args).toEqual(['set_my_avatar', { p_url: '' }]);
    });

    it('a URL outside the own avatars folder is refused by the server as invalid', async () => {
      mock.results['rpc:set_my_avatar'] = [
        {
          data: null,
          error: { message: 'La foto debe estar en tu carpeta de avatares.', code: '22023' },
          status: 400,
        },
      ];
      expect(await setAvatarUrl('https://evil.test/x.jpg')).toEqual(
        failure('invalid', '22023: La foto debe estar en tu carpeta de avatares.'),
      );
    });

    it('signed out is an auth failure; RLS refusals stay forbidden', async () => {
      mock.session = SIGNED_OUT;
      expect(await setAvatarUrl(null)).toEqual(NO_SESSION);
      mock.reset();
      mock.results['rpc:set_my_avatar'] = [RLS_DENIED];
      expect((await setAvatarUrl(null)).ok).toBe(false);
    });
  });
  // RLS: `profiles` has no anon policy; both RPCs and the avatars bucket need
  // an aal2 session (20261019000001).
  describeSessionGate(profiles, '[profiles]', {
    staffOnly: {
      fetchOwnProfile: () => fetchOwnProfile(),
      setDisplayName: () => setDisplayName('Ana Pérez'),
      uploadAvatar: () => uploadAvatar(TEST_USER_ID, image(10), 'jpg'),
      setAvatarUrl: () => setAvatarUrl(null),
    },
    notRepoCalls: ['isStaffRole', 'normalizeDisplayName'],
  });
});
