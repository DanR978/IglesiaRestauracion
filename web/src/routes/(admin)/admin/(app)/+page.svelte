<script lang="ts">
  /* ==========================================================================
   * routes/(admin)/admin/(app)/+page.svelte — Inicio, the admin home (S41)
   * --------------------------------------------------------------------------
   * Retires js/pages/admin/dashboard.js (tab-inicio): one Promise.all whose
   * single failure blanked the page with the raw error (PORT-DEBT S41),
   * `count ?? 0` for a failed count, autoBalance() (G-010) and the hovering
   * rows that did nothing.
   *
   * Rendered inside the (app) shell, whose guard lets a page render only for
   * a signed-in, two-step-verified staff account (S37/S38). Which cards show
   * is perms' answer (D-006, UX only) — RLS answers a missing tab with an
   * empty result, so an ungated card would show a misleading 0 or "no
   * activity" — and perms is empty until the session is `ready`, so nothing
   * is read before then either.
   *
   * Every card loads on its own (CardRead) and renders its own loading,
   * empty or error state; a CardBoundary around each keeps a rendering bug
   * in one card from blanking the rest. A tab coming back into view
   * refetches at most once a minute (in-app browsers suspend background
   * tabs — target-architecture §6), behind the content already shown.
   * ======================================================================== */
  import { untrack } from 'svelte';
  import Button from '#lib/components/Button.svelte';
  import CardBoundary from '#lib/components/admin/dashboard/CardBoundary.svelte';
  import KpiTile from '#lib/components/admin/dashboard/KpiTile.svelte';
  import NextEvents from '#lib/components/admin/dashboard/NextEvents.svelte';
  import RecentActivity from '#lib/components/admin/dashboard/RecentActivity.svelte';
  import { CardRead } from '#lib/components/admin/dashboard/card-read.svelte.js';
  import {
    ACTIVITY_LIMIT,
    LEGACY_PANEL_URL,
    NEXT_EVENTS_LIMIT,
    REFRESH_MS,
    TILES,
    greeting,
    instantOf,
    type TileKey,
    type TileValue,
  } from '#lib/components/admin/dashboard/dashboard.js';
  import PageHeader from '#lib/components/admin/shell/PageHeader.svelte';
  import { fetchRecentActivity } from '#lib/repos/activity.js';
  import { fetchNextCalendarEvents } from '#lib/repos/events.js';
  import { perms } from '#lib/stores/perms.svelte.js';
  import { session } from '#lib/stores/session.svelte.js';

  const summaryId = $props.id();

  const tileReads = Object.fromEntries(
    TILES.map((tile) => [tile.key, new CardRead(tile.key, () => tile.read(instantOf(new Date())))]),
  ) as Record<TileKey, CardRead<TileValue>>;
  const events = new CardRead('events', () =>
    fetchNextCalendarEvents(NEXT_EVENTS_LIMIT, instantOf(new Date()).today),
  );
  const activity = new CardRead('activity', () => fetchRecentActivity({ limit: ACTIVITY_LIMIT }));

  const tiles = $derived(TILES.filter((tile) => tile.visible(perms)));
  const showEvents = $derived(perms.has('inicio'));
  const showActivity = $derived(perms.has('activity'));
  /** Every card on screen, so a refresh reaches exactly what the account sees. */
  const shown = $derived([
    ...tiles.map((tile) => tileReads[tile.key]),
    ...(showEvents ? [events] : []),
    ...(showActivity ? [activity] : []),
  ]);

  /** When the cards last loaded together (ms); 0 until the first load. */
  let refreshedAt = 0;

  // First load — and a card that appears later (the role changed while the
  // tab slept) loads on its own the moment it is shown.
  $effect(() => {
    const unloaded = shown.filter((read) => !read.started);
    if (unloaded.length === 0) return;
    if (refreshedAt === 0) refreshedAt = Date.now();
    untrack(() => {
      for (const read of unloaded) void read.load();
    });
  });

  function onVisibilityChange(): void {
    if (document.visibilityState !== 'visible' || shown.length === 0) return;
    if (Date.now() - refreshedAt < REFRESH_MS) return;
    refreshedAt = Date.now();
    for (const read of shown) void read.load({ background: true });
  }
</script>

<svelte:document onvisibilitychange={onVisibilityChange} />

<div class="inicio">
  <PageHeader title="Inicio" description={greeting(session.profile?.display_name)}>
    {#snippet actions()}
      <Button href={LEGACY_PANEL_URL} variant="ghost" icon="arrow-up-right-from-square">
        Gestionar en el panel actual
      </Button>
    {/snippet}
  </PageHeader>

  {#if tiles.length > 0}
    <section aria-labelledby={summaryId}>
      <h2 id={summaryId} class="sr-only">Resumen</h2>
      <ul class="inicio__tiles">
        {#each tiles as tile (tile.key)}
          <li class="inicio__tile">
            <CardBoundary compact onRetry={() => tileReads[tile.key].load()}>
              <KpiTile
                label={tile.label}
                scope={tile.scope}
                icon={tile.icon}
                result={tileReads[tile.key].result}
                onRetry={() => tileReads[tile.key].load()}
              />
            </CardBoundary>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if showEvents || showActivity}
    <div class="inicio__lists">
      {#if showEvents}
        <CardBoundary onRetry={() => events.load()}>
          <NextEvents result={events.result} onRetry={() => events.load()} />
        </CardBoundary>
      {/if}
      {#if showActivity}
        <CardBoundary onRetry={() => activity.load()}>
          <RecentActivity result={activity.result} onRetry={() => activity.load()} />
        </CardBoundary>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* minmax(0, 1fr), not the implicit `auto` column: an auto track never
     shrinks below its widest item's min-content, and one long nowrap Badge
     (a ministry name) would widen the page past 360px. */
  .inicio {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--mg-md);
  }

  /* Pure CSS — the column count follows the space (G-010: no autoBalance).
     --state-card-height sizes the skeleton AND each cell, tracking a loaded
     tile: ~128px alone in a phone row, ~176px five-up beside the sidebar,
     where labels and scopes wrap. */
  .inicio__tiles {
    --state-card-height: clamp(8rem, 6rem + 6vw, 11rem);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: var(--mg-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One height for the skeleton and the tile that replaces it; the tile
     stretches to the tallest in its row. */
  .inicio__tile {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-block-size: var(--state-card-height, 8rem);
  }

  .inicio__lists {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
    gap: var(--mg-md);
    align-items: start;
  }
</style>
