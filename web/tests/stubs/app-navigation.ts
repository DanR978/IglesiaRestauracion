// Vitest stand-in for $app/navigation (S45): there is no router under jsdom.
// Every export exists and does nothing, so a component that registers a
// navigation hook still mounts; a test that needs one mocks the module
// (vi.mock('$app/navigation', …)) and records the calls.
export const afterNavigate = (): void => {};
export const beforeNavigate = (): void => {};
export const onNavigate = (): void => {};
export const disableScrollHandling = (): void => {};
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
