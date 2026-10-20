<!--
  NavItem — one destination in the admin nav (S37). Retires legacy .tab-btn:
  a <button> that swapped panels in place becomes a link to the surface's own
  route (D-036), so it has a history entry, opens in a new tab and says which
  page is open (aria-current="page" — legacy marked it with a class only).

  The visual brief: 40px rows (44px at ≤900px, where it is a touch target),
  18px icon + label; hover is the neutral tint; the current page is the solid
  slate fill with light ink AND a --color-text edge — in dark mode the fill is
  only ~1.4:1 against the sidebar, so the edge is what marks it (WCAG 1.4.11).

  `badge` is the count slot (PORT-DEBT S37): pending work shows in the nav.
  It is inside the link, so its words are part of the link's name — give a
  count words for assistive tech ("3" alone says nothing).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '#lib/components/Icon.svelte';

  interface Props {
    /** Already resolved — perms.nav routes come from ROUTES (resolve()). */
    href: string;
    label: string;
    /** Font Awesome solid name, decorative. */
    icon: string;
    /** The page open now: aria-current="page" and the active look. */
    current?: boolean;
    badge?: Snippet;
    onclick?: (event: MouseEvent) => void;
  }

  let { href, label, icon, current = false, badge, onclick }: Props = $props();
</script>

<li class="adm-nav-item">
  <!-- The route was resolved where it was built (#lib/auth/routes). -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a class="adm-nav-item__link" {href} aria-current={current ? 'page' : undefined} {onclick}>
    <span class="adm-nav-item__icon"><Icon name={icon} /></span>
    <span class="adm-nav-item__label">{label}</span>
    {#if badge}
      <span class="adm-nav-item__badge">{@render badge()}</span>
    {/if}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</li>

<style>
  .adm-nav-item__link {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-block-size: 2.5rem;
    padding: 0.45rem 0.75rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    line-height: 1.3;
    text-decoration: none;
    transition:
      background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .adm-nav-item__icon {
    display: inline-flex;
    flex: 0 0 1.125rem;
    justify-content: center;
    color: var(--color-muted);
    font-size: var(--fs-base);
  }

  .adm-nav-item__label {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .adm-nav-item__badge {
    display: inline-flex;
    flex-shrink: 0;
  }

  @media (hover: hover) {
    .adm-nav-item__link:not([aria-current]):hover {
      background: rgba(127, 127, 127, 0.12);
    }
  }

  .adm-nav-item__link:not([aria-current]):active {
    background: rgba(127, 127, 127, 0.18);
  }

  .adm-nav-item__link[aria-current] {
    border-color: var(--color-text);
    background: var(--color-dark);
    color: var(--color-white);
    font-weight: var(--fw-semibold);
  }

  .adm-nav-item__link[aria-current] .adm-nav-item__icon {
    color: inherit;
  }

  @media (max-width: 900px) {
    .adm-nav-item__link {
      min-block-size: 2.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .adm-nav-item__link {
      transition: none;
    }
  }
</style>
