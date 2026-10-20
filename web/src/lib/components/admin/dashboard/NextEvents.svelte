<!--
  NextEvents — Inicio's "Próximos eventos" card (S41). Retires the legacy
  `#dashNext` rows (dashboard.js:84-105).

  Rows are STATIC: they open nothing, so they have no hover wash and no
  pointer (PORT-DEBT S41 — the legacy rows hovered and did nothing). Each row:
  the date (day + month; weekday and time in the line under the title), the
  title, the ministry as a Badge tinted with its colour, and — for a
  cancelled event — a "Cancelado" status Badge (glyph + word) instead of the
  legacy 55% opacity, which also dimmed the text below AA.

  States: list skeleton → rows | StateEmpty | StateError (+ Retry).

  Usage:
    <NextEvents result={events.result} onRetry={() => events.load()} />
-->
<script lang="ts">
  import Badge from '#lib/components/Badge.svelte';
  import { badgeTint } from '#lib/components/badge.js';
  import Card from '#lib/components/Card.svelte';
  import StateEmpty from '#lib/components/StateEmpty.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import type { NextCalendarEvent } from '#lib/repos/events.js';
  import type { ReadResult } from '#lib/repos/types.js';
  import { NEXT_EVENTS_LIMIT, eventDay } from './dashboard';

  interface Props {
    /** null until the first answer. */
    result: ReadResult<NextCalendarEvent[]> | null;
    onRetry: () => Promise<unknown>;
  }

  let { result, onRetry }: Props = $props();

  const rows = $derived(
    result?.ok ? result.data.map((event) => ({ event, day: eventDay(event.date) })) : [],
  );
</script>

<Card heading="Próximos eventos" headingLevel={2} headingIcon="calendar-day">
  {#if result === null}
    <div class="next-loading">
      <StateLoading shape="list" rows={NEXT_EVENTS_LIMIT} label="Cargando próximos eventos…" />
    </div>
  {:else if !result.ok}
    <StateError compact message={result.error.message} {onRetry} />
  {:else if rows.length === 0}
    <StateEmpty compact icon="calendar-check" message="No hay eventos próximos." />
  {:else}
    <ul class="next">
      {#each rows as { event, day } (event.id)}
        <li class="next__row" class:next__row--cancelled={event.cancelled}>
          <time class="next__date" datetime={event.date}>
            {#if day}
              <span class="next__day">{day.day}</span>
              <span class="next__month">{day.month}</span>
            {/if}
          </time>
          <div class="next__body">
            <p class="next__title">{event.title}</p>
            {#if day || event.time}
              <p class="next__meta">
                {[day?.weekday, event.time].filter(Boolean).join(' · ')}
              </p>
            {/if}
            {#if event.cancelled || event.ministries}
              <p class="next__badges">
                {#if event.cancelled}
                  <Badge tone="danger" label="Cancelado" />
                {/if}
                {#if event.ministries}
                  {#if badgeTint(event.ministries.color)}
                    <Badge tint={event.ministries.color} label={event.ministries.name} />
                  {:else}
                    <Badge tone="neutral" icon="church" label={event.ministries.name} />
                  {/if}
                {/if}
              </p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</Card>

<style>
  /* Skeleton rows at a real row's height (date block, title, meta, a badge),
     so the card does not grow — and push the next one down — on arrival. */
  .next-loading {
    --state-row-height: calc(4.5rem + 1vw);
  }

  .next {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .next__row {
    display: flex;
    align-items: flex-start;
    gap: var(--mg-sm);
    padding-block: var(--pd-xs);
    border-block-end: 1px solid rgba(127, 127, 127, 0.18);
  }

  .next__row:last-child {
    border-block-end: 0;
  }

  .next__date {
    display: flex;
    flex: 0 0 3rem;
    flex-direction: column;
    align-items: center;
    padding-block: var(--mg-xxs);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-sm);
    background: rgba(127, 127, 127, 0.08);
    line-height: 1.1;
  }

  .next__day {
    color: var(--color-text);
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
    font-variant-numeric: tabular-nums;
  }

  .next__month {
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .next__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--mg-xxs);
    min-inline-size: 0;
  }

  .next__title {
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-base);
    font-weight: var(--fw-semibold);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .next__row--cancelled .next__title {
    color: var(--color-muted);
    text-decoration: line-through;
  }

  .next__meta {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  .next__badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xxs);
    min-inline-size: 0;
    margin: 0;
  }
</style>
