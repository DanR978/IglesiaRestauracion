// Vitest stand-in for $app/state (S37). `page` is runes state, so a test can
// set page.url / page.state and the component under test follows, as it
// would after a navigation. Reset it in beforeEach with resetPage().
// The navigation stub (./app-navigation.ts) writes page.state the way
// shallow routing does.
/* eslint-disable svelte/prefer-svelte-reactivity -- like Kit's, page.url is
   replaced on each navigation, never mutated in place */
export const page = $state({
  url: new URL('http://localhost/'),
  params: {} as Record<string, string>,
  route: { id: null as string | null },
  state: {} as App.PageState,
  status: 200,
  error: null as App.Error | null,
  data: {} as Record<string, unknown>,
  form: undefined as unknown,
});

export const navigating = { current: null };

export const updated = { current: false, check: async (): Promise<boolean> => false };

/** Back to a fresh page at `href` (absolute, or a path on http://localhost). */
export function resetPage(href = '/'): void {
  page.url = new URL(href, 'http://localhost');
  page.state = {};
  page.status = 200;
  page.error = null;
}
