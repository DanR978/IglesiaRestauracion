/* ============================================================================
 * web/src/lib/components/admin/account/account.ts — Mi cuenta's pure half (S45)
 * ----------------------------------------------------------------------------
 * What the account components share and the tests pin without mounting
 * anything: the three sections and their URL state (`?seccion=`, D-036), the
 * dates, the role and ministries of the facts, the avatar file check, the
 * sign-in methods read from the auth user's identities, the two-factor
 * devices, the new-password check and the password errors GoTrue reports by
 * code. Retires the helpers of js/pages/admin/account.js — fmtDate,
 * fmtDateTime, roleLabel, ministryNames — and its inline copy; usernameHandle
 * and the time zone / language lookups go with the fabricated fields they fed
 * (PORT-DEBT S45).
 *
 * Usage:
 *   import { sectionFrom, signInMethods, passwordFieldError } from '#lib/components/admin/account/account.js';
 *   const current = sectionFrom(page.url.searchParams.get(SECTION_PARAM));
 * ========================================================================== */

import type { SectionNavItem } from '#lib/components/section-nav.js';
import { scorePassword } from '#lib/components/password-field.js';
import type { Factor } from '#lib/auth/mfa.js';
import { AVATAR_MAX_BYTES, type OwnProfile } from '#lib/repos/profiles.js';
import { ROLE_LABELS } from '#lib/roles.js';
import type { SessionUser } from '#lib/stores/session.svelte.js';

/* ── Sections ──────────────────────────────────────────────────────────── */

export const ACCOUNT_SECTIONS = [
  { id: 'perfil', label: 'Perfil', icon: 'id-card' },
  { id: 'seguridad', label: 'Seguridad', icon: 'shield-halved' },
  { id: 'preferencias', label: 'Preferencias', icon: 'sliders' },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]['id'];

/** The query parameter that holds the open section (a link or Back restores it). */
export const SECTION_PARAM = 'seccion';
export const DEFAULT_SECTION: AccountSectionId = 'perfil';

const SECTION_IDS: readonly string[] = ACCOUNT_SECTIONS.map((s) => s.id);

/** The section a `?seccion=` value names; anything else is Perfil. */
export function sectionFrom(value: string | null | undefined): AccountSectionId {
  return value && SECTION_IDS.includes(value) ? (value as AccountSectionId) : DEFAULT_SECTION;
}

/** A link to a section of this page: only the query changes, so it is a same-page navigation. */
export function sectionHref(id: AccountSectionId): string {
  return `?${SECTION_PARAM}=${id}`;
}

/** SectionNav in link mode. */
export const SECTION_NAV_ITEMS: SectionNavItem[] = ACCOUNT_SECTIONS.map((s) => ({
  id: s.id,
  label: s.label,
  icon: s.icon,
  href: sectionHref(s.id),
}));

/* ── Dates ─────────────────────────────────────────────────────────────── */

const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "19 de octubre de 2026" in the viewer's time zone; null for a missing or broken value. */
export function formatDate(value: string | null | undefined): string | null {
  const date = parseDate(value);
  return date ? DATE.format(date) : null;
}

/** "19 oct 2026, 14:05" in the viewer's time zone; null for a missing or broken value. */
export function formatDateTime(value: string | null | undefined): string | null {
  const date = parseDate(value);
  return date ? DATE_TIME.format(date) : null;
}

/* ── Facts ─────────────────────────────────────────────────────────────── */

/** The role to show: the access preset's name when the account may read it, else the role. */
export function roleName(profile: Pick<OwnProfile, 'role' | 'role_presets'>): string | null {
  const preset = profile.role_presets?.name?.trim();
  if (preset) return preset;
  return profile.role ? ROLE_LABELS[profile.role] : null;
}

/** Every ministry the account leads: `ministry_ids`, plus the legacy single `ministry_id`. */
export function ministryIdsOf(profile: Pick<OwnProfile, 'ministry_ids' | 'ministry_id'>): string[] {
  const ids = [...(profile.ministry_ids ?? []), profile.ministry_id].filter(
    (id): id is string => typeof id === 'string' && id !== '',
  );
  return [...new Set(ids)];
}

/* ── Avatar ────────────────────────────────────────────────────────────── */

/** What the file picker offers; the check below is what decides. */
export const AVATAR_ACCEPT = 'image/*';

/** Why a picked file can't be a photo, in Spanish; null when it can be tried. */
export function avatarFileProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!file.type.startsWith('image/')) return 'Elige un archivo de imagen (JPG, PNG o WebP).';
  if (file.size === 0) return 'Ese archivo está vacío. Elige otra imagen.';
  if (file.size > AVATAR_MAX_BYTES) return 'La imagen es muy grande (máx. 5 MB).';
  return null;
}

/* ── Sign-in methods ───────────────────────────────────────────────────── */

type Identity = NonNullable<SessionUser['identities']>[number];

export interface SignInMethod {
  /** The identity's id — stable for an {#each} key. */
  key: string;
  label: string;
  icon: string;
  iconSet: 'fas' | 'fab';
  /** When this method was last used to sign in (ISO), if GoTrue says. */
  lastUsed: string | null;
  /** When it was linked to the account (ISO). */
  linkedAt: string | null;
}

