/* ============================================================================
 * web/client-chunks.ts — how the client build splits its code (S37 public-page cost)
 * ----------------------------------------------------------------------------
 * Rolldown's automatic splitting cuts shared code into one chunk per set of
 * routes that use it. With the admin integrated, the code every page loads
 * at startup (Kit's client, the Svelte runtime, the root layout's theme and
 * config) was cut into a dozen files: a dozen preloads on the throttled link
 * the render-blocking CSS also needs, and a dozen more entries in app.js's
 * dependency map. Two groups put it back together:
 *
 *   boot      Kit's payload module and Vite's preload helper: all that
 *             entry/start imports. Kit loads its client only after init()
 *             has set the payload, because $app/env (`version`) and
 *             $app/paths read the payload while they evaluate, so the chunk
 *             entry/start imports must hold nothing else.
 *   startup   every module the startup roots import (Kit's client entry,
 *             the route manifest app.js, the root layout): what every page
 *             loads anyway, as one chunk instead of a dozen.
 *
 * Everything else (each page's own code, what pages share, the whole admin)
 * stays with rolldown's automatic splitting, which already keeps admin code
 * off public pages. An admin group was measured and left out (S37 session
 * file, "Public-page cost"): Kit builds with preserveEntrySignatures
 * 'strict', so a group must take its modules' dependencies with it, and one
 * admin chunk dragged the sign-in screens and their primitives into Inicio
 * (+8.6 kB) to save public pages 0.3 kB.
 *
 * clientChunkGuard() fails the client build when either promise breaks:
 *   · a public page would load admin code (routes/(admin), components/admin,
 *     auth, the session / perms / ministries stores);
 *   · entry/start would load, before init(), a module that reads the payload.
 *
 * Usage (vite.config.ts):
 *   import { CLIENT_CHUNK_GROUPS, clientChunkGuard } from './client-chunks';
 *   plugins: [sveltekit({ … }), clientChunkGuard()],
 *   environments: { client: { build: { rolldownOptions: { output: {
 *     codeSplitting: { groups: CLIENT_CHUNK_GROUPS } } } } } },
 * ========================================================================== */
import type { Plugin, Rolldown } from 'vite';

/** Module ids with forward slashes, whatever the platform. */
const posix = (id: string): string => id.split('\\').join('/');

/** What entry/start imports: Kit's payload and Vite's preload helper (see the banner). */
const BOOT = /\/@sveltejs\/kit\/src\/runtime\/client\/payload\.js$|vite\/preload-helper\.js$/;

/** Imported by every page at startup, after init(): Kit's client, the route manifest, the root layout. */
const STARTUP_ROOT =
  /\/@sveltejs\/kit\/src\/runtime\/client\/client-entry\.js$|\/generated\/build\/client-optimized\/app\.js$|\/src\/routes\/\+layout\.(svelte|ts)$/;

/** The root layout's own files stay in its node, like every other route's. */
const ROOT_LAYOUT = /\/src\/routes\/\+layout\.(svelte|ts)$/;

/** Kit's own group takes its route-manifest data module; ours never do. */
const KIT_MANIFEST = /app-manifest\.js$/;

/** Kit's modules that read the payload while they evaluate. */
const PAYLOAD_READERS =
  /\/@sveltejs\/kit\/src\/runtime\/(client\/client|app\/env\/client|app\/paths\/internal\/client)\.js$/;

/** Admin code: the admin's routes and components, sign-in, and the admin-only stores. */
const ADMIN_CODE =
  /\/src\/(routes\/\(admin\)|lib\/components\/admin|lib\/auth)\/|\/src\/lib\/stores\/(session|perms|ministries)\./;

const ADMIN_ROUTE = /\/src\/routes\/\(admin\)\//;

/** Whether a startup root imports `id`, at any depth (static imports only). */
function loadedAtStartup(id: string, graph: Rolldown.ChunkingContext): boolean {
  const seen = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    if (STARTUP_ROOT.test(posix(current))) return true;
    pending.push(...(graph.getModuleInfo(current)?.importers ?? []));
  }
  return false;
}

/** The client's chunk groups (output.codeSplitting.groups); the rest is split automatically. */
export const CLIENT_CHUNK_GROUPS: Rolldown.CodeSplittingGroup[] = [
  { name: 'boot', test: (id) => BOOT.test(posix(id)), priority: 2 },
  {
    name: (id, graph) => {
      const path = posix(id);
      if (BOOT.test(path) || ROOT_LAYOUT.test(path) || KIT_MANIFEST.test(path)) return null;
      if (graph.getModuleInfo(id)?.isEntry) return null;
      return loadedAtStartup(id, graph) ? 'startup' : null;
    },
    priority: 1,
  },
];

/** Fails the client build if a public page would load admin code, or start a payload reader. */
export function clientChunkGuard(): Plugin {
  return {
    name: 'ird:client-chunk-guard',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (this.environment.name !== 'client') return;
      const chunks = new Map<string, Rolldown.OutputChunk>();
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') chunks.set(item.fileName, item);
      }
      /** A chunk and every chunk it imports statically: what loading it preloads. */
      const closure = (from: Rolldown.OutputChunk): Rolldown.OutputChunk[] => {
        const seen = new Map<string, Rolldown.OutputChunk>();
        const pending = [from];
        while (pending.length > 0) {
          const chunk = pending.pop() as Rolldown.OutputChunk;
          if (seen.has(chunk.fileName)) continue;
          seen.set(chunk.fileName, chunk);
          for (const file of chunk.imports) {
            const next = chunks.get(file);
            if (next) pending.push(next);
          }
        }
        return [...seen.values()];
      };
      /** The route files a node entry renders (its +page / +layout / +error). */
      const routeFiles = (node: Rolldown.OutputChunk): readonly string[] =>
        node.facadeModuleId ? (this.getModuleInfo(node.facadeModuleId)?.importedIds ?? []) : [];

      const problems: string[] = [];
      const entries = [...chunks.values()].filter((chunk) => chunk.isEntry);
      const start = entries.find((chunk) => chunk.name === 'entry/start');
      for (const chunk of start ? closure(start) : []) {
        const reader = chunk.moduleIds.find((id) => PAYLOAD_READERS.test(posix(id)));
        if (reader) problems.push(`entry/start loads ${reader} before init() (${chunk.fileName})`);
      }
      const publicEntries = entries.filter(
        (chunk) =>
          chunk.name === 'entry/start' ||
          chunk.name === 'entry/app' ||
          (chunk.name.startsWith('nodes/') &&
            !routeFiles(chunk).some((id) => ADMIN_ROUTE.test(posix(id)))),
      );
      for (const entry of publicEntries) {
        for (const chunk of closure(entry)) {
          const admin = chunk.moduleIds.find((id) => ADMIN_CODE.test(posix(id)));
          if (admin) problems.push(`${entry.name} loads admin code ${admin} (${chunk.fileName})`);
        }
      }
      if (problems.length > 0) {
        this.error(
          `client chunks broke a promise of client-chunks.ts:\n  ${problems.join('\n  ')}`,
        );
      }
    },
  };
}
