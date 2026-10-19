<!--
  ReadonlyField — "this is your data, but an administrator owns it"
  (PR-C2 primitives; DESIGN-SYSTEM §4.3 "ReadonlyField", S45).
  Retires Mi cuenta's wall of `<input disabled>` for immutable facts
  (`renderProfileSection`, js/pages/admin/account.js:249-266): five greyed
  boxes that read as broken, that a keyboard user tabs into for nothing, and
  that a screen reader announces as "dimmed" controls.

  A label/value pair as a one-item description list: static text, never
  focusable, no input chrome (no border, no fill), so it cannot be mistaken for
  a field that is merely switched off. The value keeps the vertical rhythm of
  a FormField control, so the two line up in one form row. An optional lock
  note says who owns the value. A missing value is an em dash for the eye and
  "Sin dato" for a screen reader — never an empty gap or a literal "null".

  Usage:
    <ReadonlyField label="Correo" value={user.email}
      note="El correo lo gestiona un administrador." />
    <ReadonlyField label="Ministerios">
      <ul class="chips">{#each ministries as m (m.id)}<li>{m.name}</li>{/each}</ul>
    </ReadonlyField>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import { MISSING_MARK, MISSING_TEXT, isMissingValue } from './readonly-field';

  interface Props {
    label: string;
    /** Plain text. Ignored when `children` is given. */
    value?: string | number | null;
    /** Who owns the value, e.g. "El correo lo gestiona un administrador." */
    note?: string;
    class?: ClassValue;
    /** Rich value (a badge, a list) in place of `value`. */
    children?: Snippet;
  }

  let { label, value = null, note, class: className = '', children }: Props = $props();

  const missing = $derived(!children && isMissingValue(value));
</script>

<dl class={['ird-readonly', className]}>
  <dt class="ird-readonly__label">{label}</dt>
  <dd class={['ird-readonly__value', missing && 'is-missing']}>
    {#if children}
      {@render children()}
    {:else if missing}
      <span aria-hidden="true">{MISSING_MARK}</span><span class="ird-readonly__sr"
        >{MISSING_TEXT}</span
      >
    {:else}
      {value}
    {/if}
  </dd>
  {#if note}
    <dd class="ird-readonly__note">
      <Icon name="lock" class="ird-readonly__note-icon" />
      <span>{note}</span>
    </dd>
  {/if}
</dl>

<style>
  .ird-readonly {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
    margin: 0;
  }

  /* The same label as FormField, so a mixed form reads as one system. */
  .ird-readonly__label {
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    line-height: 1.35;
  }

  /* No border, no fill, no inline padding: text, not a control. A one-line
     value is 44px tall with its line centred (0.625rem + a 1.5rem line +
     0.625rem), like a one-line FormField control, so a ReadonlyField beside a
     field sits on the same line. Longer values grow a line at a time. */
  .ird-readonly__value {
    min-height: 2.75rem;
    margin: 0;
    padding-block: 0.625rem;
    color: var(--color-text);
    font-size: var(--fs-base);
    line-height: 1.5rem;
    overflow-wrap: anywhere;
  }

  .ird-readonly__value.is-missing {
    color: var(--color-muted);
  }

  .ird-readonly__note {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }

  .ird-readonly__note :global(.ird-readonly__note-icon) {
    flex-shrink: 0;
    margin-block-start: 0.2em;
  }

  /* Mirrors the global .sr-only utility so the component works standalone. */
  .ird-readonly__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
