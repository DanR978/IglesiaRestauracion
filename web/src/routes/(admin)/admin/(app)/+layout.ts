// The signed-in admin (S37): before any page of this group renders, the S38
// guard decides where the visit goes — the legacy email-link contract first,
// then the access state (signed out → acceso/, a second factor pending →
// verificar/, no access → sin-acceso/). It throws SvelteKit's redirect, or
// resolves when the page may render (`ready`, or `error`, which the shell
// shows with Retry). Browser-only: the admin is `ssr = false` (D-036), so
// this never runs while prerendering. It reads `url`, so it runs again on
// every navigation inside the group.
import { guardAdmin } from '#lib/stores/session.svelte.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ url }) => guardAdmin(url);
