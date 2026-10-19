<!--
  Test fixture (PR-C2). FormField takes its control as a snippet, which
  testing-library cannot pass as a prop — this wrapper supplies one (an input,
  a select or a textarea) spread with the attrs FormField hands it, and an
  optional second field for the unique-id test.
-->
<script lang="ts">
  import FormField from '#lib/components/FormField.svelte';

  interface Props {
    label?: string;
    hint?: string;
    error?: string | null;
    required?: boolean;
    disabled?: boolean;
    id?: string;
    describedBy?: string;
    /** Which control the snippet renders. */
    kind?: 'input' | 'select' | 'textarea';
    /** The caller's own read-only flag on the control. */
    readonly?: boolean;
    /** Renders a second FormField (the unique-id test). */
    second?: boolean;
  }

  let {
    label = 'Nombre',
    hint,
    error = null,
    required = false,
    disabled = false,
    id,
    describedBy,
    kind = 'input',
    readonly = false,
    second = false,
  }: Props = $props();

  let value = $state('');
</script>

<FormField {label} {hint} {error} {required} {disabled} {id} {describedBy}>
  {#snippet control(attrs)}
    {#if kind === 'select'}
      <select
        id={attrs.id}
        class={attrs.class}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        bind:value
      >
        <option value="">Elige…</option>
        <option value="a">Alabanza</option>
      </select>
    {:else if kind === 'textarea'}
      <textarea
        id={attrs.id}
        class={attrs.class}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        bind:value></textarea>
    {:else}
      <input
        id={attrs.id}
        class={attrs.class}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        type="text"
        {readonly}
        bind:value
      />
    {/if}
  {/snippet}
</FormField>

{#if second}
  <FormField label="Apellido" hint="Segundo campo">
    {#snippet control(attrs)}
      <input
        id={attrs.id}
        class={attrs.class}
        aria-describedby={attrs['aria-describedby']}
        aria-invalid={attrs['aria-invalid']}
        aria-required={attrs['aria-required']}
        disabled={attrs.disabled}
        type="text"
      />
    {/snippet}
  </FormField>
{/if}

<p id="extra-note">Nota externa</p>
<p data-testid="value">{value}</p>
