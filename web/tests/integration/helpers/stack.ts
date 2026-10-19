/* ============================================================================
 * web/tests/integration/helpers/stack.ts — the local Supabase stack, from Node
 * ----------------------------------------------------------------------------
 * The integration suite (MIGRATION.md D-039) drives the real admin against a
 * throwaway `supabase start` stack. This module is everything the specs do
 * to that stack from Node, with the stack's own keys:
 *
 *   localStack()   URL + keys as `supabase status -o env` prints them (once
 *                  per process); refuses anything but a loopback host, so no
 *                  code path here can reach a hosted project
 *   Stack          per-test accounts and data, all synthetic: an account is
 *                  created through GoTrue's admin API (confirmed, with a
 *                  password) plus its profile through PostgREST — the local
 *                  stack has no on_auth_user_created trigger — and cleanup()
 *                  removes every account, row, audit entry and email the test
 *                  made. Tests run one at a time (workers: 1), so nothing
 *                  here is shared between them.
 *   Supabase API   password sign-in, TOTP enroll / verify, REST and Edge
 *                  Function calls with a user's own token (what the server
 *                  answers that user — D-033 / D-034)
 *
 * The service-role key lives only in this Node process: it never reaches the
 * browser, the build (playwright.integration.config.ts passes the webServer
 * the public URL and anon key alone) or the repository.
 *
 * Usage:
 *   const stack = new Stack(localStack());
 *   const ana = await stack.createAccount({ preset: 'administrador', factor: true });
 *   const aal2 = await stack.signInAal2(ana);
 *   const res = await stack.rest(aal2.access_token, 'GET', '/rest/v1/fin_funds?select=id');
 *   await stack.cleanup();
 * ========================================================================== */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { deleteMailTo } from './mailpit';
import { totp } from './totp';

/** The preview playwright.integration.config.ts builds and serves (a port of its own). */
export const INTEGRATION_PORT = Number(process.env.INTEGRATION_PORT) || 4193;
export const INTEGRATION_ORIGIN = `http://localhost:${INTEGRATION_PORT}`;

/** The build's base path: the one production serves the app at (www.irdlex.org/app/). */
export const BASE_PATH = '/app';

/** A page of the app, as an absolute path under the base (`admin/acceso/` → `/app/admin/acceso/`). */
export const appPath = (route: string): string => `${BASE_PATH}/${route.replace(/^\/+/, '')}`;

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export interface LocalStack {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailpitUrl: string;
}

let stack: LocalStack | null = null;

function loopbackOnly(name: string, raw: string | undefined): string {
  if (!raw) throw new Error(`[integration] supabase status printed no ${name}`);
  const url = new URL(raw);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`[integration] ${name} must be a loopback URL, got ${url.origin}`);
  }
  return raw.replace(/\/+$/, '');
}

/**
 * The running local stack, read with `supabase status -o env` from the repo
 * root (the same values the CI job's stack prints). Throws with the fix when
 * the stack is not running.
 */
