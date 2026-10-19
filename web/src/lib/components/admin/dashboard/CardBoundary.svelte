<!--
  CardBoundary — keeps a rendering bug inside one Inicio card (S41,
  target-architecture §9). Repos never throw, so what lands here is a bug
  (or a row the card cannot render): it is logged under [inicio] and the card
  shows StateError — the generic copy, never the exception — while every other
  card keeps working. Retry fetches the card's data again, then renders it
  afresh. A <svelte:boundary> with only a `failed` snippet: loading is each
  card's own skeleton, never a boundary `pending` state.

  Usage:
    <CardBoundary compact onRetry={() => read.load()}>
      <KpiTile … />
    </CardBoundary>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import StateError from '#lib/components/StateError.svelte';

  interface Props {
    /** Fetches the card's data again; awaited before the card re-renders. */
    onRetry: () => Promise<unknown>;
    /** The smaller error, for a KPI tile. */
    compact?: boolean;
    children: Snippet;
  }

  let { onRetry, compact = false, children }: Props = $props();

  function report(error: unknown): void {
    console.error('[inicio] a card failed to render:', error);
  }

  function retry(reset: () => void): () => Promise<void> {
    return async () => {
      await onRetry();
      reset();
    };
  }
</script>

<svelte:boundary onerror={report}>
  {@render children()}
  <!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -- Svelte passes the error first; report() already logged it -->
  {#snippet failed(_error, reset)}
    <StateError {compact} onRetry={retry(reset)} />
  {/snippet}
</svelte:boundary>
