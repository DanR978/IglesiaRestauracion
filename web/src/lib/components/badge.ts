/* ============================================================================
 * web/src/lib/components/badge.ts — the Badge contract (PR-C2, S14)
 * ----------------------------------------------------------------------------
 * The non-visual half of Badge.svelte. One data-driven pill retires `.role--*`,
 * `.dscp-card__status--*`, `.dscp-int__status--*`, `.dscp-int__chip--*`,
 * `statusBadge`, `cat-badge` and the always-green "Activa" literal
 * (DESIGN-SYSTEM §4.1, PORT-DEBT S14/S45/S47).
 *
 * Three kinds, one per prop that selects it (the props type makes them
 * mutually exclusive):
 *   tone   status: neutral · info · success · warn · danger, read from the
 *          honest --status-* ink/tint pairs (D-023). ALWAYS icon + label —
 *          colour is never the only cue; each tone has a distinct default glyph.
 *   role   a staff role chip. admin / treasurer / ministry_leader render three
 *          visibly different treatments (solid · outlined · tinted) plus their
 *          own glyph and Spanish label — legacy drew all three as identical
 *          slate pills (users.css:108-119).
 *   tint   a per-object colour (ministry, access preset). The value must pass
 *          `badgeTint()` — a strict hex check that also normalises it — and
 *          only then reaches the element, as the `--tint` custom property via
 *          Svelte's style: directive (escaped, never a raw style string). The
 *          label keeps the reversing --color-text ink, which stays AA on any
 *          14% tint in both themes; the colour itself paints the tint and the
 *          leading dot or glyph. An invalid colour renders a neutral badge.
 *
 * The label is always DATA: a status badge requires `label`, a role badge
 * derives it from the role (or takes `label`), a tinted badge requires it.
 *
 * Emitted names:
 *   ird-badge · ird-badge--{neutral|info|success|warn|danger}
 *   ird-badge--role · ird-badge--{admin|treasurer|ministry-leader}
 *   ird-badge--tinted · ird-badge__icon · ird-badge__dot · ird-badge__label
 *
 * Usage:
 *   import Badge from '#lib/components/Badge.svelte';
 *   <Badge tone="success" label="Activa" />
 *   <Badge tone="danger" label="Cancelado" />
 *   {#if isBadgeRole(profile.role)}<Badge role={profile.role} />{/if}
 *   <Badge tint={ministry.color} label={ministry.name} />
 * ========================================================================== */

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

export const BADGE_TONES: readonly BadgeTone[] = ['neutral', 'info', 'success', 'warn', 'danger'];

/** Default glyph per tone — distinct shapes, so the tone reads without colour. */
export const BADGE_TONE_ICONS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'circle-minus',
  info: 'circle-info',
  success: 'circle-check',
  warn: 'triangle-exclamation',
  danger: 'circle-xmark',
};

/** The staff roles `profiles.role` allows (baseline CHECK constraint). */
export type BadgeRole = 'admin' | 'treasurer' | 'ministry_leader';

export const BADGE_ROLES: readonly BadgeRole[] = ['admin', 'treasurer', 'ministry_leader'];

/** Spanish label + glyph per role — the account and users screens read the same words. */
export const ROLE_BADGES: Readonly<Record<BadgeRole, { label: string; icon: string }>> = {
  admin: { label: 'Administrador', icon: 'user-shield' },
  treasurer: { label: 'Tesorería', icon: 'coins' },
  ministry_leader: { label: 'Líder de ministerio', icon: 'people-group' },
};

export function isBadgeRole(value: unknown): value is BadgeRole {
  return typeof value === 'string' && (BADGE_ROLES as readonly string[]).includes(value);
}

/** The class modifier for a role (`ministry_leader` → `ministry-leader`). */
export function roleModifier(role: BadgeRole): string {
  return role.replace(/_/g, '-');
}

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The only way a per-object colour reaches a Badge: `#rgb` / `#rrggbb` (any
 * case, surrounding space ignored) comes back as lower-case `#rrggbb`; anything
 * else — a name, rgb(), a url(), a `;`-smuggled declaration — comes back null.
 */
export function badgeTint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const colour = value.trim();
  if (!HEX_COLOUR.test(colour)) return null;
  const digits = colour.slice(1).toLowerCase();
  if (digits.length === 6) return `#${digits}`;
  return `#${[...digits].map((d) => d + d).join('')}`;
}

/** The BEM block every Badge emits. */
export const BADGE_BLOCK = 'ird-badge';

interface BadgeCommon {
  /** Font Awesome solid glyph, replacing the default one (decorative: the label names it). */
  icon?: string;
  class?: string;
}

/** A status pill: tone + label (+ the tone's glyph). */
export interface StatusBadgeProps extends BadgeCommon {
  /** The visible words. Required — never a template literal independent of data. */
  label: string;
  tone?: BadgeTone;
  role?: never;
  tint?: never;
}

/** A staff role chip. The label defaults to the role's Spanish name. */
export interface RoleBadgeProps extends BadgeCommon {
  role: BadgeRole;
  label?: string;
  tone?: never;
  tint?: never;
}

/** A per-object colour chip (ministry, access preset). */
export interface TintedBadgeProps extends BadgeCommon {
  /** A hex colour from the record; validated by `badgeTint`, neutral when it fails. */
  tint: string | null | undefined;
  label: string;
  tone?: never;
  role?: never;
}

export type BadgeProps = StatusBadgeProps | RoleBadgeProps | TintedBadgeProps;
