/* ============================================================================
 * web/src/lib/stores/perms.svelte.ts — what the signed-in account may see (S38)
 * ----------------------------------------------------------------------------
 * Retires the role gating of js/pages/admin/state.js (isAdmin / isStaff) and
 * the body classes auth.js applyTabAccess() set (`is-admin`, `is-finance`,
 * `is-treasurer`). Derived from the session store through the D-006 oracle
 * (#lib/auth/surfaces): empty until the session is `ready`, so nothing is
 * shown to a session that has not passed its second factor.
 *
 *   surfaces   every surface the account may see, in nav order
 *   nav        the ones the new admin serves (`ported`) — the sidebar
 *   legacy     the ones still served by the legacy panel ("Abrir panel actual")
 *   has(key) · can('church-books' | 'notifications') · roleLabel
 *
 * UX only (PORT-DEBT S38): RLS is the guard (D-002, D-006).
 *
 * Usage:
 *   import { perms } from '#lib/stores/perms.svelte.js';
 *   {#each perms.nav as item (item.key)} … {/each}
 *   if (perms.has('discipulado')) loadPendingInterests();
 * ========================================================================== */

import {
  capabilitiesFor,
  visibleSurfacesFor,
  type Capability,
  type Surface,
  type SurfaceKey,
} from '#lib/auth/surfaces.js';
import { ROLE_LABELS } from '#lib/roles.js';
import { session } from '#lib/stores/session.svelte.js';

const profile = $derived(session.status === 'ready' ? session.profile : null);
const surfaces = $derived(visibleSurfacesFor(profile));
const keys = $derived(new Set(surfaces.map((s) => s.key)));
const capabilities = $derived(capabilitiesFor(profile));

export const perms = {
  get surfaces(): Surface[] {
    return surfaces;
  },
  get nav(): Surface[] {
    return surfaces.filter((s) => s.ported);
  },
  get legacy(): Surface[] {
    return surfaces.filter((s) => !s.ported);
  },
  has(key: SurfaceKey): boolean {
    return keys.has(key);
  },
  can(capability: Capability): boolean {
    return capabilities.has(capability);
  },
  /** The role in Spanish for the sidebar footer; '' until the session is ready. */
  get roleLabel(): string {
    return profile?.role ? ROLE_LABELS[profile.role] : '';
  },
};
