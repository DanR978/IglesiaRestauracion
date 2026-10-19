// Vitest stand-in for $app/navigation (S37). Spies that act like the router
// where a component can observe it: pushState / replaceState make their
// state the page's (shallow routing), goto moves page.url. Everything else
// is an inert spy. Clear them in beforeEach (vi.clearAllMocks()).
import { vi } from 'vitest';
import { page } from './app-state.svelte';

export const pushState = vi.fn(async (_url: string | URL, state: App.PageState) => {
  page.state = state;
});

export const replaceState = vi.fn(async (_url: string | URL, state: App.PageState) => {
  page.state = state;
});

export const goto = vi.fn(async (url: string | URL, options: { state?: App.PageState } = {}) => {
  page.url = new URL(String(url), page.url);
  page.state = options.state ?? {};
});

export const afterNavigate = vi.fn();
export const beforeNavigate = vi.fn();
export const onNavigate = vi.fn();
export const disableScrollHandling = vi.fn();
export const invalidate = vi.fn(async () => {});
export const invalidateAll = vi.fn(async () => {});
export const refreshAll = vi.fn(async () => {});
export const preloadCode = vi.fn(async () => {});
export const preloadData = vi.fn(async () => ({ type: 'loaded' as const, status: 200, data: {} }));
