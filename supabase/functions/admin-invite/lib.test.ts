// supabase/functions/admin-invite/lib.test.ts — unit tests for lib.ts.
// Run: deno test supabase/functions

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  accessChanged,
  accessDetail,
  accountRow,
  ACTIONS,
  ADMIN_SYSTEM_TABS,
  auditRow,
  buildAccountList,
  ERRORS,
  errorBody,
  grantableFor,
  invitationStatus,
  inviteErrorCode,
  invitesPaused,
  isLastDeveloperViolation,
  isNotFound,
  isOutage,
  isUniqueViolation,
  latestInvitationStatuses,
  MAX_AUDIT_LABEL,
  MAX_BODY_CHARS,
  missingSeedPresets,
  OPERATIONAL_TABS,
  parseBaseRole,
  parseBody,
  parseColor,
  parseDisplayName,
  parseEmail,
  parseIcon,
  parseMinistryIds,
  parsePresetName,
  parseUuid,
  presetMemberCounts,
  sanitizeTabs,
  SEED_PRESETS,
  slugify,
  wouldLeaveNoDeveloper,
} from "./lib.ts";

const U1 = "0b6c2f1e-8d0a-4c1b-9a8e-3f2d1c0b9a87";
const U2 = "1c7d3a2f-9e1b-4d2c-8b9f-4a3e2d1c0b98";

Deno.test("ERRORS: every code has an HTTP error status and a Spanish sentence", () => {
  for (const [code, { status, message }] of Object.entries(ERRORS)) {
    assert(status >= 400 && status <= 599, code);
    assert(/^[A-ZÁÉÍÓÚÑ¿¡].*[.!?]$/.test(message), `${code}: ${message}`);
  }
  assertEquals(errorBody("aal2_required"), { code: "aal2_required", error: ERRORS.aal2_required.message });
  assertEquals(ERRORS.aal2_required.status, 403);
  assertEquals(ERRORS.forbidden.status, 403);
  assertEquals(ERRORS.self_forbidden.status, 403);
  assertEquals(ERRORS.revoke_unavailable.status, 503);
  assertEquals(ERRORS.invites_paused.status, 409);
});

Deno.test("ACTIONS lists the legacy action names", () => {
  assertEquals([...ACTIONS], [
    "list", "invite", "resend", "revoke", "set-role", "delete", "reset-mfa",
    "list-presets", "save-preset", "delete-preset",
  ]);
});

Deno.test("parseBody accepts only a JSON object", () => {
  assertEquals(parseBody('{"action":"list"}'), { action: "list" });
  assertEquals(parseBody("[]"), null);
  assertEquals(parseBody("null"), null);
  assertEquals(parseBody('"list"'), null);
  assertEquals(parseBody("1"), null);
  assertEquals(parseBody("{"), null);
  assertEquals(parseBody(""), null);
  assertEquals(MAX_BODY_CHARS, 32768);
});

Deno.test("parseUuid trims and lower-cases a UUID, rejects anything else", () => {
  assertEquals(parseUuid(U1), U1);
  assertEquals(parseUuid(` ${U1.toUpperCase()} `), U1);
  assertEquals(parseUuid("not-a-uuid"), null);
  assertEquals(parseUuid(`${U1}x`), null);
  assertEquals(parseUuid(U1.replace(/-/g, "")), null);
  assertEquals(parseUuid(""), null);
  assertEquals(parseUuid(42), null);
  assertEquals(parseUuid(null), null);
  assertEquals(parseUuid(undefined), null);
  assertEquals(parseUuid([U1]), null);
});

