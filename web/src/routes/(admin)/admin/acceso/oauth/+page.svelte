<script lang="ts">
  // acceso/oauth/ — where Google or Microsoft return (S39 · D-035, ADR-0005).
  // The callback signInWithOAuth() named: `?code=` to trade for a session
  // (PKCE — only the browser that started can), or GoTrue's `error` /
  // `error_code` in the query and the fragment. Both are read, then scrubbed
  // from the address bar before anything else runs (auth-url.ts); the code is
  // kept in memory, so a failure in transit can be retried. A provider
  // sign-in is aal1: the settled session goes on to verificar/ (D-033), then
  // to the `next` the sign-in page kept for this tab.
  //
  // auth-js reads `sb_flow_id` from the address when no flow id is passed;
  // this app never asks GoTrue for one (no appendPkceFlowIdToRedirects), so
  // scrubbing first loses nothing — the verifier is the newest one stored.
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { safeNext } from '#lib/auth/next.js';
  import { exchangeCode, takeOAuthNext } from '#lib/auth/session.js';
  import Alert from '#lib/components/Alert.svelte';
  import Button from '#lib/components/Button.svelte';
  import AccessHeading from '#lib/components/admin/auth/AccessHeading.svelte';
  import { authParams, scrubLocation } from '#lib/components/admin/auth/auth-url.js';
  import { destinationFor, leaveTo } from '#lib/components/admin/auth/destination.js';
  import {
    CALLBACK_COPY,
    callbackErrorMessage,
    readCallback,
  } from '#lib/components/admin/auth/oauth-callback.js';
  import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
  import { session, type SessionStatus } from '#lib/stores/session.svelte.js';

  const SIGNED_IN: ReadonlySet<SessionStatus> = new Set([
    'ready',
    'needs-mfa',
    'needs-enroll',
    'forbidden',
  ]);

  // Read and scrub before the first render: the one-time values never sit in
  // the address bar while the page works.
  const outcome = readCallback(authParams(new URL(location.href)));
  scrubLocation();
  const keptNext = takeOAuthNext();

  let failure = $state<string | null>(outcome.kind === 'error' ? outcome.message : null);
  let retryable = $state(false);
  let working = $state(outcome.kind !== 'error');

  onMount(() => {
    void (async () => {
      await session.ready();
      if (outcome.kind === 'code') await exchange(outcome.code);
      else if (outcome.kind === 'none') await carryOn();
    })();
  });

  async function exchange(code: string): Promise<void> {
    working = true;
    failure = null;
    retryable = false;
    const res = await exchangeCode(code);
    if (!res.ok) {
      working = false;
      retryable = res.error.kind === 'network';
      failure = retryable ? res.error.message : callbackErrorMessage(res.error.code);
      return;
    }
    await settleAndGo();
  }

  /** No code and no error: a reload after the exchange goes on; anything else was incomplete. */
  async function carryOn(): Promise<void> {
    await session.settled();
    if (SIGNED_IN.has(session.status)) return settleAndGo();
    working = false;
    failure = CALLBACK_COPY.incomplete;
  }

  async function settleAndGo(): Promise<void> {
    const next = await safeNext(keptNext);
    await session.settled();
    const to = SIGNED_IN.has(session.status) ? destinationFor(session.status, next) : null;
    if (to) return leaveTo(to);
    working = false;
    failure = session.error?.message ?? REPO_ERROR_MESSAGES.unknown;
  }
</script>

{#if failure}
  <AccessHeading title="No pudimos iniciar tu sesión" />
  <Alert tone="error" message={failure} />
  <div class="oauth__actions">
    {#if retryable && outcome.kind === 'code'}
      <Button size="full" onclick={() => exchange(outcome.code)}>Reintentar</Button>
    {/if}
    <Button variant={retryable ? 'ghost' : 'primary'} size="full" href={resolve('admin/acceso/')}>
      Volver a iniciar sesión
    </Button>
  </div>
{:else}
  <AccessHeading title="Iniciando sesión" />
  <p class="oauth__pending" role="status">
    {working ? 'Un momento: estamos completando el inicio de sesión…' : ''}
  </p>
{/if}

<style>
  .oauth__actions {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }

  .oauth__pending {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
