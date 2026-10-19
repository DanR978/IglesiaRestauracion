<!--
  Alert — the in-flow message box (PR-C2, DESIGN-SYSTEM §4.3, S15).
  Glyph + plain text; never {@html}, never innerHTML — the message is
  interpolated as text, so an error string can never inject markup (D-005).
  The `error` tone takes HUMAN copy: pass RepoError.message, never error.detail.

  The live region is the text alone (role="alert" for error, role="status"
  otherwise): the actions and the dismiss control sit outside it, so an
  announcement reads the message, not "Reintentar, botón, Cerrar aviso, botón".

  `onDismiss` adds a "Cerrar aviso" IconButton. The PARENT removes the alert
  (and decides where focus goes next) — the component holds no hidden state
  that could swallow the next message.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import {
    ALERT_BLOCK,
    ALERT_DISMISS_LABEL,
    ALERT_ICONS,
    ALERT_ROLES,
    ALERT_TONE_LABELS,
    type AlertTone,
  } from './alert';

  interface Props {
    /** error (assertive) · success · info (default) · warn. */
    tone?: AlertTone;
    /** The message, as plain text. Human Spanish — never a raw backend string. */
    message: string;
    /** An optional bold first line. */
    title?: string;
    /** Buttons or links under the message ("Reintentar", "Ir a Seguridad"). */
    actions?: Snippet;
    /** Shows the "Cerrar aviso" control; the parent removes the alert. */
    onDismiss?: () => void;
    class?: string;
  }

  let {
    tone = 'info',
    message,
    title,
    actions,
    onDismiss,
    class: className = '',
  }: Props = $props();

  const classes = $derived(
    [ALERT_BLOCK, `${ALERT_BLOCK}--${tone}`, className].filter(Boolean).join(' '),
  );
  const spoken = $derived(`${ALERT_TONE_LABELS[tone]}: `);
</script>

<div class={classes}>
  <span class="ird-alert__icon"><Icon set="fas" name={ALERT_ICONS[tone]} /></span>
  <div class="ird-alert__body">
    <div class="ird-alert__text" role={ALERT_ROLES[tone]}>
      {#if title}
        <p class="ird-alert__title"><span class="sr-only">{spoken}</span>{title}</p>
        <p class="ird-alert__message">{message}</p>
      {:else}
        <p class="ird-alert__message"><span class="sr-only">{spoken}</span>{message}</p>
      {/if}
    </div>
    {#if actions}
      <div class="ird-alert__actions">{@render actions()}</div>
    {/if}
  </div>
  {#if onDismiss}
    <IconButton
      class="ird-alert__dismiss"
      icon="xmark"
      label={ALERT_DISMISS_LABEL}
      size="sm"
      onclick={onDismiss}
    />
  {/if}
</div>

<style>
  /* One calm box per tone: the honest status tint, a hairline of the same
     hue, and the glyph in the tone's ink. The words stay --color-text, which
     clears AA on every tint in both themes (the tone inks alone do not all). */
  .ird-alert {
    display: flex;
    align-items: flex-start;
    gap: var(--mg-sm);
    padding: var(--pd-sm);
    border: 1px solid color-mix(in srgb, var(--alert-ink) 35%, transparent);
    border-radius: var(--radius-md);
    background: var(--alert-tint);
    color: var(--color-text);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }

  .ird-alert--error {
    --alert-ink: var(--status-overdue);
    --alert-tint: var(--status-overdue-bg);
  }

  .ird-alert--success {
    --alert-ink: var(--status-active);
    --alert-tint: var(--status-active-bg);
  }

  .ird-alert--info {
    --alert-ink: var(--status-open);
    --alert-tint: var(--status-open-bg);
  }

  .ird-alert--warn {
    --alert-ink: var(--status-pending);
    --alert-tint: var(--status-pending-bg);
  }

  /* Glyph box = one line of the TEXT (its --fs-sm × 1.45 line box, not the
     glyph's own em), so it centres on the first line however many the message
     wraps to. */
  .ird-alert__icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    block-size: calc(var(--fs-sm) * 1.45);
    color: var(--alert-ink);
    font-size: var(--fs-md);
    line-height: 1;
  }

  .ird-alert__body {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  .ird-alert__title,
  .ird-alert__message {
    margin: 0;
    /* A long address or code must wrap, never widen the box at 360px. */
    overflow-wrap: anywhere;
  }

  .ird-alert__title {
    font-weight: var(--fw-bold);
  }

  .ird-alert__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-xs);
    margin-block-start: var(--mg-sm);
  }

  /* Pull the 32px control into the padding so a one-line alert stays compact. */
  .ird-alert :global(.ird-alert__dismiss) {
    margin-block: calc(-1 * var(--pd-xs));
    margin-inline-end: calc(-1 * var(--pd-xs));
  }
</style>
