/* ============================================================================
 * web/src/lib/stores/ministries.svelte.ts — the church's ministries (S38)
 * ----------------------------------------------------------------------------
 * Retires js/pages/admin/state.js `ministries` / `setMinistries()`, which
 * auth.js bootApp filled from loadMinistries() and every tab then read
 * (names for Mi cuenta, the event form's select, the ministry filter). Loaded
 * once per signed-in account through #lib/repos/ministries — on demand, after
 * the session is ready (the list is readable at aal2 only) — and never shown
 * to another account: a different user id reads as empty until it reloads.
 *
 * A failed load is the `error` status with Retry, never an empty list
 * (PORT-DEBT S44, ADR-0004).
 *
 * Usage:
 *   import { ministries } from '#lib/stores/ministries.svelte.js';
 *   await ministries.load();
 *   ministries.status;                 // 'idle' | 'loading' | 'ready' | 'error'
 *   ministries.namesFor(profile.ministry_ids);
 * ========================================================================== */

import { fetchMinistries, type Ministry } from '#lib/repos/ministries.js';
import type { RepoError } from '#lib/repos/types.js';
import { session } from '#lib/stores/session.svelte.js';

export type MinistriesStatus = 'idle' | 'loading' | 'ready' | 'error';

let items = $state.raw<Ministry[]>([]);
let status = $state<MinistriesStatus>('idle');
let error = $state.raw<RepoError | null>(null);
/** Whose list `items` is; the getters show nothing for anyone else. */
let owner = $state<string | null>(null);
let inflight: Promise<void> | null = null;

const mine = (): boolean => owner !== null && owner === (session.user?.id ?? null);
const visible = (): Ministry[] => (mine() ? items : []);

/**
 * Load the list for the signed-in account (no-op once loaded, unless
 * `force`). Resolves when settled; never rejects.
 */
function load({ force = false }: { force?: boolean } = {}): Promise<void> {
  const uid = session.user?.id ?? null;
  if (!uid) return Promise.resolve();
  if (!force && owner === uid && status === 'ready') return Promise.resolve();
  inflight ??= (async () => {
    status = 'loading';
    error = null;
    owner = uid;
    const res = await fetchMinistries();
    if (session.user?.id !== uid) return; // signed out or switched meanwhile
    if (res.ok) {
      items = res.data;
      status = 'ready';
    } else {
      error = res.error;
      status = 'error';
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export const ministries = {
  get items(): Ministry[] {
    return visible();
  },
  get status(): MinistriesStatus {
    return mine() ? status : 'idle';
  },
  get error(): RepoError | null {
    return mine() ? error : null;
  },
  load,
  byId(id: string | null | undefined): Ministry | undefined {
    return id ? visible().find((m) => m.id === id) : undefined;
  },
  /** Names for a list of ids, in the list's order; unknown ids are skipped. */
  namesFor(ids: readonly string[] | null | undefined): string[] {
    if (!ids?.length) return [];
    const list = visible();
    return ids.flatMap((id) => list.find((m) => m.id === id)?.name ?? []);
  },
};
