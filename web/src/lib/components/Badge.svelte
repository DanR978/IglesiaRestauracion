<!--
  Badge — the one data-driven pill (PR-C2, DESIGN-SYSTEM §4.1). Non-interactive.
  Retires the role/status/category pill families and the hard-coded
  always-green "Activa" (see badge.ts for the full list and the three kinds).

  A status badge is ALWAYS glyph + words (D-023): the tone picks a distinct
  default glyph, so success / warn / danger differ by shape as well as hue.
  Role chips differ by treatment, glyph and label. A tinted chip takes a
  record's colour only through badgeTint() and the `--tint` custom property.
  The words are text — never {@html} — and a badge with no words renders
  nothing (a pill that says nothing is a bug, not a state).
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import {
    BADGE_BLOCK,
    BADGE_TONE_ICONS,
    ROLE_BADGES,
    badgeTint,
    isBadgeRole,
    roleModifier,
    type BadgeProps,
  } from './badge';

  let {
    label,
    tone = 'neutral',
    role: staffRole,
    tint,
    icon,
    class: className = '',
  }: BadgeProps = $props();

  const kind = $derived(
    staffRole !== undefined ? 'role' : tint !== undefined ? 'tinted' : 'status',
  );
  const knownRole = $derived(isBadgeRole(staffRole) ? staffRole : undefined);
  const colour = $derived(kind === 'tinted' ? badgeTint(tint) : null);

  const text = $derived((label ?? (knownRole ? ROLE_BADGES[knownRole].label : '')).trim());

  const glyph = $derived.by(() => {
    if (icon) return icon;
    if (kind === 'status') return BADGE_TONE_ICONS[tone];
    if (kind === 'role' && knownRole) return ROLE_BADGES[knownRole].icon;
    return undefined;
  });
  // A record colour with no glyph of its own shows as a dot; without a valid
  // colour there is nothing to show, and the chip falls back to neutral.
  const dot = $derived(colour !== null && !icon);

  const classes = $derived.by(() => {
    const modifiers =
      kind === 'role'
        ? knownRole
          ? ['role', roleModifier(knownRole)]
          : ['neutral']
        : kind === 'tinted'
          ? [colour ? 'tinted' : 'neutral']
          : [tone];
    return [BADGE_BLOCK, ...modifiers.map((m) => `${BADGE_BLOCK}--${m}`), className]
      .filter(Boolean)
      .join(' ');
  });

  $effect(() => {
    if (kind === 'tinted' && colour === null) {
      console.warn(`[badge] ${JSON.stringify(tint)} is not a hex colour — rendering neutral`);
    }
    if (kind === 'role' && !knownRole) {
      console.warn(`[badge] unknown role ${JSON.stringify(staffRole)}`);
    }
    if (!text) console.warn('[badge] a badge needs words — nothing rendered');
  });
</script>

{#if text}
  <span class={classes} style:--tint={colour}>
    {#if dot}
      <span class="ird-badge__dot" aria-hidden="true"></span>
    {/if}
    {#if glyph}
      <span class="ird-badge__icon"><Icon set="fas" name={glyph} /></span>
    {/if}
    <span class="ird-badge__label">{text}</span>
  </span>
{/if}

<style>
  /* Legacy baseline (.role-badge / .cat-badge): weight 700, 2px 8px, a full
     pill, uppercase micro-label with .04em tracking — at --fs-xs (D-015). */
  .ird-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    max-inline-size: 100%;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-full);
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    line-height: 1.4;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    vertical-align: middle;
  }

  /* A long ministry name truncates inside its container instead of widening
     the row at 360px; the full words stay in the DOM for assistive tech. */
  .ird-badge__label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ird-badge__icon {
    display: inline-flex;
    flex-shrink: 0;
    font-size: 0.95em;
  }

  /* Status tones read the honest vocabulary's ink + tint pairs (D-023), never
     a hex: neutral = inactive/finished, info = open, success = active/paid,
     warn = pending, danger = overdue/closed. */
  .ird-badge--neutral {
    background: var(--status-inactive-bg);
    color: var(--status-inactive);
  }

  .ird-badge--info {
    background: var(--status-open-bg);
    color: var(--status-open);
  }

  .ird-badge--success {
    background: var(--status-active-bg);
    color: var(--status-active);
  }

  .ird-badge--warn {
    background: var(--status-pending-bg);
    color: var(--status-pending);
  }

  .ird-badge--danger {
    background: var(--status-overdue-bg);
    color: var(--status-overdue);
  }

  /* Three role treatments that cannot be mistaken for each other at a glance:
     solid (admin), outlined (treasurer), tinted (leader) — slate throughout. */
  .ird-badge--admin {
    background: var(--color-dark);
    /* --static-white: --color-white dims to #dfdedc on the dark-mode fill. */
    color: var(--static-white);
  }

  .ird-badge--treasurer {
    background: transparent;
    color: var(--color-text);
    box-shadow: inset 0 0 0 1px currentColor;
  }

  .ird-badge--ministry-leader {
    background: rgba(127, 127, 127, 0.12);
    color: var(--color-text);
  }

  /* The record's colour paints the tint and the dot/glyph; the words keep the
     reversing ink, which clears AA on any 14% tint in both themes. */
  .ird-badge--tinted {
    background: color-mix(in srgb, var(--tint) 14%, transparent);
    color: var(--color-text);
  }

  .ird-badge--tinted .ird-badge__icon {
    color: var(--tint);
  }

  /* The ring keeps a near-surface colour (white on white) visible. */
  .ird-badge__dot {
    flex-shrink: 0;
    inline-size: 0.6em;
    block-size: 0.6em;
    border-radius: var(--radius-full);
    background: var(--tint);
    box-shadow: 0 0 0 1px rgba(127, 127, 127, 0.35);
  }
</style>
