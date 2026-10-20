<!--
  RecentActivity — Inicio's "Actividad reciente" card (S41): the latest audit
  rows, read-only, in the words of the legacy Actividad tab (#lib/activity-
  format, golden-tested): "<quién> <verbo> <qué> “<etiqueta>”" and how long
  ago. The actor's initials lead the row (the one initials algorithm,
  PORT-DEBT S42); the name beside them is the accessible text.

  Shown only to `activity` holders — the audit log is developer-tier, and RLS
  answers anyone else with an empty list, not an error (S40 landmine 1).
  States: list skeleton → rows | StateEmpty | StateError (+ Retry).

  Usage:
    <RecentActivity result={activity.result} onRetry={() => activity.load()} />
-->
<script lang="ts">
  import { ACTIVITY_EMPTY, activityPredicate, formatActivity } from '#lib/activity-format.js';
  import Avatar from '#lib/components/Avatar.svelte';
  import Card from '#lib/components/Card.svelte';
  import StateEmpty from '#lib/components/StateEmpty.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import type { AuditEntry } from '#lib/repos/activity.js';
  import type { ReadResult } from '#lib/repos/types.js';
  import { ACTIVITY_LIMIT } from './dashboard';

  interface Props {
    /** null until the first answer. */
    result: ReadResult<AuditEntry[]> | null;
    onRetry: () => Promise<unknown>;
  }

  let { result, onRetry }: Props = $props();

  // "hace 5 min" is measured when the rows arrive; a refresh re-measures it.
  // The words after the name are ONE text node, so the sentence reads (and
  // copies) exactly as legacy rendered it, whatever the template's line breaks.
  const rows = $derived.by(() => {
    if (!result?.ok) return [];
    const now = Date.now();
    return result.data.map((entry) => {
      const line = formatActivity(entry, now);
      return { entry, line, rest: ` ${activityPredicate(line)}` };
    });
  });
</script>

<Card heading="Actividad reciente" headingLevel={2} headingIcon="clock-rotate-left">
  {#if result === null}
    <StateLoading shape="list" rows={ACTIVITY_LIMIT} label="Cargando actividad reciente…" />
  {:else if !result.ok}
    <StateError compact message={result.error.message} {onRetry} />
  {:else if rows.length === 0}
    <StateEmpty compact icon="clock-rotate-left" message={ACTIVITY_EMPTY} />
  {:else}
    <ul class="feed">
      {#each rows as { entry, line, rest } (entry.id)}
        <li class="feed__row">
          <Avatar name={line.who} size={36} decorative />
          <div class="feed__body">
            <p class="feed__text"><strong class="feed__who">{line.who}</strong>{rest}</p>
            {#if line.when}
              <p class="feed__time"><time datetime={entry.created_at}>{line.when}</time></p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</Card>

<style>
  .feed {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .feed__row {
    display: flex;
    align-items: flex-start;
    gap: var(--mg-sm);
    padding-block: var(--pd-xs);
    border-block-end: 1px solid rgba(127, 127, 127, 0.18);
  }

  .feed__row:last-child {
    border-block-end: 0;
  }

  .feed__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--mg-xxs);
    min-inline-size: 0;
  }

  .feed__text {
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-sm);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .feed__who {
    font-weight: var(--fw-semibold);
  }

  .feed__time {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
</style>
