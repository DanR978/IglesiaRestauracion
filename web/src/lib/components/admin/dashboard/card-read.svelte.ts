/* ============================================================================
 * web/src/lib/components/admin/dashboard/card-read.svelte.ts — one card's data (S41)
 * ----------------------------------------------------------------------------
 * Every Inicio card loads on its own and renders its own state from its own
 * ReadResult (DESIGN-SYSTEM §5, ADR-0004): `result` is null until the first
 * answer (→ StateLoading), then the last answer (→ content, StateEmpty or
 * StateError + Retry). Legacy loaded the whole page in one Promise.all, so
 * one failed count blanked every card.
 *
 *   · The newest load wins: an older one still in flight is ignored.
 *   · A background refresh (the tab back in view) that fails keeps the last
 *     good answer on screen, as the session store does — waking a phone is
 *     not a reason to swap real figures for an error. A card already showing
 *     an error takes whatever the refresh brings.
 *   · A load that throws is a bug (repos never throw): logged, and shown as
 *     the generic error with Retry rather than a card stuck loading.
 *
 * Usage:
 *   const events = new CardRead('events', () => fetchNextCalendarEvents(6));
 *   void events.load();                       // first load; Retry returns this promise
 *   void events.load({ background: true });   // refresh behind the content
 *   events.result;                            // null | ReadResult<T>
 * ========================================================================== */

import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
import type { ReadResult } from '#lib/repos/types.js';

export class CardRead<T> {
  /** null until the first answer; then the latest answer that applies. */
  result = $state.raw<ReadResult<T> | null>(null);

  readonly #name: string;
  readonly #run: () => Promise<ReadResult<T>>;
  #generation = 0;
  #started = false;

  constructor(name: string, run: () => Promise<ReadResult<T>>) {
    this.#name = name;
    this.#run = run;
  }

  /** Whether a load was ever asked for (not reactive). */
  get started(): boolean {
    return this.#started;
  }

  async load({ background = false }: { background?: boolean } = {}): Promise<void> {
    this.#started = true;
    const generation = ++this.#generation;
    let next: ReadResult<T>;
    try {
      next = await this.#run();
    } catch (error) {
      console.error(`[inicio] ${this.#name}:`, error);
      next = { ok: false, error: { kind: 'unknown', message: REPO_ERROR_MESSAGES.unknown } };
    }
    if (generation !== this.#generation) return;
    if (background && !next.ok && this.result?.ok) return;
    this.result = next;
  }
}
