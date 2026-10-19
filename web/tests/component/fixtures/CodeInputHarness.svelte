<!--
  Test fixture (PR-C2). CodeInput's value and error are both bindable and its
  onComplete must fire once per completed code; this wrapper binds both,
  records every completion, and offers buttons for the parent-driven changes
  (an error after a failed check, a value set from outside).
-->
<script lang="ts">
  import CodeInput from '#lib/components/CodeInput.svelte';

  interface Props {
    value?: string;
    error?: string | null;
    label?: string;
    hint?: string;
    disabled?: boolean;
    loading?: boolean;
  }

  let {
    value = $bindable(''),
    error = $bindable(null),
    label,
    hint,
    disabled = false,
    loading = false,
  }: Props = $props();

  let completions = $state<string[]>([]);
  let field = $state<ReturnType<typeof CodeInput>>();
</script>

<CodeInput
  bind:this={field}
  bind:value
  bind:error
  {label}
  {hint}
  {disabled}
  {loading}
  onComplete={(code) => (completions = [...completions, code])}
/>

<p data-testid="value">{value}</p>
<p data-testid="error">{error ?? ''}</p>
<p data-testid="completions">{completions.join(',')}</p>
<button type="button" data-testid="set-error" onclick={() => (error = 'El código no es válido.')}>
  error
</button>
<button type="button" data-testid="set-value" onclick={() => (value = '12-34')}>valor</button>
<button type="button" data-testid="set-full" onclick={() => (value = '654321')}>completo</button>
<button type="button" data-testid="focus" onclick={() => field?.focus()}>enfocar</button>