Deno.test("parseEmail normalizes and validates an address", () => {
  assertEquals(parseEmail("  Ana.Perez@IRDLEX.org "), "ana.perez@irdlex.org");
  assertEquals(parseEmail("a@b.co"), "a@b.co");
  for (const bad of ["", "ana", "ana@", "@irdlex.org", "ana@irdlex", "ana perez@irdlex.org", "ana@@irdlex.org", "ana\u0000@irdlex.org"]) {
    assertEquals(parseEmail(bad), null, JSON.stringify(bad));
  }
  assertEquals(parseEmail(`${"a".repeat(245)}@irdlex.org`), null);   // 256 chars
  assertEquals(parseEmail(`${"a".repeat(243)}@irdlex.org`), `${"a".repeat(243)}@irdlex.org`);   // 254
  assertEquals(parseEmail(null), null);
  assertEquals(parseEmail(["a@b.co"]), null);
});

Deno.test("parseDisplayName: 2–80 code points after cleaning", () => {
  assertEquals(parseDisplayName("  Juan   Pérez "), "Juan Pérez");
  assertEquals(parseDisplayName("Jo"), "Jo");
  assertEquals(parseDisplayName("J"), null);
  assertEquals(parseDisplayName("   "), null);
  assertEquals(parseDisplayName("Ñ".repeat(80)), "Ñ".repeat(80));
  assertEquals(parseDisplayName("Ñ".repeat(81)), null);
  assertEquals(parseDisplayName("😀".repeat(80)), "😀".repeat(80));   // code points, not UTF-16 units
  assertEquals(parseDisplayName("Ana\nMaría\tLópez"), "Ana María López");
  // Bidirectional formatting characters are stripped (built from code points so
  // this source file stays free of invisible characters).
  const [RLO, LRI, PDI, RLM] = [0x202e, 0x2066, 0x2069, 0x200f].map((c) => String.fromCodePoint(c));
  assertEquals(parseDisplayName(`Ana${RLO}txet`), "Ana txet");
  assertEquals(parseDisplayName(`${LRI}Ana${PDI}`), "Ana");
  assertEquals(parseDisplayName(`Ana${RLM}${RLM}`), "Ana");
  assertEquals(parseDisplayName(`${RLO}${RLO}`), null);
  assertEquals(parseDisplayName(null), null);
  assertEquals(parseDisplayName(12), null);
});

Deno.test("parsePresetName: 2–40 code points", () => {
  assertEquals(parsePresetName(" Ujieres "), "Ujieres");
  assertEquals(parsePresetName("U"), null);
  assertEquals(parsePresetName("x".repeat(40)), "x".repeat(40));
  assertEquals(parsePresetName("x".repeat(41)), null);
  assertEquals(parsePresetName(undefined), null);
});

Deno.test("parseBaseRole accepts the three base roles only", () => {
  assertEquals(parseBaseRole("admin"), "admin");
  assertEquals(parseBaseRole("ministry_leader"), "ministry_leader");
  assertEquals(parseBaseRole("treasurer"), "treasurer");
  assertEquals(parseBaseRole("Admin"), null);
  assertEquals(parseBaseRole("superadmin"), null);
  assertEquals(parseBaseRole(""), null);
  assertEquals(parseBaseRole(null), null);
});

Deno.test("parseColor: optional #RRGGBB", () => {
  assertEquals(parseColor(undefined), { ok: true, value: null });
  assertEquals(parseColor(null), { ok: true, value: null });
  assertEquals(parseColor(""), { ok: true, value: null });
  assertEquals(parseColor("#5b21b6"), { ok: true, value: "#5b21b6" });
  assertEquals(parseColor("#5B21B6"), { ok: true, value: "#5B21B6" });
  for (const bad of ["#abc", "5b21b6", "#5b21b6 ", "#5b21b6ff", "red", "#gggggg", 0x5b21b6, "url(x)"]) {
    assertEquals(parseColor(bad), { ok: false }, String(bad));
  }
});

Deno.test("parseIcon: optional ^fa-[a-z0-9-]{1,40}$ (the leader_sections.icon rule)", () => {
  assertEquals(parseIcon(undefined), { ok: true, value: null });
  assertEquals(parseIcon(""), { ok: true, value: null });
  assertEquals(parseIcon("fa-user-gear"), { ok: true, value: "fa-user-gear" });
  assertEquals(parseIcon(`fa-${"a".repeat(40)}`), { ok: true, value: `fa-${"a".repeat(40)}` });
  for (const bad of ["fa-", "fa-User", "fas fa-user", "user", `fa-${"a".repeat(41)}`, 'fa-x" onmouseover="x', "fa-x;", 1]) {
    assertEquals(parseIcon(bad), { ok: false }, String(bad));
  }
});

