<!--
  Test fixture (PR-C2). Proves SegmentedControl's `bind:value` is two-way and
  renders a second instance for the per-instance radio-name test.
-->
<script lang="ts">
  import SegmentedControl from '#lib/components/SegmentedControl.svelte';
  import type { SegmentedOption } from '#lib/components/segmented-control.js';

  interface Props {
    label?: string;
    options: SegmentedOption[];
    value?: string;
    hideLabel?: boolean;
    disabled?: boolean;
    name?: string;
    onChange?: (value: string) => void;
    second?: boolean;
  }

  let {
    label = 'Tema',
    options,
    value = $bindable(''),
    hideLabel = false,
    disabled = false,
    name,
    onChange,
    second = false,
  }: Props = $props();

  let other = $state('');
</script>

<SegmentedControl {label} {options} bind:value {hideLabel} {disabled} {name} {onChange} />

{#if second}
  <SegmentedControl label="Período" {options} bind:value={other} />
{/if}

<p data-testid="value">{value}</p>