const PROVIDERS: Readonly<
  Record<string, { label: string; icon: string; iconSet: 'fas' | 'fab'; order: number }>
> = {
  email: { label: 'Correo y contraseña', icon: 'envelope', iconSet: 'fas', order: 0 },
  google: { label: 'Google', icon: 'google', iconSet: 'fab', order: 1 },
  azure: { label: 'Microsoft', icon: 'microsoft', iconSet: 'fab', order: 2 },
};
// A provider this app does not offer is still shown, never by its raw name.
const OTHER = {
  label: 'Otro proveedor',
  icon: 'right-to-bracket',
  iconSet: 'fas',
  order: 3,
} as const;

/** The account's sign-in methods, password first, then Google, then Microsoft. */
export function signInMethods(identities: readonly Identity[] | null | undefined): SignInMethod[] {
  return (identities ?? [])
    .map((identity) => ({ identity, kind: PROVIDERS[identity.provider] ?? OTHER }))
    .sort((a, b) => a.kind.order - b.kind.order)
    .map(({ identity, kind }) => ({
      key: identity.identity_id || identity.id,
      label: kind.label,
      icon: kind.icon,
      iconSet: kind.iconSet,
      lastUsed: identity.last_sign_in_at ?? null,
      linkedAt: identity.created_at ?? null,
    }));
}

/**
 * Whether the account signs in with its email (and may have a password). The
 * identities decide; without them, the providers GoTrue records; without
 * those, yes — every account here starts as an email invitation.
 */
export function hasEmailIdentity(user: Pick<SessionUser, 'identities' | 'app_metadata'>): boolean {
  if (Array.isArray(user.identities) && user.identities.length > 0) {
    return user.identities.some((identity) => identity.provider === 'email');
  }
  const providers: unknown = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.length > 0) return providers.includes('email');
  return true;
}

/* ── Two-factor devices ────────────────────────────────────────────────── */

/** The factors that pass the gate, oldest first. Half-finished enrollments are not devices. */
export function verifiedFactors(factors: readonly Factor[]): Factor[] {
  return factors
    .filter((factor) => factor.status === 'verified')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

export function deviceName(factor: Pick<Factor, 'friendly_name'>): string {
  return factor.friendly_name?.trim() || 'Dispositivo sin nombre';
}

/** Two-factor is required (D-033): a device may go only while another one stays. */
export function canRemoveDevice(verifiedCount: number): boolean {
  return verifiedCount >= 2;
}

/** The TOTP secret in blocks of four, for reading it into an app by hand. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

const SVG_DATA_URL = /^data:image\/svg\+xml(?:;[^,]*)?,/i;

/**
 * The QR as an <img> src. auth-js hands GoTrue's raw SVG markup behind a
 * `data:image/svg+xml;utf-8,` prefix; a `#` in that markup would cut the URL
 * short, so raw markup is percent-encoded (an encoded or base64 payload is
 * left alone). Anything that is not an SVG data URL is refused (null): only
 * the secret is shown then.
 */
export function qrImageSrc(qrCode: string | null | undefined): string | null {
  if (!qrCode || !SVG_DATA_URL.test(qrCode)) return null;
  const payload = qrCode.slice(qrCode.indexOf(',') + 1);
  if (!payload.includes('<')) return qrCode;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(payload)}`;
}

/* ── Passwords ─────────────────────────────────────────────────────────── */

/** bcrypt reads 72 bytes and GoTrue refuses longer (#lib/auth/session PASSWORD_MAX_BYTES). */
const PASSWORD_MAX_BYTES = 72;

/** What is wrong with a new password before it is sent, in Spanish; null when it may go. */
export function newPasswordProblem(password: string): string | null {
  if (password === '') return 'Escribe la nueva contraseña.';
  const score = scorePassword(password);
  if (score.reason === 'short') return 'La contraseña debe tener al menos 8 caracteres.';
  if (score.reason === 'predictable') {
    return 'Esa contraseña es fácil de adivinar. Evita palabras comunes, fechas, repeticiones y secuencias.';
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return 'La contraseña es demasiado larga. Usa como máximo 72 caracteres.';
  }
  return null;
}

export type PasswordFieldKey = 'current' | 'next';

/** The refusals GoTrue reports by code that belong under one field, not in a toast. */
export const PASSWORD_FIELD_ERRORS: Readonly<
  Record<string, { field: PasswordFieldKey; message: string }>
> = {
  current_password_required: { field: 'current', message: 'Escribe tu contraseña actual.' },
  current_password_invalid: { field: 'current', message: 'La contraseña actual no es correcta.' },
  same_password: {
    field: 'next',
    message: 'La nueva contraseña debe ser distinta de la actual.',
  },
  weak_password: {
    field: 'next',
    message:
      'Esa contraseña no es lo bastante segura. Usa al menos 8 caracteres y evita las contraseñas conocidas o fáciles de adivinar.',
  },
};

/** The field a refused password change points at, or null when it is not a field's fault. */
export function passwordFieldError(
  code: string | null | undefined,
): { field: PasswordFieldKey; message: string } | null {
  return (code && PASSWORD_FIELD_ERRORS[code]) || null;
}