Deno.test("parseMinistryIds: leaders only, UUIDs, legacy single id, de-duped, bounded", () => {
  assertEquals(parseMinistryIds({ ministry_ids: ["junk"] }, "admin"), []);
  assertEquals(parseMinistryIds({ ministry_id: "junk" }, "treasurer"), []);
  assertEquals(parseMinistryIds({}, "ministry_leader"), []);
  assertEquals(parseMinistryIds({ ministry_ids: [] }, "ministry_leader"), []);
  assertEquals(parseMinistryIds({ ministry_ids: [U1, U1.toUpperCase(), U2, null, ""] }, "ministry_leader"), [U1, U2]);
  assertEquals(parseMinistryIds({ ministry_id: U2 }, "ministry_leader"), [U2]);
  // The array wins over the single id, as in the legacy function.
  assertEquals(parseMinistryIds({ ministry_ids: [U1], ministry_id: U2 }, "ministry_leader"), [U1]);
  assertEquals(parseMinistryIds({ ministry_ids: [U1, "x"] }, "ministry_leader"), null);
  assertEquals(parseMinistryIds({ ministry_ids: [42] }, "ministry_leader"), null);
  assertEquals(parseMinistryIds({ ministry_id: "x" }, "ministry_leader"), null);
  const many = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  assertEquals(parseMinistryIds({ ministry_ids: many(50) }, "ministry_leader")?.length, 50);
  assertEquals(parseMinistryIds({ ministry_ids: many(51) }, "ministry_leader"), null);
});

Deno.test("grantableFor / sanitizeTabs follow the base role", () => {
  assertEquals(grantableFor("ministry_leader"), OPERATIONAL_TABS);
  assertEquals(grantableFor("admin"), ADMIN_SYSTEM_TABS);
  assertEquals(grantableFor("treasurer"), []);
  assertEquals(grantableFor("nope"), []);
  assertEquals(sanitizeTabs(["users", "galeria", "users", "settings", 7, "x"], "admin"), ["users", "settings"]);
  assertEquals(sanitizeTabs(["users", "galeria", "upcoming", "galeria"], "ministry_leader"), ["galeria", "upcoming"]);
  assertEquals(sanitizeTabs(["treasury", "users"], "treasurer"), []);
  assertEquals(sanitizeTabs("users", "admin"), []);
  assertEquals(sanitizeTabs(null, "admin"), []);
});

Deno.test("accessChanged compares role and the set of pages", () => {
  const dev = { role: "admin" as const, allowed_tabs: ["ministries", "users", "activity", "settings"] };
  assertFalse(accessChanged({ role: "admin", allowed_tabs: ["settings", "activity", "users", "ministries"] }, dev));
  assert(accessChanged({ role: "ministry_leader", allowed_tabs: dev.allowed_tabs }, dev));
  assert(accessChanged({ role: "admin", allowed_tabs: ["users"] }, dev));
  assert(accessChanged({ role: "admin", allowed_tabs: [...dev.allowed_tabs, "analytics"] }, dev));
  assert(accessChanged({ role: "admin", allowed_tabs: ["users", "users", "activity", "x"] }, dev));
  assert(accessChanged({ role: "admin", allowed_tabs: null }, dev));
  assert(accessChanged({}, dev));
  assertFalse(accessChanged({ role: "treasurer", allowed_tabs: [] }, { role: "treasurer", allowed_tabs: [] }));
});

Deno.test("wouldLeaveNoDeveloper: blocks only when every developer loses the grant", () => {
  assert(wouldLeaveNoDeveloper([U1], [U1]));
  assert(wouldLeaveNoDeveloper([U1, U2], [U1, U2, "other"]));
  assertFalse(wouldLeaveNoDeveloper([U1, U2], [U1]));
  assertFalse(wouldLeaveNoDeveloper([U1], []));
  assertFalse(wouldLeaveNoDeveloper([U1], [U2]));
  assertFalse(wouldLeaveNoDeveloper([], [U1]));
});

