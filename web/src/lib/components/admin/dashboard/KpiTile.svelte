<!--
  KpiTile — one Inicio figure and its own state (S41, DESIGN-SYSTEM §4.1 KPI
  tile + §5). Retires the legacy `.dash-card` button: no amber wipe, no lift,
  no navigation — a static Card that says what it counts and for which
  period.

    loading  a one-card skeleton (StateLoading card-grid) at the tile's size
    ok       what it counts (beside its glyph), the figure, the honest scope;
             a `warn` figure adds a warning glyph and words ("Requiere
             atención") and tints the figure and its glyph — colour is never
             the only cue (D-023)
    error    what it counts and its scope, then StateError with the
             RepoError's Spanish copy and Retry — never a 0 (PORT-DEBT S41)

  The grid cell gives the tile its minimum height (--state-card-height), so
  the swap from skeleton to tile does not move the page. Five tiles at 1280px
  leave ~150px of tile: a money figure is sized to it ("$12,345.67"), and the
  warning is a line that wraps — a Badge never wraps, and its uppercase pill
  ran past the tile there.

  Usage:
    <KpiTile label="Álbumes" scope="Galería · incluye borradores" icon="images"
             result={read.result} onRetry={() => read.load()} />
-->
<script lang="ts">
  import Card from '#lib/components/Card.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import StateError from '#lib/components/StateError.svelte';
  import StateLoading from '#lib/components/StateLoading.svelte';
  import type { ReadResult } from '#lib/repos/types.js';
  import type { TileValue } from './dashboard';

  interface Props {
    /** What is counted: "Próximos eventos". */
    label: string;
    /** The period or set the figure covers: "Desde hoy". */
    scope: string;
    /** Font Awesome solid glyph (decorative). */
    icon: string;
    /** null until the first answer. */
    result: ReadResult<TileValue> | null;
    /** Re-runs the read; StateError shows progress until it settles. */
    onRetry: () => Promise<unknown>;
  }

  let { label, scope, icon, result, onRetry }: Props = $props();

  const value = $derived(result?.ok ? result.data : null);
</script>

{#if result === null}
  <StateLoading shape="card-grid" rows={1} label="Cargando {label.toLocaleLowerCase('es')}…" />
{:else}
  <Card>
    <div
      class="kpi"
      class:kpi--warn={value?.tone === 'warn'}
      class:kpi--negative={value?.tone === 'negative'}
    >
      <p class="kpi__head">
        <span class="kpi__icon"><Icon name={icon} /></span>
        <span class="kpi__label">{label}</span>
      </p>
      {#if value}
        <p class="kpi__value" class:kpi__value--money={value.money}>{value.text}</p>
        {#if value.attention}
          <p class="kpi__attention">
            <span class="kpi__attention-icon"><Icon name="triangle-exclamation" /></span>
            {value.attention}
          </p>
        {/if}
        <p class="kpi__scope">{scope}</p>
      {:else if !result.ok}
        <p class="kpi__scope">{scope}</p>
        <div class="kpi__error">
          <StateError compact message={result.error.message} {onRetry} />
        </div>
      {/if}
    </div>
  </Card>
{/if}

<style>
  .kpi {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--mg-xxs);
    /* The money figure is measured against this box (cqi). */
    container-type: inline-size;
  }

  /* What is counted leads, beside its glyph: read first, and one row instead
     of two keeps the tile close to its skeleton's height. */
  .kpi__head {
    display: flex;
    align-items: center;
    gap: var(--mg-xs);
    margin: 0 0 var(--mg-xxs);
  }

  .kpi__icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    inline-size: 2rem;
    block-size: 2rem;
    border-radius: var(--radius-sm);
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-text);
    font-size: var(--fs-xs);
  }

  .kpi__value {
    max-inline-size: 100%;
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    letter-spacing: -0.01em;
    /* Last resort for an absurd figure: break it rather than widen the page. */
    overflow-wrap: anywhere;
  }

  /* ~5.4em for "$12,345.67": 18% of the tile keeps it whole down to the
     180px column, and never above the counts' size. */
  .kpi__value--money {
    font-size: clamp(var(--fs-lg), 18cqi, var(--fs-2xl));
  }

  .kpi__label {
    min-inline-size: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    line-height: 1.25;
  }

  /* The warn ink clears AA on the surface in both themes (5.99:1 / 8.28:1). */
  .kpi__attention {
    display: flex;
    align-items: baseline;
    gap: 0.4em;
    margin: var(--mg-xxs) 0;
    color: var(--status-pending);
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    line-height: 1.3;
  }

  .kpi__attention-icon {
    flex-shrink: 0;
  }

  .kpi__scope {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .kpi__error {
    align-self: stretch;
    margin-block-start: var(--mg-xs);
  }

  /* The ink/tint pairs are AA in both themes (D-023, tokens.test.ts). */
  .kpi--warn .kpi__icon {
    background: var(--status-pending-bg);
    color: var(--status-pending);
  }

  .kpi--warn .kpi__value {
    color: var(--status-pending);
  }

  .kpi--negative .kpi__value {
    color: var(--money-neg);
  }
</style>
