/* ============================================================================
 * web/src/lib/components/admin/shell/page-title.svelte.ts — the open page's title (S37)
 * ----------------------------------------------------------------------------
 * PageHeader writes its title here; the topbar shows it at ≤900px, where the
 * sidebar that says where you are is folded into the drawer (on a desktop
 * the page's own h1 carries it). Fixes the legacy panel's missing titles —
 * its topbar showed the church name on every tab (PORT-DEBT S37).
 *
 * Usage:
 *   $effect(() => setPageTitle(title));   // PageHeader: set, cleared on unmount
 *   {pageTitle.current}                   // Topbar
 * ========================================================================== */

let current = $state('');
/** Which setter wrote last: a page leaving clears the title only if it is still its own. */
let owner = 0;

export const pageTitle = {
  /** The open page's title; '' while no PageHeader is mounted. */
  get current(): string {
    return current;
  },
};

/** Show `title` as the open page's; the returned function takes it back. */
export function setPageTitle(title: string): () => void {
  const mine = ++owner;
  current = title.trim();
  return () => {
    if (owner === mine) current = '';
  };
}
