<script lang="ts">
  import { base } from '$app/paths';

  // Proves the scaffold builds under a subpath: this resolves to `/app` when the app is
  // built with BASE_PATH=/app, and to '' once a surface is cut over to the domain root.
  const mountedAt: string = base || '/';
</script>

<svelte:head>
  <title>IRD · app</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <h1>Iglesia Restauración Divina</h1>
  <p>El nuevo panel se está construyendo aquí.</p>
  <p>Montado en <code>{mountedAt}</code></p>
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 2rem 1rem;
    font-family: system-ui, sans-serif;
    line-height: 1.5;
  }
</style>
