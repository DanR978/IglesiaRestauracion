// Static host: everything is prerendered at build time, and URLs are folder-style
// (`/x/` → `/x/index.html`) so every legacy URL keeps answering at the identical path,
// trailing slash included (MIGRATION.md D-001).
// The config import keeps $lib/config in every build graph, so a missing
// PUBLIC_* variable fails the build instead of shipping a nullable client (D-007).
import '$lib/config';

export const prerender = true;
export const trailingSlash = 'always';
