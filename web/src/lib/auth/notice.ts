/* ============================================================================
 * web/src/lib/auth/notice.ts — why the sign-in page opened (S37 → S39)
 * ----------------------------------------------------------------------------
 * The admin shell sends people to the sign-in page in two situations the
 * page should name: they signed out (the logout button), or their session
 * ended without them (a sign-out in another tab, a refused refresh). The
 * reason travels in the query — `?aviso=sesion-cerrada | sesion-expirada` —
 * because both trips are full page loads, so nothing of the old session stays
 * in memory, and a full load drops any history or in-memory state. Only the
 * two known values mean anything; the words shown are fixed here, never read
 * from the URL.
 *
 * Usage:
 *   // the sender (S37 shell)
 *   leaveTo(withSignInNotice(ROUTES.login, 'signed-out'));
 *   // the receiver (S39 sign-in page)
 *   const notice = signInNoticeFrom(page.url.searchParams);
 *   {#if notice}<Alert tone="info" message={SIGN_IN_NOTICES[notice]} />{/if}
 * ========================================================================== */

export type SignInNotice = 'signed-out' | 'expired';

/** The query parameter that carries the notice (Spanish, like the slugs — D-036). */
export const SIGN_IN_NOTICE_PARAM = 'aviso';

const VALUES: Readonly<Record<SignInNotice, string>> = {
  'signed-out': 'sesion-cerrada',
  expired: 'sesion-expirada',
};

/** What the sign-in page says for each notice. */
export const SIGN_IN_NOTICES: Readonly<Record<SignInNotice, string>> = {
  'signed-out': 'Sesión cerrada.',
  expired: 'Tu sesión expiró.',
};

/** `target` — a sign-in path, with or without `?next=` — carrying `notice`. */
export function withSignInNotice(target: string, notice: SignInNotice): string {
  const separator = target.includes('?') ? '&' : '?';
  return `${target}${separator}${SIGN_IN_NOTICE_PARAM}=${VALUES[notice]}`;
}

/** The notice a sign-in URL carries; null when it has none or an unknown one. */
export function signInNoticeFrom(params: URLSearchParams): SignInNotice | null {
  const value = params.get(SIGN_IN_NOTICE_PARAM);
  const notices = Object.keys(VALUES) as SignInNotice[];
  return notices.find((notice) => VALUES[notice] === value) ?? null;
}
