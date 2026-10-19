<!--
  Test fixture (PR-C2). Proves SectionNav's `bind:current` is two-way (button
  mode writes the selection back) and gives focus somewhere to go when it
  leaves the nav.
-->
<script lang="ts">
  import SectionNav from '#lib/components/SectionNav.svelte';
  import type { SectionNavItem } from '#lib/components/section-nav.js';

  interface Props {
    items: SectionNavItem[];
    current?: string;
    label?: string;
    onSelect?: (id: string) => void;
  }

  let { items, current = $bindable(), label = 'Secciones', onSelect }: Props = $props();
</script>

<SectionNav {items} bind:current {label} {onSelect} />

<p data-testid="current">{current ?? ''}</p>
<button type="button" data-testid="outside">fuera</button>
