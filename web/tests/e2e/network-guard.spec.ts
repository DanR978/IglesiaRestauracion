// S05b — the off-origin guard (helpers/network.ts) compares full ORIGINS. The
// e2e build points PUBLIC_SUPABASE_URL at http://127.0.0.1:54321, so a guard
// keyed on hostnames let a page that called a local Supabase pass as the
// preview server. Nothing here reaches anything but the preview: the HTTP
// requests are answered in-process (page.route), and the off-origin socket
// goes to a port nothing listens on, so it is refused.
import { expect, test } from '@playwright/test';
import { watchOffOriginRequests } from './helpers/network';

const LOCAL_SUPABASE = 'http://127.0.0.1:54321';
const REFUSED_SOCKET = 'ws://127.0.0.1:59999/realtime/v1/websocket';

test('flags a local Supabase and another port on the preview host, never the preview', async ({
  page,
  baseURL,
}) => {
  const preview = new URL(baseURL ?? '');
  const otherPort = `${preview.protocol}//${preview.hostname}:54321`;
  await page.route(`${LOCAL_SUPABASE}/**`, (route) => route.fulfill({ status: 204 }));
  await page.route(`${otherPort}/**`, (route) => route.fulfill({ status: 204 }));

  const offOrigin = watchOffOriginRequests(page, baseURL);
  await page.goto('/');
  await page.evaluate(
    async ([supabase, other, socket]) => {
      const quietly = (url: string) =>
        fetch(url).then(
          () => undefined,
          () => undefined,
        );
      const open = (url: string) => {
        const ws = new WebSocket(url);
        ws.onerror = () => {};
      };
      await quietly('/kit/button/');
      await quietly(`${supabase}/rest/v1/events?select=id`);
      await quietly(`${other}/auth/v1/user`);
      open(`${location.origin.replace(/^http/, 'ws')}/socket`);
      open(socket);
    },
    [LOCAL_SUPABASE, otherPort, REFUSED_SOCKET] as const,
  );

  await expect
    .poll(offOrigin)
    .toEqual([
      `GET ${LOCAL_SUPABASE}/rest/v1/events`,
      `GET ${otherPort}/auth/v1/user`,
      `WS ${REFUSED_SOCKET}`,
    ]);
});

test('refuses to guess the preview origin', ({ page }) => {
  expect(() => watchOffOriginRequests(page, undefined)).toThrow(/baseURL/);
});
