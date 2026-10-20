<!--
  NavGroup — one titled group of the admin nav (S37): Principal, Eventos,
  Finanzas, Comunidad, Administración. Retires legacy .adm-nav__group.

  The label names the list (aria-labelledby) rather than being a heading, so
  the sidebar adds nothing to the page outline ahead of the page's own h1.
  role="list" brings back the list semantics `list-style: none` strips in
  Safari. Its children are NavItems.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    children: Snippet;
  }

  let { label, children }: Props = $props();

  const labelId = $props.id();
</script>

<div class="adm-nav-group">
  <span class="adm-nav-group__label" id={labelId}>{label}</span>
  <ul class="adm-nav-group__list" role="list" aria-labelledby={labelId}>
    {@render children()}
  </ul>
</div>

<style>
  .adm-nav-group:not(:first-child) {
    margin-block-start: 0.85rem;
  }

  .adm-nav-group__label {
    display: block;
    padding: 0.35rem 0.75rem 0.3rem;
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.04em;
  }

  .adm-nav-group__list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
