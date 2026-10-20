// supabase/functions/_shared/auth.ts
// ─────────────────────────────────────────────────────────────────────────────
// Request-gating primitives shared by the Edge Functions: reading the bearer
// token and its JWT claims, the assurance-level (MFA) check, the developer-tier
// predicate and the CORS origin allow-list. Pure — no network, no Deno APIs —
// so every branch is unit-tested in auth.test.ts.
//
// Usage:
//   const jwt = bearerToken(req.headers.get("Authorization"));
//   const { data } = await admin.auth.getUser(jwt);   // GoTrue verifies the token
//   const claims = decodeJwtPayload(jwt);             // …only then read its claims
//   if (!claims || claims.sub !== data.user.id) → 401
//   if (!isAal2(claims)) → 403
//   if (!isDeveloper(profile, authUser, new Date())) → 403
//   const cors = corsHeaders(req.headers.get("Origin"),
//                            parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")));
// ─────────────────────────────────────────────────────────────────────────────

export type JwtClaims = Record<string, unknown>;

// "Bearer <token>" → token; anything else → "".
export function bearerToken(header: string | null | undefined): string {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : "";
}

// Claims of a compact JWS, or null when it is not one. Does NOT verify the
// signature: call it only on a token GoTrue has already accepted (getUser).
export function decodeJwtPayload(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const seg = parts[1];
  if (!/^[A-Za-z0-9_-]+$/.test(seg)) return null;
  try {
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims as JwtClaims : null;
  } catch {
    return null;
  }
}

// True when the session behind the token passed a second factor.
export function isAal2(claims: JwtClaims | null | undefined): boolean {
  return claims?.aal === "aal2";
}

export interface FactorLike {
  status?: unknown;
}

// A verified second factor on the account (GoTrue's `user.factors`).
export function hasVerifiedFactor(
  user: { factors?: ReadonlyArray<FactorLike> | null } | null | undefined,
): boolean {
  return Array.isArray(user?.factors) && user.factors.some((f) => f?.status === "verified");
}

// The second factor is satisfied when the session passed it, or when the
// account has none to pass: setting one up is optional (D-033, amended
// 2026-10-20), so only an account WITH a verified factor must use it. Mirrors
// public.is_aal2() in the database.
export function secondFactorSatisfied(
  claims: JwtClaims | null | undefined,
  user: { factors?: ReadonlyArray<FactorLike> | null } | null | undefined,
): boolean {
  return isAal2(claims) || !hasVerifiedFactor(user);
}

export interface AuthUserLike {
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
}

export interface ProfileLike {
  role?: unknown;
  allowed_tabs?: unknown;
}

export function isConfirmed(user: AuthUserLike | null | undefined): boolean {
  return typeof user?.email_confirmed_at === "string" && user.email_confirmed_at !== "";
}

// A ban counts while banned_until is in the future. An unreadable value counts
// as banned, so a malformed row never grants access.
export function isBanned(user: AuthUserLike | null | undefined, now: Date): boolean {
  const until = user?.banned_until;
  if (until === null || until === undefined || until === "") return false;
  const t = Date.parse(until);
  return Number.isNaN(t) || t > now.getTime();
}

// The developer grant on a profile: base role 'admin' plus the Usuarios tab.
export function hasDeveloperGrant(profile: ProfileLike | null | undefined): boolean {
  return profile?.role === "admin" &&
    Array.isArray(profile.allowed_tabs) && profile.allowed_tabs.includes("users");
}

// The developer tier: the grant above on a confirmed, non-banned, not deleted
// auth user. Mirrors public.account_has_system_tab(); keep the two in step.
export function isDeveloper(
  profile: ProfileLike | null | undefined,
  user: AuthUserLike | null | undefined,
  now: Date,
): boolean {
  return hasDeveloperGrant(profile) && isConfirmed(user) && !isBanned(user, now) && !user?.deleted_at;
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Entries are exact origins, or `<scheme>://<host>:*` for any port on that host
// (the dev servers). There is deliberately no catch-all "*".
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://www.irdlex.org",
  "http://localhost:*",
  "http://127.0.0.1:*",
];

// A comma list such as the ALLOWED_ORIGINS secret; blank → the default list.
export function parseAllowedOrigins(raw: string | null | undefined): string[] {
  const list = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [...DEFAULT_ALLOWED_ORIGINS];
}

export function isOriginAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // Only a bare serialized origin — no path, credentials or default port.
  if (url.origin !== origin) return false;
  return allowed.some((rule) => {
    const anyPort = rule.endsWith(":*");
    try {
      const r = new URL(anyPort ? rule.slice(0, -2) : rule);
      return anyPort
        ? r.protocol === url.protocol && r.hostname === url.hostname
        : r.origin === url.origin;
    } catch {
      return false;
    }
  });
}

// Response headers for a request from `origin`. Allow-Origin is echoed only for
// an allowed origin; Vary keeps caches from replaying it to another one.
export function corsHeaders(origin: string | null | undefined, allowed: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (origin && isOriginAllowed(origin, allowed)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
