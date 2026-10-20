<!--
  AccountPanel — one titled panel inside a Mi cuenta section (S45): a flat
  surface with an h3, an optional one-line description, then its content.
  Flat on purpose — the admin's panels are a border on --color-surface, no
  shadow, no hover (visual brief). Retires the legacy `.acct-card`.

  Usage:
    <AccountPanel title="Contraseña" description="Usa al menos 8 caracteres.">…</AccountPanel>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description?: string;
    children: Snippet;
  }

  let { title, description, children }: Props = $props();
</script>

<div class="acct-panel">
  <div class="acct-panel__head">
    <h3 class="acct-panel__title">{title}</h3>
    {#if description}
      <p class="acct-panel__description">{description}</p>
    {/if}
  </div>
  {@render children()}
</div>

<style>
  .acct-panel {
    min-width: 0;
    padding: var(--pd-sm);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .acct-panel__head {
    margin-block-end: var(--mg-sm);
  }

  .acct-panel__title {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    line-height: 1.3;
  }

  .acct-panel__description {
    margin: var(--mg-xxs) 0 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }
</style>
