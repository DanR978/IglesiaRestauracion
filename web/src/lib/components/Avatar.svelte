<!--
  Avatar — a person's photo or initials (PR-C2, DESIGN-SYSTEM §4.1).
  Retires paintAvatar / .adm-avatar / .user-row__avatar.

  The initials (or a person glyph, for a name with no letters) are ALWAYS drawn
  underneath; the photo, an <img>, covers them once it loads. A photo that is
  missing, refused by avatarSrc() or fails to load — including one that failed
  before hydration, which no onerror handler ever sees — leaves the initials.

  Accessibility: next to the person's visible name the avatar is decorative
  (`decorative` → alt="" and hidden). Alone, it is named by the person: the
  photo's alt, or role="img" + aria-label on the initials disc.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { initials } from '#lib/initials.js';
  import { AVATAR_BLOCK, avatarSrc, type AvatarSize } from './avatar';

  interface Props {
    /** The person's name: their initials, and the photo's alt text unless decorative. */
    name: string;
    /** Photo URL (profiles.avatar_url). Missing, refused or broken → initials. */
    src?: string | null;
    /** 24 · 36 (default) · 48 · 96 px. */
    size?: AvatarSize;
    /** The name is visible beside the avatar: hide it from assistive tech (alt=""). */
    decorative?: boolean;
    class?: string;
  }

  let { name, src, size = 36, decorative = false, class: className = '' }: Props = $props();

  const photo = $derived(avatarSrc(src));
  const mono = $derived(initials(name));

  /** The URL that failed — a new `src` gets its own chance to load. */
  let failedSrc = $state<string | null>(null);
  let img = $state<HTMLImageElement>();

  const showPhoto = $derived(photo !== null && failedSrc !== photo);
  // Named by the disc only while the initials are what the user sees.
  const discNamed = $derived(!decorative && !showPhoto);

  const classes = $derived(
    [AVATAR_BLOCK, `${AVATAR_BLOCK}--${size}`, className].filter(Boolean).join(' '),
  );

  // A prerendered page starts loading the photo before hydration, so a 404 can
  // fire `error` before Svelte attaches onerror. A complete image with no
  // pixels is a failed one.
  $effect(() => {
    if (img?.complete && img.naturalWidth === 0 && photo !== null) failedSrc = photo;
  });
</script>

<span
  class={classes}
  role={discNamed ? 'img' : undefined}
  aria-label={discNamed ? name : undefined}
  aria-hidden={decorative ? 'true' : undefined}
>
  <span class="ird-avatar__fallback" aria-hidden="true">
    {#if mono}
      {mono}
    {:else}
      <Icon set="fas" name="user" />
    {/if}
  </span>
  {#if showPhoto}
    <img
      bind:this={img}
      class="ird-avatar__img"
      src={photo}
      alt={decorative ? '' : name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onerror={() => (failedSrc = photo)}
    />
  {/if}
</span>

<style>
  /* Legacy .adm-avatar: a full circle, the slate disc, white bold initials.
     --static-white, not --color-white: that ink dims to #dfdedc in dark mode. */
  .ird-avatar {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    inline-size: var(--avatar-size);
    block-size: var(--avatar-size);
    overflow: hidden;
    border-radius: var(--radius-full);
    background: var(--color-dark);
    color: var(--static-white);
    font-weight: var(--fw-bold);
    line-height: 1;
    letter-spacing: 0.02em;
    vertical-align: middle;
    user-select: none;
  }

  .ird-avatar--24 {
    --avatar-size: 1.5rem;
    font-size: var(--fs-xxs);
  }

  .ird-avatar--36 {
    --avatar-size: 2.25rem;
    font-size: var(--fs-sm);
  }

  .ird-avatar--48 {
    --avatar-size: 3rem;
    font-size: var(--fs-md);
  }

  .ird-avatar--96 {
    --avatar-size: 6rem;
    font-size: var(--fs-2xl);
  }

  /* A theme-neutral hairline ABOVE the photo, so a white-background picture
     keeps its edge on a white card (the legacy lideres tile does the same). */
  .ird-avatar::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.18);
    pointer-events: none;
  }

  /* The photo covers the initials; its own background hides them behind a
     transparent PNG. reset.css makes <img> a block, which is what we want. */
  .ird-avatar__img {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    background: var(--color-surface);
  }
</style>
