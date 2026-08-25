<!--
  Test fixture (S21). Disclosure takes a `children` snippet and exports
  refresh(), neither of which testing-library can pass as a plain prop — this
  wrapper supplies both plus the bind:open read-back the tests assert on.
-->
<script lang="ts">
  import Disclosure from '$lib/components/Disclosure.svelte';

  interface Props {
    label: string;
    /** Renders a SECOND Disclosure with this label (the unique-id test). */
    second?: string;
    icon?: string;
    open?: boolean;
    disabled?: boolean;
    summary?: string;
    count?: number;
    panelId?: string;
    onLoad?: () => void | Promise<void>;
    onToggle?: (open: boolean) => void;
  }

  let {
    label,
    second,
    icon,
    open = $bindable(false),
    disabled = false,
    summary,
    count,
    panelId,
    onLoad,
    onToggle,
  }: Props = $props();

  let ref = $state<ReturnType<typeof Disclosure> | undefined>();
</script>

<Disclosure
  bind:this={ref}
  bind:open
  {label}
  {icon}
  {disabled}
  {summary}
  {count}
  {panelId}
  {onLoad}
  {onToggle}
>
  <p data-testid="panel-content">Contenido del panel</p>
</Disclosure>

{#if second}
  <Disclosure label={second}>
    <p>Segundo panel</p>
  </Disclosure>
{/if}

<p data-testid="open-state">{open ? 'abierto' : 'cerrado'}</p>
<button type="button" data-testid="open-externally" onclick={() => (open = true)}>abrir</button>
<button type="button" data-testid="refresh" onclick={() => ref?.refresh()}>refrescar</button>
