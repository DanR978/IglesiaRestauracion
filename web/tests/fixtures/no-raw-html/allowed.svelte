<!--
  FIXTURE — the four shapes MIGRATION.md D-005 permits. Nothing imports it;
  tests/unit/no-raw-html.test.ts lints it and asserts ZERO reports.
-->
<script lang="ts">
  import { renderRichText, sanitizeHtml } from '$lib/sanitize-html';
  import spriteMarkup from '$lib/assets/icons.svg?raw';

  interface Props {
    stored: string;
  }

  let { stored }: Props = $props();
  let host: HTMLDivElement | undefined = $state();

  const safe = $derived(renderRichText(stored));

  function paintSprite() {
    // The D-005 sprite carve-out: a build-time `?raw` asset, not data.
    if (host) host.innerHTML = spriteMarkup;
  }
</script>

{@html sanitizeHtml(stored)}
{@html safe}
{@html stored ? renderRichText(stored) : ''}

<div bind:this={host}></div>
<button type="button" onclick={paintSprite}>Sprite</button>
