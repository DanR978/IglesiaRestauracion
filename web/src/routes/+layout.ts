// Static host: everything is prerendered at build time, and URLs are folder-style
// (`/x/` → `/x/index.html`) so every legacy URL keeps answering at the identical path,
// trailing slash included (MIGRATION.md D-001).
export const prerender = true;
export const trailingSlash = 'always';
