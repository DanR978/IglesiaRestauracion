// Vitest stand-in for $app/navigation (S39): there is no client router under
// jsdom. Every export is an inert no-op so a module that imports one can load;
// a test that cares replaces it with vi.mock('$app/navigation', …).
export const goto = async (): Promise<void> => {};
export const invalidate = async (): Promise<void> => {};
export const invalidateAll = async (): Promise<void> => {};
export const refreshAll = async (): Promise<void> => {};
export const preloadCode = async (): Promise<void> => {};
export const preloadData = async (): Promise<{ type: 'loaded'; status: number; data: object }> => ({
  type: 'loaded',
  status: 200,
  data: {},
});
export const pushState = (): void => {};
export const replaceState = (): void => {};
export const afterNavigate = (): void => {};
export const beforeNavigate = (): void => {};
export const onNavigate = (): void => {};
export const disableScrollHandling = (): void => {};
