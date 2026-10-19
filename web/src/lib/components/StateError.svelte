<!--
  StateError — a read that failed (PR-C2, DESIGN-SYSTEM §5.3, the marquee fix).
  Retires the legacy error box that printed error.message — a raw Postgres
  string — in the same panel as "nothing here", with no way to try again.

  · The copy is plain text (interpolated, never {@html}): pass
    RepoError.message, which is Spanish and safe; never `detail`. A blank
    message falls back to a generic sentence, so the box is never empty.
  · `onRetry` is REQUIRED — an error state always offers "Reintentar".
    Return the refetch promise and the button shows its spinner until it
    settles (keep this state on screen meanwhile rather than swapping to
    StateLoading, which would drop the user's place); if the view still shows
    this error afterwards, the message is re-announced so a screen-reader user
    learns it failed again.
  · It looks nothing like StateEmpty: a warning triangle, the error tone, a
    solid edge — a failure never reads as "nothing here".
-->
<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { STATE_BLOCK, STATE_RETRY_LABEL, errorCopy, isThenable } from './states';

  interface Props {
    /** Human Spanish copy — RepoError.message. Rendered as text. */
    message?: string | null;
    /** Re-runs the failed read. Return its promise to show progress on the button. */
    onRetry: () => void | PromiseLike<unknown>;
    retryLabel?: string;
    /** Smaller padding and glyph, for a state inside a card or a tile. */
    compact?: boolean;
    class?: string;
  }

  let {
    message,
    onRetry,
    retryLabel = STATE_RETRY_LABEL,
    compact = false,
    class: className = '',
  }: Props = $props();

  let retrying = $state(false);
  /** Bumped after each awaited retry; re-keys the alert so it is read again. */
  let attempt = $state(0);

  const copy = $derived(errorCopy(message));
  const classes = $derived(
    [STATE_BLOCK, `${STATE_BLOCK}--error`, compact ? `${STATE_BLOCK}--compact` : '', className]
      .filter(Boolean)
      .join(' '),
  );

  async function retry(): Promise<void> {
    if (retrying) return;
    let pending: unknown;
    try {
      pending = onRetry();
    } catch (error) {
      console.warn('[state-error] onRetry threw:', error);
      attempt += 1;
      return;
    }
    if (!isThenable(pending)) return;
    retrying = true;
    try {
      await pending;
    } catch (error) {
      console.warn('[state-error] onRetry rejected:', error);
    } finally {
      retrying = false;
      attempt += 1;
    }
  }
</script>

<div class={classes}>
  <span class="ird-state__icon"><Icon set="fas" name="triangle-exclamation" /></span>
  {#key attempt}
    <p class="ird-state__message" role="alert">{copy}</p>
  {/key}
  <div class="ird-state__action">
    <Button
      variant="ghost"
      size={compact ? 'sm' : 'default'}
      icon="rotate-right"
      loading={retrying}
      onclick={() => void retry()}
    >
      {retryLabel}
    </Button>
  </div>
</div>

<style>
  /* The error tone, solid — StateEmpty is neutral and dashed. --status-overdue
     is the AA red ink that reverses with the theme; the words stay
     --color-text, which clears AA on the tint in both themes. */
  .ird-state--error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--mg-xs);
    padding: var(--pd-xl) var(--pd-md);
    border: 1px solid color-mix(in srgb, var(--status-overdue) 35%, transparent);
    border-radius: var(--radius-lg);
    background: var(--status-overdue-bg);
    text-align: center;
  }

  .ird-state__icon {
    margin-block-end: var(--mg-xxs);
    color: var(--status-overdue);
    font-size: var(--fs-xl);
    line-height: 1;
  }

  .ird-state__message {
    max-inline-size: 46ch;
    margin: 0;
    color: var(--color-text);
    font-size: var(--fs-base);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .ird-state__action {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--mg-xs);
    margin-block-start: var(--mg-sm);
  }

  .ird-state--compact {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
  }

  .ird-state--compact .ird-state__icon {
    font-size: var(--fs-md);
  }

  .ird-state--compact .ird-state__message {
    font-size: var(--fs-sm);
  }
</style>
