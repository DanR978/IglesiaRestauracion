/* ============================================================================
 * web/src/lib/repos/profiles.ts — the signed-in account's own profile (S40)
 * ----------------------------------------------------------------------------
 * The profile reads and writes the legacy admin ran inline:
 * js/pages/admin/auth.js bootApp (`profiles.select('*, ministries(name,color)')`)
 * and js/pages/admin/account.js (`set_my_display_name`, `set_my_avatar`, the
 * `avatars` upload). Reads return a `ReadResult`, writes a `WriteResult`
 * (ADR-0004); failures log under `[profiles]`.
 *
 * Every call is staff-only and checks the session first (./session): with no
 * session the anon key reads no profile, which would pass for "this account
 * has none". The role is narrowed to `StaffRole`; a value outside the three
 * the `profiles_role_check` constraint allows comes back as `null`, so the
 * access oracle fails closed (D-006).
 *
 * `profiles` takes no client writes (20261019000001, D-034): the two
 * SECURITY DEFINER RPCs below are the only way an account edits itself, and
 * both need a two-step-verified session (aal2). `set_my_avatar` accepts only
 * the public URL of an object in the caller's own folder of this project's
 * `avatars` bucket, named like `uploadAvatar` names it (`avatar_url_is_valid`).
 *
 * Usage:
 *   import { fetchOwnProfile, uploadAvatar, setAvatarUrl } from '#lib/repos/profiles.js';
 *   const me = await fetchOwnProfile();
 *   if (me.ok && me.data) greet(me.data.display_name);
 *   const up = await uploadAvatar(user.id, jpeg, 'jpg');
 *   const saved = up.ok ? await setAvatarUrl(up.data) : up;
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import type { Tables } from '#lib/db/database.types.js';
import { isStaffRole, type StaffRole } from '#lib/roles.js';
import { fail, invalid, ok } from './errors';
import { requireSession, requireUserId } from './session';
import type { ReadResult, WriteResult } from './types';

const TAG = '[profiles]';

export type ProfileRow = Tables<'profiles'>;
export type ProfileMinistry = Pick<Tables<'ministries'>, 'name' | 'color'>;
export type ProfilePreset = Pick<Tables<'role_presets'>, 'name'>;

/**
 * The signed-in account's row. `ministries` is the legacy single
 * `ministry_id`'s name and colour (null at aal1: `ministries` is read at aal2
 * only); `ministry_ids` lists every ministry a leader leads. `role_presets`
 * is the access preset's name (S45 Mi cuenta: "Desarrollador" says more than
 * "Administrador") — RLS lets only admins read presets, so it is null for
 * everyone else, and at aal1.
 */
export type OwnProfile = Omit<ProfileRow, 'role'> & {
  /** null when the stored role is not one of STAFF_ROLES (#lib/roles.js). */
  role: StaffRole | null;
  ministries: ProfileMinistry | null;
  role_presets: ProfilePreset | null;
};

/** The signed-in account's profile; `data: null` when the account has none. */
export async function fetchOwnProfile(): Promise<ReadResult<OwnProfile | null>> {
  const me = await requireUserId(TAG, 'fetchOwnProfile');
  if (!me.ok) return me;
  const { data, error, status } = await supabase
    .from('profiles')
    .select(
      'id,display_name,role,allowed_tabs,ministry_id,ministry_ids,preset_id,avatar_url,created_at,ministries(name,color),role_presets(name)',
    )
    .eq('id', me.data)
    .maybeSingle();
  if (error) return fail(TAG, 'fetchOwnProfile', error, status);
  if (!data) return ok(null);
  if (!isStaffRole(data.role)) console.warn(`${TAG} fetchOwnProfile:`, 'unrecognised role');
  return ok({ ...data, role: isStaffRole(data.role) ? data.role : null });
}

/* ── Display name ──────────────────────────────────────────────────────── */

export const DISPLAY_NAME_LENGTH = { min: 2, max: 80 } as const;

// Control and bidirectional-formatting characters never belong in a name shown
// in the panel or the activity log — the rule admin-invite applies to invites.
const UNSAFE_NAME_CHARS = /[\p{Cc}\p{Bidi_Control}]/gu;

/**
 * The name as it will be stored: unsafe characters out, whitespace collapsed,
 * 2–80 characters (counted as typed); `null` when it does not fit.
 */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.replace(UNSAFE_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  return length >= DISPLAY_NAME_LENGTH.min && length <= DISPLAY_NAME_LENGTH.max ? name : null;
}

/** Change the signed-in account's display name; `data` is the name as stored. */
export async function setDisplayName(name: string): Promise<WriteResult<string>> {
  const denied = await requireSession(TAG, 'setDisplayName');
  if (denied) return denied;
  const clean = normalizeDisplayName(name);
  if (clean === null) return invalid('El nombre debe tener entre 2 y 80 caracteres.');
  const { data, error, status } = await supabase.rpc('set_my_display_name', { p_name: clean });
  if (error) return fail(TAG, 'setDisplayName', error, status);
  return ok(data || clean);
}

/* ── Avatar ────────────────────────────────────────────────────────────── */

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export type AvatarExtension = (typeof AVATAR_EXTENSIONS)[number];
/** The legacy uploader's limit (account.js onAvatarPick). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upload an (already optimised) image to `<userId>/avatar-<ms>.<ext>` in the
 * `avatars` bucket and return its public URL — the one shape `set_my_avatar`
 * accepts. Storage RLS only lets an account write its own folder, so `userId`
 * is the signed-in user's id. A new name per upload: nothing is overwritten.
 */
export async function uploadAvatar(
  userId: string,
  image: Blob,
  ext: AvatarExtension,
): Promise<WriteResult<string>> {
  const denied = await requireSession(TAG, 'uploadAvatar');
  if (denied) return denied;
  if (!UUID.test(userId)) return invalid('No se pudo identificar tu cuenta. Recarga la página.');
  if (!(AVATAR_EXTENSIONS as readonly string[]).includes(ext)) {
    return invalid('Elige una imagen JPG, PNG o WebP.');
  }
  if (image.size === 0 || (image.type && !image.type.startsWith('image/'))) {
    return invalid('Elige un archivo de imagen.');
  }
  if (image.size > AVATAR_MAX_BYTES) return invalid('La imagen es muy grande (máx. 5 MB).');

  const contentType = image.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  // storage-js sends a Blob as a multipart part typed by the Blob itself.
  const body = image.type ? image : new Blob([image], { type: contentType });
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { error } = await bucket.upload(path, body, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  });
  if (error) return fail(TAG, 'uploadAvatar', error);
  return ok(bucket.getPublicUrl(path).data.publicUrl);
}

/** Point the profile at an uploaded avatar (`uploadAvatar`'s URL), or `null` to remove it. */
export async function setAvatarUrl(url: string | null): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'setAvatarUrl');
  if (denied) return denied;
  // The RPC stores a blank value as NULL: '' removes the photo.
  const { error, status } = await supabase.rpc('set_my_avatar', { p_url: url ?? '' });
  if (error) return fail(TAG, 'setAvatarUrl', error, status);
  return ok(undefined);
}