Deno.test("slugify folds accents and punctuation", () => {
  assertEquals(slugify("Tesorería"), "tesoreria");
  assertEquals(slugify("  Líderes de Alabanza!! "), "lideres-de-alabanza");
  assertEquals(slugify("!!!"), "preset");
  assertEquals(slugify("a".repeat(60)).length, 48);
});

Deno.test("invitesPaused treats any truthy pause_invites as on", () => {
  assertFalse(invitesPaused(undefined));
  assertFalse(invitesPaused(null));
  assertFalse(invitesPaused("pause_invites"));
  assertFalse(invitesPaused({}));
  assertFalse(invitesPaused([]));
  assertFalse(invitesPaused({ pause_invites: false, maintenance: true }));
  assert(invitesPaused({ pause_invites: true }));
  assert(invitesPaused({ pause_invites: "true" }));
});

Deno.test("missingSeedPresets returns copies of the built-ins not yet present", () => {
  assertEquals(missingSeedPresets([]).map((p) => p.slug), ["developer", "administrador", "tesoreria", "medios"]);
  assertEquals(missingSeedPresets([{ slug: "developer" }, { slug: "medios" }, { slug: "x" }]).map((p) => p.slug),
    ["administrador", "tesoreria"]);
  assertEquals(missingSeedPresets(SEED_PRESETS.map((p) => ({ slug: p.slug }))), []);
  const [dev] = missingSeedPresets([]);
  dev.allowed_tabs.push("mutated");
  assertEquals(SEED_PRESETS[0].allowed_tabs.length, 4);
  assertEquals(SEED_PRESETS[0].allowed_tabs, ["ministries", "users", "activity", "settings"]);
});

Deno.test("presetMemberCounts counts accounts per preset", () => {
  const counts = presetMemberCounts([{ preset_id: U1 }, { preset_id: U1 }, { preset_id: U2 }, { preset_id: null }, {}]);
  assertEquals(counts.get(U1), 2);
  assertEquals(counts.get(U2), 1);
  assertEquals(counts.size, 2);
});

Deno.test("inviteErrorCode maps GoTrue failures to stable codes", () => {
  assertEquals(inviteErrorCode({ code: "email_exists", status: 422 }), "email_taken");
  assertEquals(inviteErrorCode({ code: "user_already_exists", status: 422 }), "email_taken");
  assertEquals(inviteErrorCode({ code: "email_address_invalid", status: 400 }), "invalid_email");
  assertEquals(inviteErrorCode({ code: "over_email_send_rate_limit", status: 429 }), "email_rate_limited");
  assertEquals(inviteErrorCode({ status: 429 }), "email_rate_limited");
  assertEquals(inviteErrorCode({ code: "unexpected_failure", status: 500 }), "invite_failed");
  assertEquals(inviteErrorCode(null), "invite_failed");
});

Deno.test("isNotFound / isOutage / isUniqueViolation / isLastDeveloperViolation", () => {
  assert(isLastDeveloperViolation({ code: "P0001" }));
  assertFalse(isLastDeveloperViolation({ code: "23505" }));
  assertFalse(isLastDeveloperViolation(null));
  assert(isNotFound({ status: 404 }));
  assert(isNotFound({ code: "user_not_found", status: 400 }));
  assertFalse(isNotFound({ status: 500 }));
  assertFalse(isNotFound(null));
  assert(isOutage({ status: 0 }));
  assert(isOutage({ status: 503 }));
  assert(isOutage({}));
  assert(isOutage(null));
  assertFalse(isOutage({ status: 401 }));
  assertFalse(isOutage({ status: 403 }));
  assert(isUniqueViolation({ code: "23505" }));
  assertFalse(isUniqueViolation({ code: "23503" }));
  assertFalse(isUniqueViolation(undefined));
});

