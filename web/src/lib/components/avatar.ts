/* ============================================================================
 * web/src/lib/components/avatar.ts — the Avatar contract (PR-C2, S13/S14)
 * ----------------------------------------------------------------------------
 * The non-visual half of Avatar.svelte: sizes, the BEM block and the photo-URL
 * check. Retires `paintAvatar` (account.js) and `avatarCell` (users.js), which
 * painted the photo as `style="background-image:url('${url}')"` — a stored
 * string inside a style attribute, which PR-B's set_my_avatar now constrains
 * on the server. The port never builds a style string from a URL: the photo
 * is an <img> whose src passed `avatarSrc()`, and the initials come from the
 * one shared algorithm in #lib/initials.
 *
 * Emitted names:
 *   ird-avatar · ird-avatar--{24|36|48|96} · ird-avatar__fallback · ird-avatar__img
 *
 * Usage:
 *   import Avatar from '#lib/components/Avatar.svelte';
 *   <Avatar name={profile.display_name} src={profile.avatar_url} decorative />  beside the name
 *   <Avatar name={actor.name} src={actor.avatar_url} size={24} />              alone: alt = name
 * ========================================================================== */

/** The four sizes in CSS px: 24 (inline/actor), 36 (sidebar, rows), 48 (cards), 96 (account). */
export type AvatarSize = 24 | 36 | 48 | 96;

export const AVATAR_SIZES: readonly AvatarSize[] = [24, 36, 48, 96];

/** The BEM block every Avatar emits. */
export const AVATAR_BLOCK = 'ird-avatar';

/**
 * Which photo URLs an avatar may load: http(s), a root-relative path, `blob:`
 * (an upload preview) and raster/SVG `data:image/…`. Anything else — a
 * `javascript:` URL, a protocol-relative `//host`, a bare word — is refused and
 * the avatar shows initials. Returns the trimmed URL, or null.
 */
export function avatarSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const src = value.trim();
  if (src === '') return null;
  return /^(?:https?:\/\/|\/(?!\/)|blob:|data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,])/i.test(
    src,
  )
    ? src
    : null;
}
