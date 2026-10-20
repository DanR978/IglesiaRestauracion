/* ============================================================================
 * web/tests/e2e/helpers/admin-backend.ts — one staff account, its whole backend mocked
 * ----------------------------------------------------------------------------
 * For the specs that walk the admin as a given account in a given state —
 * the CSP sweep, the reloads, the screenshots, the /app base-path run — this
 * answers every Supabase call the shell, Inicio, Mi cuenta and the sign-in
 * screens make (through mockSupabase, so anything unanswered is recorded and
 * gets a 404), and seeds that account's session in localStorage before the
 * app boots. Accounts:
 *
 *   DEVELOPER   Administrador with the system tabs (ministries, users,
 *               activity, settings): every Inicio card
 *   TREASURER   Tesorería: the calendar counts and the Balance
 *   CHALLENGE   aal1 with a verified authenticator: verificar/ asks for the code
 *   ENROLL      aal1 with no authenticator: verificar/ shows the QR to enrol
 *   NO_ACCESS   signed in, not staff: sin-acceso/
 *
 * Nothing reaches a backend: the e2e build's Supabase is the preview itself
 * (helpers/supabase.ts), and the session is an unsigned 3-part JWT.
 *
 * Usage:
 *   const api = await staffBackend(page, DEVELOPER);   // answers + seeds the session
 *   await page.goto('/admin/');
 *   expect(api.unanswered()).toEqual([]);
 * ========================================================================== */
import type { Page } from '@playwright/test';
import {
  type Answer,
  STORAGE_KEY,
  USER_ID,
  mockSupabase,
  type FakeFactor,
  type Handler,
  type MockedSupabase,
} from './supabase';

export interface StaffAccount {
  /** profiles.role */
  role: string;
  /** profiles.allowed_tabs */
  allowedTabs: string[];
  /** The role preset's name (D-006 presets), shown on Mi cuenta. */
  preset: string | null;
  aal: 'aal1' | 'aal2';
  factors: FakeFactor[];
}

const VERIFIED: FakeFactor[] = [{ id: 'f-1', status: 'verified', factor_type: 'totp' }];

export const DEVELOPER: StaffAccount = {
  role: 'admin',
  allowedTabs: ['ministries', 'users', 'activity', 'settings'],
  preset: 'Desarrollador',
  aal: 'aal2',
  factors: VERIFIED,
};
export const TREASURER: StaffAccount = {
  role: 'treasurer',
  allowedTabs: [],
  preset: 'Tesorería',
  aal: 'aal2',
  factors: VERIFIED,
};
export const CHALLENGE: StaffAccount = { ...DEVELOPER, aal: 'aal1' };
export const ENROLL: StaffAccount = { ...DEVELOPER, aal: 'aal1', factors: [] };
/** Signed in, but not staff: sin-acceso/. */
export const NO_ACCESS: StaffAccount = {
  role: 'member',
  allowedTabs: [],
  preset: null,
  aal: 'aal2',
  factors: VERIFIED,
};

export const EMAIL = 'ana@example.org';
const DAY = 24 * 3600;
const b64url = (value: object | string): string =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** `YYYY-MM-DD`, `offset` days from today (local time, as the app reads dates). */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0')))
    .join('-');
}

function user(account: StaffAccount) {
  const stamp = '2026-01-15T12:00:00Z';
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    email_confirmed_at: stamp,
    created_at: stamp,
    updated_at: stamp,
    last_sign_in_at: '2026-10-19T12:00:00Z',
    app_metadata: { provider: 'email', providers: ['email', 'google'] },
    user_metadata: {},
    identities: ['email', 'google'].map((provider) => ({
      id: `i-${provider}`,
      identity_id: `ii-${provider}`,
      user_id: USER_ID,
      provider,
      created_at: stamp,
      last_sign_in_at: '2026-10-19T12:00:00Z',
    })),
    factors: account.factors.map((factor) => ({
      ...factor,
      friendly_name: 'Teléfono de Ana',
      created_at: '2026-03-01T12:00:00Z',
      updated_at: '2026-03-01T12:00:00Z',
    })),
  };
}

/** The session supabase-js keeps in localStorage, at the account's assurance level. */
export function storedSession(account: StaffAccount) {
  const now = Math.floor(Date.now() / 1000);
  const amr = [{ method: 'password', timestamp: now }];
  if (account.aal === 'aal2') amr.push({ method: 'totp', timestamp: now });
  const claims = {
    sub: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    aal: account.aal,
    amr,
    session_id: '00000000-0000-4000-8000-00000000c0de',
    iat: now,
    exp: now + DAY,
  };
  return {
    access_token: [b64url({ alg: 'HS256', typ: 'JWT' }), b64url(claims), b64url('e2e')].join('.'),
    token_type: 'bearer',
    expires_in: DAY,
    expires_at: now + DAY,
    refresh_token: 'e2e-refresh',
    user: user(account),
  };
}

