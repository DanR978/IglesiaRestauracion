# ADR-0004 — Data-layer results distinguish an error from an empty result

- **Status:** Accepted on merge of this change (2026-10-18)
- **Ledger:** D-032 (`MIGRATION.md` §2)
- **Supersedes, for `web/` only:**
  - the "locked here for S40/S52" read rule in the `web/src/lib/repos/types.ts` header;
  - the repo-signature item in `docs/migration/ROADMAP.md` "Foundations to freeze early";
  - the root `CLAUDE.md` §5 repo contract, which stays the rule for legacy code.

## Context

Today a port read **never throws and returns a safe empty** (`[]` / `null`) on failure. Writes
return `{ ok: false, error }` where `error` is the raw Supabase message, "ready for toast"
(`web/src/lib/repos/types.ts`). That contract conflicts with the port's own spec and with the
mobile requirements:

- `docs/migration/DESIGN-SYSTEM.md` §5.3 requires every error state to show human Spanish copy
  (never `error.message`), a **Retry** button, and to be **visually distinct from empty**. It names
  the legacy bug "a *failed* fetch into the neutral empty state (gallery `fetchAlbums` returns `[]` on
  error". A read that returns `[]` on failure makes that spec impossible to honor.
- `docs/migration/PORT-DEBT.md` records the money version of the same bug: a failed fetch renders
  "**$0.00**" as though a ministry had no money.
- Pages opened from Church Center run on phones and cellular networks inside another app's browser
  (ADR-0001), so failed requests are common, not exceptional. Users need to see that something
  failed and be able to retry.
- A prerendered section whose build-time fetch fails would be baked into HTML as "nothing here".

On `main` (2026-10-18) the repos expose about 39 read and 46 write functions, and **no UI consumes
them yet** — only tests. This is the cheapest moment to change the contract.

## Decision

```ts
type RepoErrorKind = 'network' | 'auth' | 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'unknown';
interface RepoError {
  kind: RepoErrorKind;
  message: string;   // Spanish, safe to show
  detail?: string;   // raw backend text — console only, never rendered
}
type ReadResult<T>  = { ok: true; data: T } | { ok: false; error: RepoError };
type WriteResult<T = undefined> = { ok: true; data: T } | { ok: false; error: RepoError };
```

1. Repos still **never throw**. Reads return `ReadResult<T>`; writes keep `WriteResult` but
   carry a `RepoError`. The UI renders `error.message` and logs `detail` with the house
   `[module]` tag.
2. Views render **loading / empty / error** as three different states; error always offers Retry
   (DESIGN-SYSTEM §5).
3. A **build-time** read failure is never baked in as an empty state. The prerendered page renders
   the loading/skeleton state, the client refetches, and the build logs a warning.
4. **Retrofit in one session (S22b):** `events`, `gallery`, `discipleship`, `registrations`
   (S22), `treasury/*` (S52), `receipts` (S56b), plus the S23 branch's `newsletter` repo and homepage
   loaders when that branch rebases. Tests are updated in the same PR.

## Consequences

- **+** The DESIGN-SYSTEM §5 state system becomes implementable; "$0.00 on failure" can't happen.
- **+** One mapping from Supabase/PostgREST errors to Spanish copy instead of one per screen.
- **−** A contract change across ~85 functions and their tests. It is mechanical, and nothing in UI depends on the old shape yet.
- **−** The S23 branch must adapt four homepage calls on rebase.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Keep "safe empty" reads | Contradicts DESIGN-SYSTEM §5.3 and PORT-DEBT; hides failures on flaky mobile networks |
| Throw and catch in error boundaries | Breaks the "repos never throw" rule every caller relies on; boundaries can't offer per-section Retry cleanly |
| `null` = error, `[]` = empty sentinel | Ambiguous for single-row reads, and loses the error kind |
| A query library (e.g. TanStack Query) | A new dependency for caching/retry the app doesn't need; the result type is enough |

## Revisit triggers

A real caching or offline-sync requirement appears, or the repo layer moves server-side.
