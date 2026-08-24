<script lang="ts">
  // Root layout: the one place the global stylesheet is loaded (tokens → base →
  // layout → utilities, CLAUDE.md §4) and the persisted theme is synced into
  // runes state. The pre-paint attribute itself is set by the inline boot
  // script in app.html (no FOUC); initTheme() just agrees with it.
  import '$lib/styles/app.css';
  import { onMount } from 'svelte';
  import { initTheme } from '$lib/theme.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  onMount(() => {
    initTheme();
  });
</script>

{@render children()}
