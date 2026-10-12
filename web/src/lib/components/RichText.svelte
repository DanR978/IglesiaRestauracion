<!--
  RichText — the ONLY way stored rich text reaches a page (S18, D-005).
  The render half of RichTextEditor: the second of the two sanitizer passes the
  design system demands ("sanitize on BOTH save and render"). Stored HTML is
  never trusted, even though an admin authored it and the editor already cleaned
  it — a row can be edited by a future tool, restored from a backup, or written
  by a legacy screen that predates the allowlist.

  This component is the reason the `local/no-raw-html` ESLint rule can be
  absolute: `{@html}` appears here, applied to `renderRichText()` output, and a
  page that needs to show rich text imports this instead of reaching for the
  raw tag itself.

  `renderRichText` also carries the plain-text back-compat path: rows written
  before the editor existed hold newline-separated text, and come out as escaped
  <p>/<br> markup rather than one run-on line.

  Renders NOTHING when the value has no visible text, which is what all five
  legacy call sites hand-rolled with `!htmlIsEmpty(x) ? … : ''`.
-->
<script lang="ts">
  import { htmlIsEmpty, renderRichText } from '$lib/sanitize-html';
  import { RICH_TEXT_CONTENT_BLOCK } from './rich-text';

  interface Props {
    /** The stored value: rich HTML, legacy plain text, null or undefined. */
    value?: string | null;
    /** Heading level context is the caller's — this is a plain block container. */
    class?: string;
  }

  let { value, class: className = '' }: Props = $props();

  // $lib/sanitize-html parses with DOMParser (G-001), which exists in a browser
  // and in jsdom but NOT in the Node prerender pass. Rather than ship unchecked
  // markup on the server, this renders nothing there and fills in on the client
  // — which is also where the data arrives, since every screen that shows rich
  // text reads it from Supabase after hydration. A public page that must carry
  // rich text in its PRERENDERED html needs an isomorphic sanitizer first (see
  // the S18 NOTES: open for the parent).
  const canSanitize = typeof DOMParser !== 'undefined';

  const safeHtml = $derived(canSanitize ? renderRichText(value) : '');
  const isEmpty = $derived(htmlIsEmpty(safeHtml));
</script>

{#if !isEmpty}
  <div class="{RICH_TEXT_CONTENT_BLOCK} {className}">
    <!-- The one sanctioned {@html}: `safeHtml` is renderRichText() output. -->
    {@html safeHtml}
  </div>
{/if}

<style>
  /* Port of css/pages/rich-content.css. The markup comes from {@html}, so it
     carries no scoping attribute — every descendant rule must be :global. */
  .rich-content > :global(:first-child) {
    margin-top: 0;
  }

  .rich-content > :global(:last-child) {
    margin-bottom: 0;
  }

  .rich-content :global(p) {
    margin: 0 0 var(--mg-sm);
  }

  .rich-content :global(ul),
  .rich-content :global(ol) {
    margin: 0 0 var(--mg-sm);
    padding-left: var(--mg-ml);
  }

  .rich-content :global(li) {
    margin: var(--mg-xxs) 0;
  }

  .rich-content :global(a) {
    color: var(--color-secondary);
    text-decoration: underline;
    overflow-wrap: anywhere;
  }

  .rich-content :global(h3),
  .rich-content :global(h4) {
    margin: var(--mg-md) 0 var(--mg-xs);
    font-family: var(--font-Signika);
    font-size: var(--fs-md);
    line-height: 1.2;
  }

  .rich-content :global(h4) {
    font-size: var(--fs-base);
  }

  .rich-content :global(strong),
  .rich-content :global(b) {
    font-weight: var(--fw-bold);
  }

  .rich-content :global(blockquote) {
    margin: 0 0 var(--mg-sm);
    padding-left: var(--mg-sm);
    border-left: 3px solid rgba(127, 127, 127, 0.28);
    color: var(--color-muted);
  }
</style>
