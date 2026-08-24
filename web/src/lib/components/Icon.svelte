<!--
  Icon — the single icon component (S13, DESIGN-SYSTEM §4.1).
  Renders a Font Awesome glyph (`fas` / `far` / `fab`) or a symbol from the
  trusted static sprite (`sprite`). Retires legacy js/utils/load-icons.js.

  `label` is the a11y switch: present → the icon is meaningful (role="img" +
  aria-label); absent → decorative (aria-hidden="true"). An icon-only control
  keeps its name on the CONTROL (IconButton, S14), and its icon stays decorative.

  Size and colour are inherited (1em, currentColor) so an icon always matches
  the text it sits in; pass `class` to size a sprite symbol explicitly.
  An unknown `name` renders nothing (and warns) — a DB/user value can never
  reach the sprite or add a class to the element.
-->
<script lang="ts">
  import { injectSprite, isValidIcon, type IconSet } from './icon';

  interface Props {
    /** Glyph source. Defaults to Font Awesome solid, the legacy default. */
    set?: IconSet;
    /** Font Awesome name without the `fa-` prefix, or a sprite symbol id. */
    name: string;
    /** Accessible name. Present → meaningful icon; absent → decorative. */
    label?: string;
    /** Continuous rotation (loading spinners). Honours prefers-reduced-motion. */
    spin?: boolean;
    class?: string;
  }

  let { set = 'fas', name, label, spin = false, class: className = '' }: Props = $props();

  const valid = $derived(isValidIcon(set, name));
  const meaningful = $derived(typeof label === 'string' && label.trim() !== '');
  const classes = $derived(
    ['icon', set === 'sprite' ? 'icon--sprite' : `${set} fa-${name}`, className]
      .filter(Boolean)
      .join(' '),
  );

  $effect(() => {
    if (!valid) console.warn(`[icon] unknown ${set} icon "${name}" — nothing rendered`);
  });

  // Before the DOM update that shows the <use>, make sure its target exists;
  // injectSprite() also re-points any <use> already in the DOM (hydration) for
  // engines that do not re-resolve a late-arriving target (Safari).
  $effect.pre(() => {
    if (set === 'sprite') injectSprite();
  });
</script>

{#if valid}
  {#if set === 'sprite'}
    <svg
      class={classes}
      class:icon--spin={spin}
      focusable="false"
      role={meaningful ? 'img' : undefined}
      aria-label={meaningful ? label : undefined}
      aria-hidden={meaningful ? undefined : 'true'}
    >
      <use href="#{name}" xlink:href="#{name}"></use>
    </svg>
  {:else}
    <i
      class={classes}
      class:fa-spin={spin}
      role={meaningful ? 'img' : undefined}
      aria-label={meaningful ? label : undefined}
      aria-hidden={meaningful ? undefined : 'true'}
    ></i>
  {/if}
{/if}

<style>
  /* Font Awesome styles its own <i> (inline-block, line-height 1, glyph
     width). The sprite <svg> gets the same box so the two sets line up in
     running text: 1em square, currentColor, the -0.125em baseline FA uses. */
  .icon--sprite {
    display: inline-block;
    width: 1em;
    height: 1em;
    flex-shrink: 0;
    overflow: visible;
    vertical-align: -0.125em;
    fill: currentColor;
  }

  .icon--spin {
    animation: icon-spin 2s linear infinite;
  }

  @keyframes icon-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon--spin {
      animation: none;
    }
  }

  /* The sprite holder injectSprite() creates: kept OUT of layout and off the
     accessibility tree (the sprite root is also display:none, as in legacy). */
  :global(#svg-sprite-holder) {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    clip-path: inset(50%);
    pointer-events: none;
  }
</style>
