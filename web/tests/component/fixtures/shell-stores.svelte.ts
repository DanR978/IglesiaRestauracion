/* ============================================================================
 * web/tests/component/fixtures/shell-stores.svelte.ts — the S38 stores, as the shell sees them
 * ----------------------------------------------------------------------------
 * AdminShell reads `session` (status, user, profile, error, signOut, retry)
 * and `perms` (nav, legacy, roleLabel). These stand-ins are runes state a
 * test sets directly — the shell follows as it follows the real stores —
 * with spies for the two calls it makes.
 *
 * Usage (top of a test file):
 *   const stores = vi.hoisted(async () => import('./fixtures/shell-stores.svelte'));
 *   vi.mock('#lib/stores/session.svelte.js', async () => (await stores).sessionModule);
 *   vi.mock('#lib/stores/perms.svelte.js', async () => (await stores).permsModule);
 *   beforeEach(() => resetShell({ nav, legacy }));
 * ========================================================================== */
import { vi } from 'vitest';
import type { Surface } from '#lib/auth/surfaces.js';
import type { SessionStatus } from '#lib/stores/session.svelte.js';

interface ShellState {
  status: SessionStatus;
  user: { id: string; email?: string } | null;
  profile: { display_name: string | null; avatar_url: string | null } | null;
  error: { kind: string; message: string } | null;
  nav: Surface[];
  legacy: Surface[];
  roleLabel: string;
}

export const shell = $state<ShellState>({
  status: 'ready',
  user: null,
  profile: null,
  error: null,
  nav: [],
  legacy: [],
  roleLabel: '',
});

type SignOutResult =
  { ok: true; data: undefined } | { ok: false; error: { kind: string; message: string } };

export const signOut = vi.fn<(scope: 'local' | 'global' | 'others') => Promise<SignOutResult>>(
  async () => ({ ok: true, data: undefined }),
);
export const retry = vi.fn(async () => {});

export const sessionModule = {
  session: {
    get status() {
      return shell.status;
    },
    get user() {
      return shell.user;
    },
    get profile() {
      return shell.profile;
    },
    get error() {
      return shell.error;
    },
    signOut,
    retry,
  },
};

export const permsModule = {
  perms: {
    get nav() {
      return shell.nav;
    },
    get legacy() {
      return shell.legacy;
    },
    get roleLabel() {
      return shell.roleLabel;
    },
  },
};

/** A signed-in admin at aal2 (Ana Pérez), with the surfaces given. */
export function resetShell({ nav, legacy }: { nav: Surface[]; legacy: Surface[] }): void {
  shell.status = 'ready';
  shell.user = { id: 'u-1', email: 'ana@example.org' };
  shell.profile = { display_name: 'Ana Pérez', avatar_url: null };
  shell.error = null;
  shell.nav = nav;
  shell.legacy = legacy;
  shell.roleLabel = 'Administrador';
  signOut.mockReset();
  signOut.mockImplementation(async () => ({ ok: true as const, data: undefined }));
  retry.mockReset();
  retry.mockImplementation(async () => {});
}
