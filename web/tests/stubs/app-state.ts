// Vitest stand-in for $app/state (S45): a page at the domain root with no
// query, nothing navigating, no new version. A test that needs another URL
// mocks the module with its own page (a $state object, so a change re-renders).
export const page = {
  url: new URL('http://localhost/'),
  params: {},
  route: { id: null },
  status: 200,
  error: null,
  data: {},
  form: undefined,
  state: {},
};
export const navigating = {
  from: null,
  to: null,
  type: null,
  willUnload: null,
  delta: null,
  complete: null,
};
export const updated = { current: false, check: async (): Promise<boolean> => false };
