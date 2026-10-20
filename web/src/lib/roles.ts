/* ============================================================================
 * web/src/lib/roles.ts — the staff roles and their Spanish names
 * ----------------------------------------------------------------------------
 * `profiles.role` is one of three values (the baseline's profiles_role_check;
 * legacy js/pages/admin/state.js). The repo narrows it, the access oracle
 * gates on it, and Badge and the sidebar footer print it — from this one list
 * and one label map, so the words can't drift apart (legacy users.js said
 * "Tesorero" where account.js said "Tesorería").
 *
 * Usage:
 *   import { ROLE_LABELS, isStaffRole } from '#lib/roles.js';
 *   const label = isStaffRole(profile.role) ? ROLE_LABELS[profile.role] : '';
 * ========================================================================== */

export const STAFF_ROLES = ['admin', 'treasurer', 'ministry_leader'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

/** The role in Spanish (legacy account.js ROLE_LABEL). */
export const ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  admin: 'Administrador',
  treasurer: 'Tesorería',
  ministry_leader: 'Líder de ministerio',
};
