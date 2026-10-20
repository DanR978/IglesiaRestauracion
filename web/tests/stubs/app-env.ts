// Vitest stand-in for $app/env (Kit 3's rename of $app/environment, same
// exports): unit tests run as "not the browser", which is exactly the
// prerender posture client.ts must be safe under.
export const browser = false;
export const dev = false;
export const building = false;
export const version = 'test';
