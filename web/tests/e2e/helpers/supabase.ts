/* ============================================================================
 * web/tests/e2e/helpers/supabase.ts — the e2e build's Supabase, answered in-process
 * ----------------------------------------------------------------------------
 * playwright.config.ts builds the app with PUBLIC_SUPABASE_URL = the preview
 * origin + SUPABASE_PATH, so every Supabase call a page makes is a same-origin
 * request this helper answers with page.route — GoTrue under /auth/v1,
 * PostgREST under /rest/v1. Nothing reaches a backend: an unanswered call gets
 * a 404 here and is recorded, so a spec can assert the page asked for nothing
 * else. Shapes follow GoTrue v2.187 / PostgREST as auth-js 2.112 and
 * postgrest-js read them (errors carry `code` with the API-version header).
 *
 * Sessions are what GoTrue returns: an unsigned three-part JWT (auth-js
 * decodes it for the aal, never verifies it) and the user with its factors.
 *
 * Usage:
 *   const api = await mockSupabase(page, {
 *     'GET /auth/v1/settings': { json: { external: { google: true } } },
 *     'POST /auth/v1/verify': () => ({ json: sessionResponse({ aal: 'aal1' }) }),
 *   });
 *   expect(api.unanswered()).toEqual([]);
 * ========================================================================== */
import type { Page, Request } from '@playwright/test';

/** Where the e2e build's Supabase lives: on the preview's own origin, answered only by mocks. */
export const SUPABASE_PATH = '/__supabase';

/** The preview playwright.config.ts builds and serves (E2E_PORT lets two worktrees run at once). */
export const E2E_PORT = Number(process.env.E2E_PORT) || 4173;
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;

/** The e2e build's PUBLIC_SUPABASE_URL (playwright.config.ts passes it to the build). */
export const SUPABASE_URL = `${E2E_ORIGIN}${SUPABASE_PATH}`;

/** supabase-js's default storage key for that URL: `sb-<first host label>-auth-token`. */
export const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

/** The API path of a call to the mocked Supabase (`/rest/v1/…`), or null for any other URL. */
export function supabasePath(url: URL): string | null {
  return url.pathname.startsWith(`${SUPABASE_PATH}/`)
    ? url.pathname.slice(SUPABASE_PATH.length)
    : null;
}

/** auth-js reads `code` from an error body only with this response header. */
const API_VERSION = { 'x-supabase-api-version': '2024-01-01' };

export interface Answer {
  status?: number;
  json?: unknown;
  /** Extra response headers — e.g. PostgREST's `content-range` for a head count. */
  headers?: Record<string, string>;
}

export type Handler = Answer | ((request: Request) => Answer | Promise<Answer>);

export interface MockedSupabase {
  /** Every call, as "METHOD /auth/v1/…", in order. */
  calls(): string[];
  /** Calls no handler answered. */
  unanswered(): string[];
  /** Parsed JSON bodies sent to `key`. */
  bodies(key: string): unknown[];
}

/** Answer the page's Supabase calls by "METHOD /path" (query ignored). */
export async function mockSupabase(
  page: Page,
  handlers: Record<string, Handler>,
): Promise<MockedSupabase> {
  const calls: string[] = [];
  const unanswered: string[] = [];
  const bodies = new Map<string, unknown[]>();

  await page.route(
    (url) => url.pathname.startsWith(`${SUPABASE_PATH}/`),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice(SUPABASE_PATH.length);
      const key = `${request.method()} ${path}`;
      calls.push(key);
      const body = request.postData();
      if (body) bodies.set(key, [...(bodies.get(key) ?? []), JSON.parse(body)]);

      const handler = handlers[key];
      if (!handler) {
        unanswered.push(key);
        await route.fulfill({ status: 404, json: { code: 'not_found', message: 'unmocked' } });
        return;
      }
      const answer = typeof handler === 'function' ? await handler(request) : handler;
      await route.fulfill({
        status: answer.status ?? 200,
        headers: { ...API_VERSION, ...answer.headers },
        json: answer.json ?? {},
      });
    },
  );

  return {
    calls: () => [...calls],
    unanswered: () => [...unanswered],
    bodies: (key) => bodies.get(key) ?? [],
  };
}

/** A GoTrue error answer: `{ code, message }` at `status`. */
export function gotrueError(status: number, code: string, message = code): Answer {
  return { status, json: { code, message } };
}

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

export const USER_ID = '00000000-0000-4000-8000-0000000000e2';

export interface FakeFactor {
  id: string;
  status: 'verified' | 'unverified';
  factor_type: 'totp' | 'phone';
}

/** The user GoTrue returns (GET /auth/v1/user, and inside a session). */
export function userResponse(factors: FakeFactor[] = [], email = 'ana@example.org') {
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2026-10-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    factors: factors.map((f) => ({
      ...f,
      friendly_name: `IRD ${f.id}`,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    })),
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };
}

/** What POST /auth/v1/verify (or /token) returns: a session at `aal`, opened by an emailed link. */
export function sessionResponse({
  aal = 'aal1',
  factors = [],
}: { aal?: 'aal1' | 'aal2'; factors?: FakeFactor[] } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ana@example.org',
      aal,
      amr: [{ method: 'otp', timestamp: now }],
      session_id: '00000000-0000-4000-8000-00000000c0de',
      iat: now,
      exp: now + 900,
    }),
    'e2e-unsigned',
  ].join('.');
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 900,
    expires_at: now + 900,
    refresh_token: 'e2e-refresh',
    user: userResponse(factors),
  };
}

/** The staff profile PostgREST returns for the signed-in user (`.maybeSingle()` reads an array). */
export function profileResponse(role = 'admin') {
  return [
    {
      id: USER_ID,
      display_name: 'Ana Pérez',
      role,
      allowed_tabs: [],
      ministry_id: null,
      ministry_ids: [],
      preset_id: null,
      avatar_url: null,
      created_at: '2026-10-01T00:00:00Z',
      ministries: null,
    },
  ];
}
