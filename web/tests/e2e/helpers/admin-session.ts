/* ============================================================================
 * web/tests/e2e/helpers/admin-session.ts — a signed-in staff session, no backend
 * ----------------------------------------------------------------------------
 * Seeds supabase-js's stored session before the app boots: a 3-part JWT at
 * aal2 (auth-js reads the level from the token's claims; nothing verifies the
 * signature) and a user with a verified factor, so the S38 store resolves
 * `ready` from the profile read alone. The same shape S37's admin-shell spec
 * builds inline. Nothing here contacts a Supabase project: the spec answers
 * the API with page.route.
 *
 * Usage:
 *   import { SUPABASE, seedSession } from './helpers/admin-session';
 *   await seedSession(page, { userId: USER_ID, theme: 'dark' });
 * ========================================================================== */
import type { Page } from '@playwright/test';
import { STORAGE_KEY, SUPABASE_URL } from './supabase';

/** What the e2e build points at (playwright.config.ts): same-origin, answered by mocks. */
export const SUPABASE = new URL(SUPABASE_URL);

export { STORAGE_KEY };

export const ADMIN_THEME_KEY = 'ird.app.admin.theme';

const base64url = (value: object | string): string =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** A session as supabase-js stores it: valid for an hour, two-step verified. */
export function storedSession(userId: string, email = 'ana@example.org'): object {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: 'authenticated',
    exp: now + 3600,
    iat: now,
    sub: userId,
    email,
    role: 'authenticated',
    aal: 'aal2',
    amr: [
      { method: 'totp', timestamp: now },
      { method: 'password', timestamp: now },
    ],
    session_id: '0b0e2f6c-9c4d-4f8e-9a1b-2c3d4e5f6a7b',
  };
  return {
    access_token: [{ alg: 'HS256', typ: 'JWT' }, claims, 'e2e-mock-signature']
      .map(base64url)
      .join('.'),
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      factors: [{ id: 'f-1', status: 'verified', factor_type: 'totp' }],
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

/** Store the session (and a forced admin theme) before any of the app's scripts run. */
export async function seedSession(
  page: Page,
  { userId, theme }: { userId: string; theme?: 'light' | 'dark' },
): Promise<void> {
  await page.addInitScript(
    ({ key, session, themeKey, forced }) => {
      localStorage.setItem(key, JSON.stringify(session));
      if (forced) localStorage.setItem(themeKey, forced);
    },
    { key: STORAGE_KEY, session: storedSession(userId), themeKey: ADMIN_THEME_KEY, forced: theme },
  );
}
