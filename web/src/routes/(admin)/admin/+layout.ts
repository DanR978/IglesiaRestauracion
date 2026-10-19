// Every admin route is prerendered as an empty shell that boots the client
// router (D-036): GitHub Pages serves a real /admin/…/index.html for each one,
// so reloads and deep links work without an SPA fallback. Nothing here renders
// on the server — the session lives in the browser.
export const ssr = false;
