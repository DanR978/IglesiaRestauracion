<script lang="ts">
  // Root layout: the one place the global stylesheet is loaded (tokens → base →
  // layout → utilities, CLAUDE.md §4) and the persisted theme is synced into
  // runes state. The pre-paint attribute itself is set by the inline boot
  // script in app.html (no FOUC); applyThemeFor() agrees with it, and swaps to
  // the other surface's preference when a client-side navigation crosses
  // between the public pages and the admin (D-038). This is the only layout
  // that sees both sides of such a navigation.
  import '#lib/styles/app.css';
  import { afterNavigate } from '$app/navigation';
  import { applyThemeFor } from '#lib/theme.svelte.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  // Also runs on mount: that is the first sync.
  afterNavigate(({ to }) => applyThemeFor(to?.url.pathname ?? location.pathname));
</script>

{@render children()}
