// $app/paths for unit tests (S38), at any base: tests/stubs/app-paths.ts is
// this at base '', and a test that needs '/app' mocks the module with
// pathsAt('/app'). resolve() takes Kit's two forms: a pathname
// ('admin/acceso/') or a route id ('/…', route groups dropped). match() knows
// no routes; a test that needs one supplies its own.
export function pathsAt(base: string) {
  const resolve = (id: string): string =>
    id.startsWith('/') ? base + (id.replace(/\/\([^/]+\)/g, '') || '/') : `${base}/${id}`;
  return {
    base,
    assets: base,
    resolve,
    asset: (file: string): string => `${base}/${file.replace(/^\//, '')}`,
    match: async (): Promise<{ id: string; params: Record<string, string> } | null> => null,
  };
}
