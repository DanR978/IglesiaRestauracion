<!--
  Test fixture (PR-C2). PasswordField's two-way value, its form-submit
  behaviour (mismatch reported, password hidden again) and the exported
  focus() all need a parent: this one wraps a password field — and, with
  `withConfirm`, a confirm field matched against it — in a <form novalidate>.
-->
<script lang="ts">
  import PasswordField from '#lib/components/PasswordField.svelte';
  import type { PasswordAutocomplete } from '#lib/components/password-field.js';

  interface Props {
    label?: string;
    autocomplete?: PasswordAutocomplete;
    hint?: string;
    error?: string | null;
    confirmError?: string | null;
    required?: boolean;
    disabled?: boolean;
    toggle?: boolean;
    strength?: boolean;
    withConfirm?: boolean;
    password?: string;
    confirm?: string;
  }

  let {
    label,
    autocomplete,
    hint,
    error = null,
    confirmError = null,
    required = false,
    disabled = false,
    toggle = true,
    strength = false,
    withConfirm = false,
    password = $bindable(''),
    confirm = $bindable(''),
  }: Props = $props();

  let submits = $state(0);
  let field = $state<ReturnType<typeof PasswordField>>();
</script>

<form
  novalidate
  data-testid="form"
  onsubmit={(event) => {
    event.preventDefault();
    submits += 1;
  }}
>
  <PasswordField
    bind:this={field}
    bind:value={password}
    {label}
    {autocomplete}
    {hint}
    {error}
    {required}
    {disabled}
    {toggle}
    {strength}
  />
  {#if withConfirm}
    <PasswordField
      label="Confirma la contraseña"
      autocomplete="new-password"
      match={password}
      error={confirmError}
      bind:value={confirm}
    />
  {/if}
  <button type="submit">Guardar</button>
</form>

<p data-testid="password">{password}</p>
<p data-testid="submits">{submits}</p>
<button type="button" data-testid="focus" onclick={() => field?.focus()}>enfocar</button>
