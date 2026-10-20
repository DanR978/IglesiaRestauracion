// What the SERVER refuses, whatever the client does (D-002, D-033, D-034 —
// supabase/migrations/20261019000001_enforce_mfa_and_tiers.sql). The admin's
// guards are UX; these calls go straight to PostgREST and the Edge Function
// with real tokens:
//
//   aal1   the token the app holds on the code screen — after the password,
//          before the second factor — reads no staff data (an empty answer)
//          and writes nothing (42501); its own profile is the one exception.
//          The same session, stepped up on screen, reads and writes.
//   tiers  at aal2, an Administrador (an admin without the system tabs) is
//          refused the four system surfaces — audit log, invitations,
//          ministries and settings writes — and admin-invite; a Desarrollador
//          in the same database is not, so the refusals are the tier, not a
//          broken table.
import { randomBytes, randomUUID } from 'node:crypto';
import { jwtClaims, syntheticEmail } from './helpers/stack';
import { expect, test } from './helpers/fixtures';
import { enterCode, expectInicio, heading, storedSession, submitSignIn } from './helpers/ui';

const RLS_DENIED = { status: 403, body: { code: '42501' } };

test('an aal1 token reads and writes no staff data; the same session at aal2 does', async ({
  page,
  stack,
}) => {
  const ana = await stack.createAccount({ preset: 'administrador', factor: true });
  // A treasury fund: readable and writable by any admin session that passed its second factor.
  const [fund] = await stack.admin<Array<{ id: string }>>('POST', '/rest/v1/fin_funds', {
    name: 'Fondo de integración',
  });
  stack.forgetAuditOf(fund.id);
  stack.defer(() => stack.admin('DELETE', `/rest/v1/fin_funds?id=eq.${fund.id}`));
  const readFund = `/rest/v1/fin_funds?id=eq.${fund.id}&select=id,name`;

  await submitSignIn(page, ana.email, ana.password);
  await expect(heading(page, 'Verifica tu identidad')).toBeVisible();
  const aal1 = (await storedSession(page, stack.storageKey))!.access_token;
  expect(jwtClaims(aal1)).toMatchObject({ sub: ana.id, aal: 'aal1' });

  // A live token: its own profile row comes back (the D-034 exemption) …
  expect(await stack.rest(aal1, 'GET', '/rest/v1/profiles?select=id')).toEqual({
    status: 200,
    body: [{ id: ana.id }],
  });
  // … and nothing else: the fund is there, but not for aal1.
  expect(await stack.rest(aal1, 'GET', readFund)).toEqual({ status: 200, body: [] });
  expect(
    await stack.rest(aal1, 'POST', '/rest/v1/fin_funds', { name: 'Fondo sin segundo paso' }),
  ).toMatchObject(RLS_DENIED);

  await enterCode(page, ana.secret!);
  await expectInicio(page);
  const aal2 = (await storedSession(page, stack.storageKey))!.access_token;
  expect(jwtClaims(aal2)).toMatchObject({ aal: 'aal2', session_id: jwtClaims(aal1).session_id });

  expect(await stack.rest(aal2, 'GET', readFund)).toEqual({
    status: 200,
    body: [{ id: fund.id, name: 'Fondo de integración' }],
  });
  const created = await stack.rest<Array<{ id: string }>>(aal2, 'POST', '/rest/v1/fin_funds', {
    name: 'Fondo con segundo paso',
  });
  expect(created.status).toBe(201);
  const removed = await stack.rest(
    aal2,
    'DELETE',
    `/rest/v1/fin_funds?id=eq.${created.body[0].id}`,
  );
  expect(removed).toMatchObject({ status: 200, body: [{ id: created.body[0].id }] });
});

test('an Administrador is refused the system surfaces at aal2; a Desarrollador is not', async ({
  stack,
}) => {
  const dev = await stack.createAccount({ preset: 'developer', factor: true, label: 'dev' });
  const adm = await stack.createAccount({ preset: 'administrador', factor: true, label: 'adm' });
  const devToken = (await stack.signInAal2(dev)).access_token;
  const admToken = (await stack.signInAal2(adm)).access_token;
  expect(jwtClaims(admToken).aal).toBe('aal2');

  // Rows for the reads: an audit entry and a pending invitation.
  const [entry] = await stack.admin<Array<{ id: string }>>('POST', '/rest/v1/audit_log', {
    actor_id: dev.id,
    actor_name: 'Integración',
    action: 'INSERT',
    entity: 'events',
    entity_id: randomUUID(),
    label: 'Evento de integración',
  });
  const [invitation] = await stack.admin<Array<{ id: string }>>('POST', '/rest/v1/invitations', {
    email: syntheticEmail('pendiente'),
    role: 'ministry_leader',
  });
  stack.forgetAuditOf(invitation.id);
  stack.defer(() => stack.admin('DELETE', `/rest/v1/invitations?id=eq.${invitation.id}`));

  // Actividad — audit_log reads need the 'activity' tab.
  const readEntry = `/rest/v1/audit_log?id=eq.${entry.id}&select=id`;
  expect((await stack.rest(devToken, 'GET', readEntry)).body).toEqual([{ id: entry.id }]);
  expect(await stack.rest(admToken, 'GET', readEntry)).toEqual({ status: 200, body: [] });

  // Usuarios — invitations reads need the 'users' tab.
  const readInvitation = `/rest/v1/invitations?id=eq.${invitation.id}&select=id`;
  expect((await stack.rest(devToken, 'GET', readInvitation)).body).toEqual([{ id: invitation.id }]);
  expect(await stack.rest(admToken, 'GET', readInvitation)).toEqual({ status: 200, body: [] });

  // Ministerios — writes need the 'ministries' tab.
  const addMinistry = (token: string, name: string) =>
    stack.rest<Array<{ id: string }>>(token, 'POST', '/rest/v1/ministries', { name });
  const ministry = await addMinistry(devToken, 'Ministerio de integración');
  expect(ministry.status).toBe(201);
  const ministryId = ministry.body[0].id;
  stack.defer(() => stack.restOk(devToken, 'DELETE', `/rest/v1/ministries?id=eq.${ministryId}`));
  expect(await addMinistry(admToken, 'Ministerio sin permiso')).toMatchObject(RLS_DENIED);

  // Configuración — app_settings writes need the 'settings' tab.
  const addSetting = (token: string, key: string) =>
    stack.rest(token, 'POST', '/rest/v1/app_settings', { key, value: { prueba: true } });
  const key = `integracion-${randomBytes(4).toString('hex')}`;
  expect((await addSetting(devToken, key)).status).toBe(201);
  stack.defer(() => stack.restOk(devToken, 'DELETE', `/rest/v1/app_settings?key=eq.${key}`));
  expect(await addSetting(admToken, `${key}-adm`)).toMatchObject(RLS_DENIED);
  // An update matches no row the tier lets it see: nothing changes.
  expect(
    await stack.rest(admToken, 'PATCH', `/rest/v1/app_settings?key=eq.${key}`, {
      value: { prueba: false },
    }),
  ).toEqual({ status: 200, body: [] });
  expect(await stack.admin('GET', `/rest/v1/app_settings?key=eq.${key}&select=value`)).toEqual([
    { value: { prueba: true } },
  ]);

  // admin-invite — every action needs the developer tier at aal2.
  const listAccounts = (token: string) =>
    stack.call('POST', '/functions/v1/admin-invite', { token, body: { action: 'list' } });
  expect(await listAccounts(admToken)).toMatchObject({ status: 403, body: { code: 'forbidden' } });
  expect((await listAccounts(devToken)).status).toBe(200);
});