function profile(account: StaffAccount) {
  return {
    id: USER_ID,
    display_name: 'Ana María López',
    role: account.role,
    allowed_tabs: account.allowedTabs,
    ministry_id: null,
    ministry_ids: [],
    preset_id: account.preset ? '7a1c4c55-0d6b-4b5e-9f3a-1e2d3c4b5a69' : null,
    avatar_url: null,
    created_at: '2026-01-15T12:00:00Z',
    ministries: null,
    role_presets: account.preset ? { name: account.preset } : null,
  };
}

const EVENTS = [
  {
    id: 'e1',
    title: 'Culto de oración',
    date: day(0),
    time: '7:00 PM',
    location: null,
    cancelled: false,
    ministries: { name: 'Intercesión', color: '#5c3d9c' },
  },
  {
    id: 'e2',
    title: 'Reunión de jóvenes',
    date: day(3),
    time: '7:30 PM',
    location: null,
    cancelled: false,
    ministries: { name: 'Jóvenes', color: '#1e6b61' },
  },
  {
    id: 'e3',
    title: 'Estudio bíblico',
    date: day(8),
    time: null,
    location: null,
    cancelled: false,
    ministries: { name: 'Damas', color: '#a05a10' },
  },
];

function audit() {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  return [
    {
      id: '00000000-0000-4000-8000-000000000001',
      actor_id: null,
      actor_name: 'Luis García',
      action: 'UPDATE',
      entity: 'gallery_albums',
      entity_id: null,
      label: 'Retiro de jóvenes 2026',
      created_at: ago(50),
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      actor_id: null,
      actor_name: 'Sistema',
      action: 'INSERT',
      entity: 'event_registrations',
      entity_id: null,
      label: 'Sofía Hernández',
      created_at: ago(180),
    },
  ];
}

/** A PostgREST head count: the total travels in Content-Range. */
const count = (total: number): Answer => ({ headers: { 'content-range': `*/${total}` } });

/** Every call the admin makes for `account`, answered. */
export function staffHandlers(account: StaffAccount): Record<string, Handler> {
  return {
    'GET /auth/v1/settings': { json: { external: { email: true } } },
    'GET /auth/v1/user': { json: user(account) },
    'POST /auth/v1/logout': { json: {} },
    'POST /auth/v1/factors': {
      json: {
        id: 'f-new',
        type: 'totp',
        friendly_name: 'IRD',
        totp: {
          qr_code:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0h2v2H0zM2 2h2v2H2z"/></svg>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: `otpauth://totp/IRD:${EMAIL}?secret=JBSWY3DPEHPK3PXP&issuer=IRD`,
        },
      },
    },
    'POST /auth/v1/factors/f-1/challenge': {
      json: { id: 'c-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 },
    },
    'GET /rest/v1/profiles': { json: [profile(account)] },
    'GET /rest/v1/ministries': { json: [] },
    'HEAD /rest/v1/calendar_events': (request) =>
      count(new URL(request.url()).searchParams.getAll('date').length > 1 ? 23 : 14),
    'HEAD /rest/v1/events': count(2),
    'HEAD /rest/v1/discipleship_interests': count(3),
    'HEAD /rest/v1/gallery_albums': count(18),
    'GET /rest/v1/calendar_events': { json: EVENTS },
    'GET /rest/v1/fin_income': { json: [{ amount: 1250 }] },
    'GET /rest/v1/fin_expenses': { json: [{ amount: 980.25, ministry_id: null, label: null }] },
    'GET /rest/v1/fin_payables': { json: [] },
    'GET /rest/v1/audit_log': { json: audit() },
  };
}

/** Answer the backend for `account` and seed its session before the app boots. */
export async function staffBackend(page: Page, account: StaffAccount): Promise<MockedSupabase> {
  const api = await mockSupabase(page, staffHandlers(account));
  await page.addInitScript(
    ({ key, session }) => {
      try {
        // Once per test: a later page load must see what the app left there.
        if (sessionStorage.getItem('e2e-seeded')) return;
        sessionStorage.setItem('e2e-seeded', '1');
        localStorage.setItem(key, JSON.stringify(session));
      } catch {
        // Storage refused: the assertions that need a session fail loudly instead.
      }
    },
    { key: STORAGE_KEY, session: storedSession(account) },
  );
  return api;
}

/** Answer the signed-out sign-in screens (no session seeded). */
export function signedOutBackend(page: Page): Promise<MockedSupabase> {
  return mockSupabase(page, { 'GET /auth/v1/settings': { json: { external: { email: true } } } });
}
