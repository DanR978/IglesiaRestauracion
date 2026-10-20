// supabase/functions/_shared/auth.test.ts — unit tests for auth.ts.
// Run: deno test supabase/functions

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  bearerToken,
  corsHeaders,
  decodeJwtPayload,
  DEFAULT_ALLOWED_ORIGINS,
  hasDeveloperGrant,
  hasVerifiedFactor,
  isAal2,
  secondFactorSatisfied,
  isBanned,
  isConfirmed,
  isDeveloper,
  isOriginAllowed,
  parseAllowedOrigins,
} from "./auth.ts";

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims: unknown) => `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(claims))}.c2ln`;

const NOW = new Date("2026-10-18T12:00:00Z");
const CONFIRMED = { email_confirmed_at: "2026-01-01T00:00:00Z", banned_until: null };
const DEV_PROFILE = { role: "admin", allowed_tabs: ["ministries", "users", "activity", "settings"] };

Deno.test("bearerToken extracts only a well-formed Bearer credential", () => {
  assertEquals(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assertEquals(bearerToken("bearer abc"), "abc");
  assertEquals(bearerToken("Bearer   abc  "), "abc");
  assertEquals(bearerToken("Basic abc"), "");
  assertEquals(bearerToken("Bearer"), "");
  assertEquals(bearerToken("Bearer a b"), "");
  assertEquals(bearerToken("abc"), "");
  assertEquals(bearerToken(""), "");
  assertEquals(bearerToken(null), "");
  assertEquals(bearerToken(undefined), "");
});

Deno.test("decodeJwtPayload reads the claims of a compact JWS", () => {
  const claims = { sub: "u1", aal: "aal2", role: "authenticated", name: "José Pérez ✓" };
  assertEquals(decodeJwtPayload(jwt(claims)), claims);
  // Every base64url padding length decodes (payload lengths mod 3 = 0, 1, 2).
  for (const sub of ["a", "ab", "abc"]) assertEquals(decodeJwtPayload(jwt({ sub }))?.sub, sub);
});

Deno.test("decodeJwtPayload rejects anything that is not a JSON-object JWS", () => {
  const head = b64url('{"alg":"HS256"}');
  assertEquals(decodeJwtPayload(""), null);
  assertEquals(decodeJwtPayload("abc"), null);
  assertEquals(decodeJwtPayload(`${head}.${b64url("{}")}`), null);                 // 2 parts
  assertEquals(decodeJwtPayload(`${head}.${b64url("{}")}.s.extra`), null);         // 4 parts
  assertEquals(decodeJwtPayload(`${head}..sig`), null);                            // empty payload
  assertEquals(decodeJwtPayload(`${head}.e30=.sig`), null);                        // padding is not base64url
  assertEquals(decodeJwtPayload(`${head}.e3+9.sig`), null);                        // '+' is not base64url
  assertEquals(decodeJwtPayload(`${head}.abcde.sig`), null);                       // impossible length
  assertEquals(decodeJwtPayload(`${head}.${b64url("not json")}.sig`), null);
  assertEquals(decodeJwtPayload(`${head}.${b64url("[1,2]")}.sig`), null);
  assertEquals(decodeJwtPayload(`${head}.${b64url("null")}.sig`), null);
  assertEquals(decodeJwtPayload(`${head}.${b64url("42")}.sig`), null);
  assertEquals(decodeJwtPayload(`${head}.${b64url('"aal2"')}.sig`), null);
  // Invalid UTF-8 (a lone 0xff byte) is refused, not replaced.
  const badUtf8 = btoa(String.fromCharCode(0x7b, 0xff, 0x7d))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assertEquals(decodeJwtPayload(`${head}.${badUtf8}.sig`), null);
});

Deno.test("isAal2 is true only for the exact aal2 claim", () => {
  assert(isAal2({ aal: "aal2" }));
  assertFalse(isAal2({ aal: "aal1" }));
  assertFalse(isAal2({ aal: "AAL2" }));
  assertFalse(isAal2({ aal: ["aal2"] }));
  assertFalse(isAal2({}));
  assertFalse(isAal2(null));
  assertFalse(isAal2(undefined));
});

Deno.test("isConfirmed needs a non-empty email_confirmed_at", () => {
  assert(isConfirmed({ email_confirmed_at: "2026-01-01T00:00:00Z" }));
  assertFalse(isConfirmed({ email_confirmed_at: "" }));
  assertFalse(isConfirmed({ email_confirmed_at: null }));
  assertFalse(isConfirmed({}));
  assertFalse(isConfirmed(null));
});

Deno.test("isBanned: a future or unreadable banned_until bans; none or past does not", () => {
  assertFalse(isBanned({ banned_until: null }, NOW));
  assertFalse(isBanned({ banned_until: undefined }, NOW));
  assertFalse(isBanned({ banned_until: "" }, NOW));
  assertFalse(isBanned({}, NOW));
  assertFalse(isBanned(null, NOW));
  assertFalse(isBanned({ banned_until: "2026-10-18T11:59:59Z" }, NOW));
  assertFalse(isBanned({ banned_until: NOW.toISOString() }, NOW));   // ends exactly now
  assert(isBanned({ banned_until: "2026-10-18T12:00:01Z" }, NOW));
  assert(isBanned({ banned_until: "2126-01-01T00:00:00Z" }, NOW));
  assert(isBanned({ banned_until: "forever" }, NOW));
});

Deno.test("hasDeveloperGrant: role admin plus the users tab, nothing else", () => {
  assert(hasDeveloperGrant(DEV_PROFILE));
  assert(hasDeveloperGrant({ role: "admin", allowed_tabs: ["users"] }));
  assertFalse(hasDeveloperGrant({ role: "admin", allowed_tabs: [] }));                 // Administrador
  assertFalse(hasDeveloperGrant({ role: "admin", allowed_tabs: ["activity", "settings"] }));
  assertFalse(hasDeveloperGrant({ role: "ministry_leader", allowed_tabs: ["users"] }));
  assertFalse(hasDeveloperGrant({ role: "treasurer", allowed_tabs: ["users"] }));
  assertFalse(hasDeveloperGrant({ role: "admin", allowed_tabs: "users" }));
  assertFalse(hasDeveloperGrant({ role: "admin" }));
  assertFalse(hasDeveloperGrant({ allowed_tabs: ["users"] }));
  assertFalse(hasDeveloperGrant(null));
  assertFalse(hasDeveloperGrant(undefined));
});

Deno.test("isDeveloper: grant + confirmed + not banned + not deleted", () => {
  assert(isDeveloper(DEV_PROFILE, CONFIRMED, NOW));
  assert(isDeveloper(DEV_PROFILE, { ...CONFIRMED, banned_until: "2020-01-01T00:00:00Z" }, NOW));
  assert(isDeveloper(DEV_PROFILE, { ...CONFIRMED, deleted_at: null }, NOW));
  assertFalse(isDeveloper({ role: "admin", allowed_tabs: [] }, CONFIRMED, NOW));
  assertFalse(isDeveloper(DEV_PROFILE, { email_confirmed_at: null }, NOW));
  assertFalse(isDeveloper(DEV_PROFILE, { ...CONFIRMED, banned_until: "2126-01-01T00:00:00Z" }, NOW));
  assertFalse(isDeveloper(DEV_PROFILE, { ...CONFIRMED, deleted_at: "2026-10-01T00:00:00Z" }, NOW));
  assertFalse(isDeveloper(DEV_PROFILE, null, NOW));
  assertFalse(isDeveloper(null, CONFIRMED, NOW));
});

Deno.test("parseAllowedOrigins: comma list, blank falls back to the default", () => {
  assertEquals(parseAllowedOrigins(undefined), [...DEFAULT_ALLOWED_ORIGINS]);
  assertEquals(parseAllowedOrigins(null), [...DEFAULT_ALLOWED_ORIGINS]);
  assertEquals(parseAllowedOrigins(""), [...DEFAULT_ALLOWED_ORIGINS]);
  assertEquals(parseAllowedOrigins(" , ,"), [...DEFAULT_ALLOWED_ORIGINS]);
  assertEquals(parseAllowedOrigins(" https://a.org ,http://localhost:* "), ["https://a.org", "http://localhost:*"]);
  assertEquals(DEFAULT_ALLOWED_ORIGINS, ["https://www.irdlex.org", "http://localhost:*", "http://127.0.0.1:*"]);
});

Deno.test("isOriginAllowed: the default list admits production and loopback dev only", () => {
  const list = DEFAULT_ALLOWED_ORIGINS;
  for (const ok of ["https://www.irdlex.org", "http://localhost:5173", "http://localhost:3000", "http://localhost", "http://127.0.0.1:4173"]) {
    assert(isOriginAllowed(ok, list), ok);
  }
  for (const bad of [
    "https://irdlex.org",                 // apex is not where the panel runs
    "http://www.irdlex.org",              // wrong scheme
    "https://www.irdlex.org.evil.com",
    "https://evil.com",
    "https://localhost:5173",             // dev servers are plain http
    "http://localhost.evil.com:5173",
    "http://127.0.0.1.nip.io",
    "http://[::1]:5173",
    "https://www.irdlex.org/",            // not a bare origin
    "https://www.irdlex.org/admin",
    "https://user@www.irdlex.org",
    "HTTPS://WWW.IRDLEX.ORG",             // browsers serialize lowercase
    "null",
    "",
  ]) {
    assertFalse(isOriginAllowed(bad, list), bad);
  }
  assertFalse(isOriginAllowed(null, list));
  assertFalse(isOriginAllowed(undefined, list));
});

Deno.test("isOriginAllowed: configured lists — exact entries, :* wildcards, bad entries skipped", () => {
  const list = parseAllowedOrigins("not a url,https://staging.irdlex.org/,http://dev.local:*");
  assert(isOriginAllowed("https://staging.irdlex.org", list));
  assert(isOriginAllowed("http://dev.local:8080", list));
  assertFalse(isOriginAllowed("https://dev.local:8080", list));
  assertFalse(isOriginAllowed("https://www.irdlex.org", list));   // replaced, not merged
  assertFalse(isOriginAllowed("http://localhost:5173", list));
  assertFalse(isOriginAllowed("https://x.org", ["*"]));           // no catch-all
});

Deno.test("corsHeaders echoes an allowed origin and always varies on Origin", () => {
  const allowed = corsHeaders("http://localhost:5173", DEFAULT_ALLOWED_ORIGINS);
  assertEquals(allowed["Access-Control-Allow-Origin"], "http://localhost:5173");
  assertEquals(allowed["Vary"], "Origin");
  assertEquals(allowed["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assertEquals(allowed["Access-Control-Allow-Headers"], "authorization, x-client-info, apikey, content-type");

  const denied = corsHeaders("https://evil.com", DEFAULT_ALLOWED_ORIGINS);
  assertEquals(denied["Access-Control-Allow-Origin"], undefined);
  assertEquals(denied["Vary"], "Origin");
  assertEquals(corsHeaders(null, DEFAULT_ALLOWED_ORIGINS)["Access-Control-Allow-Origin"], undefined);
});

Deno.test("hasVerifiedFactor counts only verified factors", () => {
  assert(hasVerifiedFactor({ factors: [{ status: "unverified" }, { status: "verified" }] }));
  assertFalse(hasVerifiedFactor({ factors: [{ status: "unverified" }] }));
  assertFalse(hasVerifiedFactor({ factors: [] }));
  assertFalse(hasVerifiedFactor({ factors: null }));
  assertFalse(hasVerifiedFactor(null));
});

Deno.test("secondFactorSatisfied: aal2, or an account with no verified factor (D-033 as amended)", () => {
  const withFactor = { factors: [{ status: "verified" }] };
  assert(secondFactorSatisfied({ aal: "aal2" }, withFactor));
  assertFalse(secondFactorSatisfied({ aal: "aal1" }, withFactor));
  assert(secondFactorSatisfied({ aal: "aal1" }, { factors: [] }));
  assert(secondFactorSatisfied({ aal: "aal1" }, { factors: [{ status: "unverified" }] }));
});
