<!--
  SegmentedControl — one choice among a few, all of them visible (PR-C2
  primitives; DESIGN-SYSTEM §4.3 "SegmentedControl / SectionNav", S21).
  Consumers: S45's theme choice (Claro / Oscuro / Sistema) and S55's report
  Período. Retires the report builder's `.rb-seg` (report-builder.css:55):
  plain buttons with an `.on` class — no group name, no checked state for a
  screen reader, no arrow keys.

  Native radios, styled. role="radiogroup" is named by the visible label
  (aria-labelledby); each option is a real <input type="radio"> inside its
  <label>, so the browser supplies the radio-group keyboard: Arrow keys move
  AND select (Chromium wraps at the ends, WebKit stops there — each platform's
  own behaviour), Tab enters at the checked option and leaves the group, Space
  checks. Exactly one option is checked whenever `value` names one. The input
  covers its whole segment at opacity 0 (the 44px segment is the hit area) and
  the focus ring is drawn on the segment.

  Usage:
    <SegmentedControl label="Tema" bind:value={pref}
      options={[{ value: 'light', label: 'Claro', icon: 'sun' }, …]}
      onChange={(next) => theme.set(next)} />
-->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { SegmentedOption } from './segmented-control';

  interface Props {
    /** Names the group (aria-labelledby). Visible unless `hideLabel`. */
    label: string;
    options: SegmentedOption[];
    /** Bindable: the chosen option's value. */
    value: string;
    /** Keep the label for screen readers only — a heading already names the control. */
    hideLabel?: boolean;
    disabled?: boolean;
    /** The radios' shared `name`. Generated per instance when omitted. */
    name?: string;
    /** A person chose an option. */
    onChange?: (value: string) => void;
    class?: ClassValue;
  }

  let {
    label,
    options,
    value = $bindable(),
    hideLabel = false,
    disabled = false,
    name,
    onChange,
    class: className = '',
  }: Props = $props();

  const uid = $props.id();
  const labelId = `seg-${uid}-label`;
  const groupName = $derived(name ?? `seg-${uid}`);

  /**
   * The keyboard is in use. WebKit moves focus between radios on an arrow key
   * without :focus-visible, which would drop the ring in Safari; after a key
   * press the ring also follows plain :focus, until the next pointer press.
   */
  let keyboard = $state(false);
</script>

<div class={['ird-seg', disabled && 'is-disabled', className]}>
  <span class={['ird-seg__label', hideLabel && 'ird-seg__label--hidden']} id={labelId}>
    {label}
  </span>
  <div
    class={['ird-seg__group', keyboard && 'is-keyboard']}
    role="radiogroup"
    aria-labelledby={labelId}
  >
    {#each options as option (option.value)}
      <label class={['ird-seg__option', option.value === value && 'is-checked']}>
        <input
          class="ird-seg__input"
          type="radio"
          name={groupName}
          value={option.value}
          bind:group={value}
          {disabled}
          onchange={() => onChange?.(option.value)}
          onkeydown={() => (keyboard = true)}
          onpointerdown={() => (keyboard = false)}
        />
        {#if option.icon}<Icon name={option.icon} class="ird-seg__icon" />{/if}
        <span class="ird-seg__text">{option.label}</span>
      </label>
    {/each}
  </div>
</div>

<style>
  .ird-seg {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  /* The FormField label, so a control group reads like the fields around it. */
  .ird-seg__label {
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    line-height: 1.35;
  }

  /* Mirrors the global .sr-only utility so the component works standalone. */
  .ird-seg__label--hidden {
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

  /* A tinted track; segments wrap rather than overflow on a narrow screen. */
  .ird-seg__group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    width: fit-content;
    max-width: 100%;
    padding: 0.25rem;
    border-radius: var(--radius-md);
    background: rgba(127, 127, 127, 0.12);
  }

  .ird-seg__option {
    position: relative;
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 2.75rem;
    padding: 0.45rem 0.9rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* The real radio, stretched over its segment and painted invisible: clicks
     and taps anywhere on the segment are clicks on the radio. */
  .ird-seg__input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .ird-seg__option :global(.ird-seg__icon) {
    color: var(--color-muted);
  }

  @media (hover: hover) {
    .ird-seg__option:not(.is-checked):hover {
      background: rgba(127, 127, 127, 0.12);
    }
  }

  /* Press feedback for touch, where there is no hover. */
  .ird-seg__option:not(.is-checked):active {
    background: rgba(127, 127, 127, 0.18);
  }

  .ird-seg__option:has(.ird-seg__input:focus-visible),
  .ird-seg__group.is-keyboard .ird-seg__option:has(.ird-seg__input:focus) {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  /* Checked: the admin's solid slate fill with light ink (visual brief), plus
     a --color-text edge that carries the state at 3:1 in dark mode, where the
     slate fill alone sits close to the track. */
  .ird-seg__option.is-checked {
    border-color: var(--color-text);
    background: var(--color-dark);
    color: var(--color-white);
    font-weight: var(--fw-semibold);
  }

  .ird-seg__option.is-checked :global(.ird-seg__icon) {
    color: inherit;
  }

  .ird-seg.is-disabled .ird-seg__option {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .ird-seg__option {
      transition: none;
    }
  }
</style>