export function localStack(): LocalStack {
  if (stack) return stack;
  let printed: string;
  try {
    printed = execSync('supabase status -o env', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
  } catch {
    throw new Error(
      '[integration] `supabase status` failed: start the local stack first (`supabase start` in the repo root).',
    );
  }
  const vars = new Map(
    [...printed.matchAll(/^([A-Z0-9_]+)="?(.*?)"?\r?$/gm)].map(([, key, value]) => [key, value]),
  );
  const anonKey = vars.get('ANON_KEY');
  const serviceRoleKey = vars.get('SERVICE_ROLE_KEY');
  if (!anonKey || !serviceRoleKey) throw new Error('[integration] supabase status printed no keys');
  stack = {
    apiUrl: loopbackOnly('API_URL', vars.get('API_URL')),
    anonKey,
    serviceRoleKey,
    mailpitUrl: loopbackOnly('MAILPIT_URL', vars.get('MAILPIT_URL') ?? vars.get('INBUCKET_URL')),
  };
  return stack;
}

/** supabase-js's localStorage key for a project URL: `sb-<first host label>-auth-token`. */
export const sessionStorageKey = (apiUrl: string): string =>
  `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`;

/** The claims of an access token (decoded, not verified — GoTrue signed it). */
export function jwtClaims(token: string): {
  sub: string;
  aal?: string;
  session_id?: string;
  exp: number;
} {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

export interface ApiSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

export interface ApiAnswer<T = unknown> {
  status: number;
  body: T;
}

/** A system preset of 20260630000006_role_presets.sql, by its slug. */
export type Preset = 'developer' | 'administrador';

export interface Account {
  id: string;
  email: string;
  password: string;
  /** The base32 secret of the authenticator the suite enrolled for it (null: none yet). */
  secret: string | null;
  factorId: string | null;
}

/** A new synthetic address on the reserved `.test` TLD (RFC 2606): nothing can deliver to it. */
export const syntheticEmail = (label: string): string =>
  `integracion-${label}-${randomBytes(4).toString('hex')}@example.test`;

/** A password GoTrue and the app's strength meter both accept. */
export const syntheticPassword = (): string => `Prueba-${randomBytes(6).toString('hex')}-Lirio`;

/** Per-test accounts, data and their cleanup, against one local stack. */
export class Stack {
  readonly keys: LocalStack;
  readonly storageKey: string;
  private readonly accounts: Account[] = [];
  private readonly emails = new Set<string>();
  private readonly auditEntities = new Set<string>();
  private readonly undo: Array<() => Promise<unknown>> = [];

  constructor(keys: LocalStack) {
    this.keys = keys;
    this.storageKey = sessionStorageKey(keys.apiUrl);
  }

  /* ── HTTP ─────────────────────────────────────────────────────────────── */

  /** A call to the stack's API gateway with a bearer token (a user's, or the service role's). */
  async call<T = unknown>(
    method: string,
    path: string,
    {
      token,
      body,
      headers = {},
    }: { token: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<ApiAnswer<T>> {
    const apikey = token === this.keys.serviceRoleKey ? token : this.keys.anonKey;
    const res = await fetch(`${this.keys.apiUrl}${path}`, {
      method,
      headers: {
        apikey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON: keep the text */
    }
    return { status: res.status, body: parsed as T };
  }

  /** As the service role (GoTrue admin API, PostgREST past RLS). Fails the test on an error status. */
  async admin<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.call<T>(method, path, {
      token: this.keys.serviceRoleKey,
      body,
      headers: { Prefer: 'return=representation' },
    });
    if (res.status >= 400) {
      throw new Error(
        `[integration] ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body;
  }

  /** PostgREST with a user's access token: whatever RLS answers that session. */
  rest<T = unknown>(
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiAnswer<T>> {
    return this.call<T>(method, path, {
      token,
      body,
      headers: { Prefer: 'return=representation' },
    });
  }

  /** The same, for setup and cleanup: fails the test on an error status. */
  async restOk<T = unknown>(
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.rest<T>(token, method, path, body);
    if (res.status >= 400) {
      throw new Error(
        `[integration] ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body;
  }

  /* ── Accounts ─────────────────────────────────────────────────────────── */

  /**
   * A confirmed staff account with a password and the profile a preset gives
   * (base role, system tabs and preset id, copied from the preset row as
   * admin-invite does). `factor: true` also enrolls and verifies an
   * authenticator through the API, so the account starts with one device.
   */
  async createAccount({
    preset = 'administrador',
    factor = false,
    label = preset,
    displayName = 'Ana Prueba',
  }: {
    preset?: Preset;
    factor?: boolean;
    label?: string;
    displayName?: string;
  } = {}): Promise<Account> {
    const email = syntheticEmail(label);
    const password = syntheticPassword();
    this.emails.add(email);
    const user = await this.admin<{ id: string }>('POST', '/auth/v1/admin/users', {
      email,
      password,
      email_confirm: true,
    });
    const account: Account = { id: user.id, email, password, secret: null, factorId: null };
    this.accounts.push(account);
    await this.addProfile(account.id, preset, displayName);
    if (factor) await this.enrollFactor(account);
    return account;
  }

  /**
   * GoTrue's admin invite: an unconfirmed user and the real invitation email
   * (supabase/email-templates/invite.html) in Mailpit. The profile is added
   * as admin-invite would add it.
   */
  async invite({
    preset = 'administrador',
    displayName = 'Rut Invitada',
  }: { preset?: Preset; displayName?: string } = {}): Promise<Account> {
    const email = syntheticEmail('invitada');
    this.emails.add(email);
    const user = await this.admin<{ id: string }>('POST', '/auth/v1/invite', { email });
    const account: Account = {
      id: user.id,
      email,
      password: syntheticPassword(),
      secret: null,
      factorId: null,
    };
    this.accounts.push(account);
    await this.addProfile(account.id, preset, displayName);
    return account;
  }

  private async addProfile(id: string, preset: Preset, displayName: string): Promise<void> {
    const [row] = await this.admin<
      Array<{ id: string; base_role: string; allowed_tabs: string[] }>
    >('GET', `/rest/v1/role_presets?slug=eq.${preset}&select=id,base_role,allowed_tabs`);
    if (!row) throw new Error(`[integration] no role preset "${preset}" in this database`);
    await this.admin('POST', '/rest/v1/profiles', {
      id,
      display_name: displayName,
      role: row.base_role,
      allowed_tabs: row.allowed_tabs,
      preset_id: row.id,
    });
  }

  /** Every factor of the account, as the GoTrue admin API lists them. */
  async factors(account: Account): Promise<Array<{ id: string; status: string }>> {
    const user = await this.admin<{ factors?: Array<{ id: string; status: string }> }>(
      'GET',
      `/auth/v1/admin/users/${account.id}`,
    );
    return user.factors ?? [];
  }

  /* ── Sign-in through the API ──────────────────────────────────────────── */

  /** Email + password: an aal1 session. Fails the test unless GoTrue accepts it. */
  async signIn(email: string, password: string): Promise<ApiSession> {
    const res = await this.passwordGrant(email, password);
    if (res.status !== 200) {
      throw new Error(`[integration] sign-in refused: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body as ApiSession;
  }

  /** GoTrue's answer to a password sign-in, whatever it is. */
  passwordGrant(email: string, password: string): Promise<ApiAnswer> {
    return this.call('POST', '/auth/v1/token?grant_type=password', {
      token: this.keys.anonKey,
      body: { email, password },
    });
  }

  /** Sign in and pass the second factor: an aal2 session. */
  async signInAal2(account: Account): Promise<ApiSession> {
    if (!account.secret || !account.factorId) throw new Error('[integration] no authenticator');
    const session = await this.signIn(account.email, account.password);
    return this.verifyFactor(session, account.factorId, account.secret);
  }

  /** Challenge + verify one TOTP factor with the code the authenticator shows now. */
  async verifyFactor(session: ApiSession, factorId: string, secret: string): Promise<ApiSession> {
    const challenge = await this.call<{ id: string }>(
      'POST',
      `/auth/v1/factors/${factorId}/challenge`,
      { token: session.access_token, body: {} },
    );
    if (challenge.status !== 200) {
      throw new Error(
        `[integration] challenge refused: ${challenge.status} ${JSON.stringify(challenge.body)}`,
      );
    }
    const verified = await this.call<ApiSession>('POST', `/auth/v1/factors/${factorId}/verify`, {
      token: session.access_token,
      body: { challenge_id: challenge.body.id, code: totp(secret) },
    });
    if (verified.status !== 200) {
      throw new Error(
        `[integration] TOTP refused: ${verified.status} ${JSON.stringify(verified.body)}`,
      );
    }
    return verified.body;
  }

  /** Enroll and verify an authenticator for the account (its first device). */
  async enrollFactor(account: Account): Promise<void> {
    const session = await this.signIn(account.email, account.password);
    const enrolled = await this.call<{ id: string; totp: { secret: string } }>(
      'POST',
      '/auth/v1/factors',
      {
        token: session.access_token,
        body: { factor_type: 'totp', friendly_name: 'Teléfono de prueba' },
      },
    );
    if (enrolled.status !== 200) {
      throw new Error(
        `[integration] enroll refused: ${enrolled.status} ${JSON.stringify(enrolled.body)}`,
      );
    }
    await this.verifyFactor(session, enrolled.body.id, enrolled.body.totp.secret);
    account.factorId = enrolled.body.id;
    account.secret = enrolled.body.totp.secret;
  }

  /* ── Data the test seeds ──────────────────────────────────────────────── */

  /** Run `step` at cleanup, before the accounts go (newest first). */
  defer(step: () => Promise<unknown>): void {
    this.undo.push(step);
  }

  /**
   * Remove, at cleanup, the audit_log rows the audit triggers write about this
   * row id. Rows an account writes are removed by its actor id anyway; this is
   * for rows seeded or dropped as the service role (actor "Sistema").
   */
  forgetAuditOf(entityId: string): void {
    this.auditEntities.add(entityId);
  }

  /* ── Cleanup ──────────────────────────────────────────────────────────── */

  /**
   * Undo everything the test made: its deferred steps (seeded rows), then the
   * audit rows those and the accounts wrote, the accounts — banned first,
   * because the last-developer guard (20261019000001 §7) refuses to drop the
   * only developer and counts a banned account out — and their emails.
   * Every step runs even when an earlier one fails; the first failure is
   * thrown at the end.
   */
  async cleanup(): Promise<void> {
    const failures: unknown[] = [];
    const attempt = async (step: () => Promise<unknown>) => {
      try {
        await step();
      } catch (e) {
        failures.push(e);
      }
    };
    for (const step of this.undo.splice(0).reverse()) await attempt(step);

    const ids = this.accounts.map((a) => a.id);
    if (ids.length) {
      await attempt(() =>
        this.admin('DELETE', `/rest/v1/audit_log?actor_id=in.(${ids.join(',')})`),
      );
    }
    const entities = [...this.auditEntities, ...ids];
    if (entities.length) {
      await attempt(() =>
        this.admin('DELETE', `/rest/v1/audit_log?entity_id=in.(${entities.join(',')})`),
      );
    }
    for (const account of this.accounts.splice(0)) {
      await attempt(() =>
        this.admin('PUT', `/auth/v1/admin/users/${account.id}`, { ban_duration: '876000h' }),
      );
      await attempt(() => this.admin('DELETE', `/rest/v1/profiles?id=eq.${account.id}`));
      await attempt(() => this.admin('DELETE', `/auth/v1/admin/users/${account.id}`));
    }
    for (const email of this.emails) await attempt(() => deleteMailTo(this.keys.mailpitUrl, email));
    this.emails.clear();
    this.auditEntities.clear();
    if (failures.length) throw failures[0];
  }
}
