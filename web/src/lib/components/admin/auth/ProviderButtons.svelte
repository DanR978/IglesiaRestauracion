<!--
  ProviderButtons — "Continuar con Google / Microsoft" (S39 · D-035, ADR-0005).
  Only the providers the project reports switched on (GET /auth/v1/settings,
  fetchEnabledProviders): while that answer is pending, or when it failed or
  names none, nothing renders and nothing is reserved — the password form
  stands alone, and the buttons arrive after it, so nothing above them moves.

  A press is one top-level redirect (signInWithOAuth, PKCE; `next` waits in
  sessionStorage for the callback). The spinner stays while the browser
  leaves, and clears if the page comes back from the back/forward cache.
  The in-app-browser hint is shown with the buttons, to everyone: there is no
  user-agent sniffing (target-architecture §8). A start that fails before
  leaving (storage blocked, a bad provider) is handed to the page's Alert.

  Usage:
    <ProviderButtons {next} disabled={signingIn} onError={(m) => (formError = m)} />
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '#lib/components/Button.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import { fetchEnabledProviders, signInWithOAuth, type OAuthProvider } from '#lib/auth/session.js';

  interface Props {
    /** Where to land after the provider (a safeNext() result); null for Inicio. */
    next?: string | null;
    /** Lock the buttons, e.g. while the password form beside them is submitting. */
    disabled?: boolean;
    /** A start that failed before leaving the page — Spanish, for the caller's Alert. */
    onError: (message: string) => void;
  }

  let { next = null, disabled = false, onError }: Props = $props();

  const PROVIDER_UI: Readonly<Record<OAuthProvider, { label: string; icon: string }>> = {
    google: { label: 'Continuar con Google', icon: 'google' },
    azure: { label: 'Continuar con Microsoft', icon: 'microsoft' },
  };

  let providers = $state<OAuthProvider[]>([]);
  let starting = $state<OAuthProvider | null>(null);

  onMount(() => {
    let live = true;
    void fetchEnabledProviders().then((list) => {
      if (live) providers = list;
    });
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) starting = null;
    };
    addEventListener('pageshow', onPageShow);
    return () => {
      live = false;
      removeEventListener('pageshow', onPageShow);
    };
  });

  async function start(provider: OAuthProvider): Promise<void> {
    if (starting) return;
    starting = provider;
    const res = await signInWithOAuth(provider, { next });
    if (!res.ok) {
      starting = null;
      onError(res.error.message);
    }
  }
</script>

{#if providers.length > 0}
  <div class="providers">
    <p class="providers__or">o</p>
    <div class="providers__list">
      {#each providers as provider (provider)}
        <Button
          variant="ghost"
          size="full"
          loading={starting === provider}
          disabled={disabled || (starting !== null && starting !== provider)}
          onclick={() => start(provider)}
        >
          <span class="providers__label">
            <Icon set="fab" name={PROVIDER_UI[provider].icon} />
            {PROVIDER_UI[provider].label}
          </span>
        </Button>
      {/each}
    </div>
    <p class="providers__hint">
      Si Google o Microsoft no te dejan entrar desde otra app, abre esta página en Safari o Chrome.
    </p>
  </div>
{/if}

<style>
  .providers {
    display: flex;
    flex-direction: column;
    gap: var(--mg-sm);
  }

  /* "o" between two hairlines: the theme-neutral divider idiom. */
  .providers__or {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  .providers__or::before,
  .providers__or::after {
    content: '';
    flex: 1;
    border-top: 1px solid rgba(127, 127, 127, 0.18);
  }

  .providers__list {
    display: flex;
    flex-direction: column;
    gap: var(--mg-xs);
  }

  .providers__label {
    display: inline-flex;
    align-items: center;
    gap: var(--mg-xs);
    color: var(--color-text);
  }

  .providers__hint {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }
</style>
