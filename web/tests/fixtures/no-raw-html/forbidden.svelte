<!--
  FIXTURE — every line here deliberately violates MIGRATION.md D-005.
  Nothing imports it; `eslint .` ignores this directory (see eslint.config.js)
  and tests/unit/no-raw-html.test.ts lints it directly and asserts the reports.
-->
<script lang="ts">
  interface Props {
    untrusted: string;
  }

  let { untrusted }: Props = $props();
  let host: HTMLDivElement | undefined = $state();

  // A safe initial value must not launder a later assignment.
  let laundered = $state('');

  function launder() {
    laundered = untrusted;
  }

  function paint() {
    if (host) host.innerHTML = untrusted;
  }
</script>

{@html untrusted}
{@html laundered}

<div bind:this={host}></div>
<button type="button" onclick={launder}>Blanquear</button>
<button type="button" onclick={paint}>Pintar</button>