Deno.test("latestInvitationStatuses keeps the newest row per address", () => {
  const map = latestInvitationStatuses([
    { email: "Ana@irdlex.org", status: "revoked", created_at: "2026-01-01T00:00:00+00:00" },
    { email: "ana@irdlex.org", status: "pending", created_at: "2026-03-01T00:00:00+00:00" },
    { email: "ana@irdlex.org", status: "accepted", created_at: "2026-02-01T00:00:00+00:00" },
    { email: "luis@irdlex.org", status: "expired" },
    { email: "luis@irdlex.org", status: "pending", created_at: "garbage" },
    { email: null, status: "pending" },
    { email: "x@irdlex.org", status: 3 },
  ]);
  assertEquals(map.get("ana@irdlex.org"), "pending");
  assertEquals(map.get("luis@irdlex.org"), "expired");   // undated rows: first one kept
  assertEquals(map.size, 2);
});

Deno.test("invitationStatus: confirmed accounts accepted, otherwise pending unless revoked/expired", () => {
  const confirmed = { email_confirmed_at: "2026-05-01T00:00:00Z" };
  const pending = { email_confirmed_at: null };
  assertEquals(invitationStatus(confirmed, "pending"), "accepted");   // OAuth acceptance leaves the row
  assertEquals(invitationStatus(confirmed, undefined), "accepted");
  assertEquals(invitationStatus(pending, "accepted"), "pending");     // row marked when the user was created
  assertEquals(invitationStatus(pending, "pending"), "pending");
  assertEquals(invitationStatus(pending, undefined), "pending");
  assertEquals(invitationStatus(pending, "revoked"), "revoked");
  assertEquals(invitationStatus(pending, "expired"), "expired");
});

Deno.test("accountRow / buildAccountList keep the legacy list contract", () => {
  const users = [
    {
      id: U1, email: "ana@irdlex.org", email_confirmed_at: "2026-05-01T00:00:00Z",
      last_sign_in_at: "2026-10-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z",
      user_metadata: { display_name: "Meta Ana" },
      factors: [{ status: "unverified" }, { status: "verified" }],
    },
    { id: U2, email: "Luis@irdlex.org", email_confirmed_at: null, created_at: "2026-10-10T00:00:00Z", user_metadata: { display_name: "Luis" } },
  ];
  const profiles = [{
    id: U1, display_name: "Ana", role: "ministry_leader", ministry_id: "m-legacy", ministry_ids: ["m1", "m2", "gone"],
    allowed_tabs: ["galeria"], preset_id: "p1", avatar_url: "https://x/avatar.png",
  }];
  const rows = buildAccountList(
    users, profiles,
    [{ id: "m1", name: "Jóvenes" }, { id: "m2", name: "Niños" }],
    [{ id: "p1", name: "Medios" }],
    [
      { email: "ana@irdlex.org", status: "pending", created_at: "2026-04-01T00:00:00Z" },
      { email: "luis@irdlex.org", status: "accepted", created_at: "2026-10-10T00:00:00Z" },
    ],
  );
  assertEquals(rows[0], {
    id: U1, email: "ana@irdlex.org", display_name: "Ana", role: "ministry_leader", avatar_url: "https://x/avatar.png",
    ministry_id: "m1", ministry_ids: ["m1", "m2", "gone"], ministry: "Jóvenes", ministries: ["Jóvenes", "Niños"],
    preset_id: "p1", preset: "Medios", allowed_tabs: ["galeria"], confirmed: true,
    last_sign_in: "2026-10-01T00:00:00Z", mfa: true, created_at: "2026-05-01T00:00:00Z",
    invitation_status: "accepted",
  });
  assertEquals(rows[1], {
    id: U2, email: "Luis@irdlex.org", display_name: "Luis", role: null, avatar_url: null,
    ministry_id: null, ministry_ids: [], ministry: null, ministries: [],
    preset_id: null, preset: null, allowed_tabs: [], confirmed: false,
    last_sign_in: null, mfa: false, created_at: "2026-10-10T00:00:00Z",
    invitation_status: "pending",
  });
  // Legacy single ministry column is the fallback when the array is empty.
  const legacy = accountRow(users[0], { id: U1, ministry_id: "m2", ministry_ids: [] }, new Map([["m2", "Niños"]]), new Map(), undefined);
  assertEquals([legacy.ministry_id, legacy.ministry, legacy.ministry_ids], ["m2", "Niños", ["m2"]]);
  assertEquals(legacy.display_name, "Meta Ana");   // no profile name → the invite metadata
  const noProfile = accountRow({ id: U2, user_metadata: { display_name: 7 } }, null, new Map(), new Map(), undefined);
  assertEquals(noProfile.display_name, null);
  // Dangling ministry / preset ids and an account without an email.
  const [orphan] = buildAccountList([{ id: U2 }], [{ id: U2, ministry_ids: ["gone"], preset_id: "deleted" }], [], [], []);
  assertEquals([orphan.ministry, orphan.ministries, orphan.preset, orphan.email, orphan.invitation_status],
    [null, [], null, undefined, "pending"]);
});

