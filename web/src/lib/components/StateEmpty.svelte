<!--
  StateEmpty — "nothing here yet" (PR-C2, DESIGN-SYSTEM §5.2).
  Retires the legacy `.empty-state` box (js/components/states.js emptyHtml):
  the same calm, dashed panel — a domain glyph, ONE sentence, an optional
  second line, and an optional primary action so the empty state is a start
  ("Crear", "Nuevo álbum"), not a dead end.

  Use it only for a SUCCESSFUL read that returned nothing. A failed read is
  StateError — it must never look like this (§5.3).

  The glyph is required, as it was in emptyHtml: a generic icon on every
  empty view reads as a bug. `compact` fits the state inside a card or tile.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { STATE_BLOCK } from './states';

  interface Props {
    /** Font Awesome solid glyph for the domain ("calendar-check", "images"). */
    icon: string;
    /** One calm sentence, as text: "Aún no hay álbumes." */
    message: string;
    /** An optional second line: what will appear here, or how to start. */
    hint?: string;
    /** The primary action, when there is one (a Button). */
    action?: Snippet;
    /** Smaller padding and glyph, for a state inside a card or a tile. */
    compact?: boolean;
    class?: string;
  }

  let { icon, message, hint, action, compact = false, class: className = '' }: Props = $props();

  const classes = $derived(
    [STATE_BLOCK, `${STATE_BLOCK}--empty`, compact ? `${STATE_BLOCK}--compact` : '', className]
      .filter(Boolean)
      .join(' '),
  );
</script>

<div class={classes}>
  <span class="ird-state__icon"><Icon set="fas" name={icon} /></span>
  <p class="ird-state__message">{message}</p>
  {#if hint}
    <p class="ird-state__hint">{hint}</p>
  {/if}
  {#if action}
    <div class="ird-state__action">{@render action()}</div>
  {/if}
</div>

<style>
  /* Legacy .empty-state: centred, a dashed theme-neutral edge, the reversing
     surface (never --color-white, which strands the text in dark mode). */
  .ird-state--empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--mg-xs);
    padding: var(--pd-xl) var(--pd-md);
    border: 1px dashed rgba(127, 127, 127, 0.25);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    text-align: center;
  }

  .ird-state__icon {
    margin-block-end: var(--mg-xxs);
    color: var(--color-muted);
    font-size: var(--fs-xl);
    line-height: 1;
  }

  .ird-state__message {
    max-inline-size: 40ch;
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-base);
    line-height: 1.5;
  }

  .ird-state__hint {
    max-inline-size: 46ch;
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .ird-state__action {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--mg-xs);
    margin-block-start: var(--mg-sm);
  }

  .ird-state--compact {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
  }

  .ird-state--compact .ird-state__icon {
    font-size: var(--fs-md);
  }

  .ird-state--compact .ird-state__message {
    font-size: var(--fs-sm);
  }
</style>
