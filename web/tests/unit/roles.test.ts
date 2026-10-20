// The one list of staff roles and their Spanish names (#lib/roles.js): the
// repo, the access oracle, Badge and the sidebar footer all read it.
import { describe, expect, it } from 'vitest';
import { ROLE_LABELS, STAFF_ROLES, isStaffRole } from '#lib/roles.js';
import { BADGE_ROLES, ROLE_BADGES } from '#lib/components/badge.js';

describe('staff roles', () => {
  it('knows exactly the three roles profiles_role_check allows', () => {
    expect(STAFF_ROLES).toEqual(['admin', 'treasurer', 'ministry_leader']);
    for (const role of STAFF_ROLES) expect(isStaffRole(role)).toBe(true);
  });

  it.each(['pastor', 'Admin', 'admin ', '', null, undefined, 1, {}])('refuses %j', (role) => {
    expect(isStaffRole(role)).toBe(false);
  });

  it('names the three roles in Spanish (legacy account.js ROLE_LABEL)', () => {
    expect(ROLE_LABELS).toEqual({
      admin: 'Administrador',
      treasurer: 'Tesorería',
      ministry_leader: 'Líder de ministerio',
    });
  });

  it('is what Badge prints — no second map', () => {
    expect(BADGE_ROLES).toEqual(STAFF_ROLES);
    for (const role of STAFF_ROLES) expect(ROLE_BADGES[role].label).toBe(ROLE_LABELS[role]);
  });
});