Deno.test("accessDetail snapshots role and pages, led by the preset", () => {
  assertEquals(accessDetail({ role: "admin", allowed_tabs: [] }), "rol: admin · páginas: ninguna");
  assertEquals(accessDetail({ role: "ministry_leader", allowed_tabs: ["upcoming", "galeria"] }, " Medios "),
    "preset: Medios · rol: ministry_leader · páginas: upcoming, galeria");
  assertEquals(accessDetail({ role: "treasurer", allowed_tabs: [] }, null), "rol: treasurer · páginas: ninguna");
  assertEquals(accessDetail({ role: "treasurer", allowed_tabs: [] }, "  "), "rol: treasurer · páginas: ninguna");
});

Deno.test("auditRow: legacy-renderable action/entity, caller attribution, bounded label", () => {
  const actor = { id: U1, name: "Dev Uno" };
  const target = { id: U2, name: "Luis Gómez", email: "luis@irdlex.org" };
  const cases: Array<[Parameters<typeof auditRow>[0], string, string, string]> = [
    ["invite", "INSERT", "invitations", "Luis Gómez (luis@irdlex.org)"],
    ["resend", "UPDATE", "invitations", "Luis Gómez (luis@irdlex.org) · reenviada"],
    ["revoke", "DELETE", "invitations", "Luis Gómez (luis@irdlex.org)"],
    ["set-role", "UPDATE", "profiles", "Luis Gómez (luis@irdlex.org)"],
    ["delete", "DELETE", "profiles", "Luis Gómez (luis@irdlex.org)"],
    ["reset-mfa", "UPDATE", "profiles", "Luis Gómez (luis@irdlex.org) · 2FA restablecido"],
    ["create-preset", "INSERT", "role_presets", "Luis Gómez (luis@irdlex.org)"],
    ["update-preset", "UPDATE", "role_presets", "Luis Gómez (luis@irdlex.org)"],
    ["delete-preset", "DELETE", "role_presets", "Luis Gómez (luis@irdlex.org)"],
  ];
  for (const [kind, action, entity, label] of cases) {
    assertEquals(auditRow(kind, actor, target), {
      actor_id: U1, actor_name: "Dev Uno", action, entity, entity_id: U2, label,
    }, kind);
  }
  assertEquals(auditRow("set-role", actor, { id: U2, name: "Luis", detail: "rol: admin" }).label, "Luis · rol: admin");
  assertEquals(auditRow("delete", actor, { id: U2, email: "luis@irdlex.org" }).label, "luis@irdlex.org");
  assertEquals(auditRow("delete", actor, { id: U2, name: "  ", email: null }).label, U2);
  const long = auditRow("invite", actor, { id: U2, name: "Ñ".repeat(150), email: `${"a".repeat(80)}@irdlex.org` }).label;
  assertEquals([...long].length, MAX_AUDIT_LABEL);
});
