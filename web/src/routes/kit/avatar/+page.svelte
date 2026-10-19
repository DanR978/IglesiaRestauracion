<script lang="ts">
  // /kit/avatar/ — the PR-C2 staging smoke page for Avatar: the four sizes,
  // photo vs initials, every fallback path (broken photo, refused URL, a name
  // without letters), the one shared initials algorithm, decorative use beside
  // a visible name, and both palettes. The "photos" are inline SVG data URLs
  // so the page never leaves its origin. Prerendered, no data fetching, noindex.
  import { onMount } from 'svelte';
  import Avatar from '#lib/components/Avatar.svelte';
  import Badge from '#lib/components/Badge.svelte';
  import IconButton from '#lib/components/IconButton.svelte';
  import { AVATAR_SIZES } from '#lib/components/avatar.js';
  import { initials } from '#lib/initials.js';

  /** A flat placeholder portrait (sample content, not styling). */
  function portrait(background: string, face: string, shirt: string): string {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">` +
      `<rect width="160" height="160" fill="${background}"/>` +
      `<circle cx="80" cy="64" r="30" fill="${face}"/>` +
      `<path d="M26 160c4-36 26-54 54-54s50 18 54 54z" fill="${shirt}"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  const PHOTO_A = portrait('#cbd5e1', '#8d5a3b', '#334155');
  const PHOTO_B = portrait('#e2e8f0', '#e0b48f', '#64748b');
  /** A data URL that is not an image: the browser fires `error`, no request is made. */
  const BROKEN = 'data:image/png;base64,AAAA';

  const PEOPLE = [
    { name: 'Pastor Raúl García Guerra', src: PHOTO_A, role: 'admin' },
    { name: 'Ana Pastor', src: null, role: 'treasurer' },
    { name: 'Flor Alfaro', src: PHOTO_B, role: 'ministry_leader' },
  ] as const;

  const SAMPLES = [
    'Pastor Raúl García Guerra',
    'Ana Pastor',
    'Juan Carlos Pérez López',
    'Dra. Elena Soto',
    '🙏 Flor Alfaro 🙏',
    'María',
    '🙏',
  ];

  let viewport = $state(0);
  let logouts = $state(0);

  function measure() {
    viewport = window.innerWidth;
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · Avatar</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Avatares</h1>
    <p class="kit__lede">
      Página de prueba de PR-C2: <code>Avatar</code> reemplaza <code>paintAvatar</code> y
      <code>.adm-avatar</code>. La foto es un <code>&lt;img&gt;</code> (nunca una cadena
      <code>background-image</code> en un atributo <code>style</code>) y las iniciales salen de un
      único algoritmo compartido. Si la foto falta, se rechaza o no carga, quedan las iniciales.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Cierres de sesión simulados</dt>
        <dd>{logouts}</dd>
      </div>
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-sizes">
    <h2 id="h-sizes">Tamaños</h2>
    <div class="row" data-testid="sizes-initials">
      {#each AVATAR_SIZES as size (size)}
        <Avatar name="Ana Pastor" {size} />
      {/each}
    </div>
    <div class="row" data-testid="sizes-photo">
      {#each AVATAR_SIZES as size (size)}
        <Avatar name="Flor Alfaro" src={PHOTO_B} {size} />
      {/each}
    </div>
    <p class="kit__note">
      24 (actor de Actividad) · 36 (barra lateral, filas) · 48 · 96 (Mi cuenta).
    </p>
  </section>

  <section class="kit__section" aria-labelledby="h-fallback">
    <h2 id="h-fallback">Foto o iniciales</h2>
    <ul class="cases">
      <li class="cases__item" data-case="photo">
        <Avatar name="Pastor Raúl García Guerra" src={PHOTO_A} size={48} />
        <span>Con foto: <code>alt</code> es el nombre.</span>
      </li>
      <li class="cases__item" data-case="broken">
        <Avatar name="Ana Pastor" src={BROKEN} size={48} />
        <span>La foto no carga: quedan las iniciales, que pasan a nombrar el avatar.</span>
      </li>
      <li class="cases__item" data-case="refused">
        <Avatar name="Juan Pérez" src="javascript:alert(1)" size={48} />
        <span>URL rechazada por <code>avatarSrc()</code>: iniciales, sin petición.</span>
      </li>
      <li class="cases__item" data-case="none">
        <Avatar name="Elena Soto" size={48} />
        <span>Sin foto.</span>
      </li>
      <li class="cases__item" data-case="no-letters">
        <Avatar name="🙏" size={48} />
        <span>Un nombre sin letras: el icono de persona.</span>
      </li>
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-initials">
    <h2 id="h-initials">Un solo algoritmo de iniciales</h2>
    <p class="kit__note">
      Primera letra de la primera y de la última palabra; los títulos iniciales se saltan («Pastor
      Ana…»), pero un apellido como «Pastor» se queda. Es el de la página de líderes, ahora
      compartido por la barra lateral, Mi cuenta, Usuarios y Actividad.
    </p>
    <table class="samples">
      <thead>
        <tr><th scope="col">Nombre</th><th scope="col">Iniciales</th></tr>
      </thead>
      <tbody>
        {#each SAMPLES as name (name)}
          <tr>
            <td>{name}</td>
            <td><code>{initials(name) || '— (icono)'}</code></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="kit__section" aria-labelledby="h-decorative">
    <h2 id="h-decorative">Junto al nombre: decorativo</h2>
    <p class="kit__note">
      Cuando el nombre ya se lee al lado, el avatar se oculta a la tecnología de asistencia (<code
        >decorative</code
      >, <code>alt=""</code>) para no leerlo dos veces.
    </p>
    <ul class="people">
      {#each PEOPLE as person (person.name)}
        <li class="people__row">
          <Avatar name={person.name} src={person.src} decorative />
          <span class="people__name">{person.name}</span>
          <Badge role={person.role} />
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-surface">
    <h2 id="h-surface">Superficie pública vs. admin</h2>
    <div class="compare">
      <div class="compare__col">
        <p class="compare__tag">público</p>
        <div class="row">
          <Avatar name="Ana Pastor" />
          <Avatar name="Flor Alfaro" src={PHOTO_B} />
        </div>
      </div>
      <div class="compare__col" data-surface="admin">
        <p class="compare__tag">admin — pie de la barra lateral</p>
        <div class="account">
          <Avatar name="Pastor Raúl García Guerra" decorative />
          <span class="account__who">
            <span class="account__name">Pastor Raúl García Guerra</span>
            <span class="account__role">Administrador</span>
          </span>
          <IconButton
            icon="right-from-bracket"
            label="Cerrar sesión"
            onclick={() => (logouts += 1)}
          />
        </div>
      </div>
    </div>
  </section>
</main>

<style>
  .kit {
    max-width: 64rem;
    margin: 0 auto;
    padding: var(--pd-md);
    font-family: var(--font-base);
    font-size: var(--fs-base);
    line-height: 1.5;
  }
  .kit__title {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
  }
  .kit__lede,
  .kit__note {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .kit__section {
    margin-top: var(--mg-lg);
  }
  .kit__section > h2 {
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    margin-bottom: var(--mg-sm);
  }
  code {
    font-size: 0.85em;
  }

  .facts {
    margin: var(--mg-sm) 0 0;
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    font-size: var(--fs-sm);
  }
  .facts__row {
    display: grid;
    grid-template-columns: 16rem 1fr;
    gap: var(--mg-xs);
    padding: var(--mg-xxs) 0;
  }
  .facts__row dt {
    color: var(--color-muted);
  }
  .facts__row dd {
    margin: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-sm);
    margin-block-end: var(--mg-sm);
  }

  .cases,
  .people {
    display: grid;
    gap: var(--mg-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .cases__item {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
    font-size: var(--fs-sm);
  }

  .samples {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
  }
  .samples th,
  .samples td {
    padding: var(--mg-xxs) var(--mg-xs);
    border-bottom: 1px solid rgba(127, 127, 127, 0.18);
    text-align: start;
    overflow-wrap: anywhere;
  }

  .people__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--mg-xs) var(--mg-sm);
  }
  .people__name {
    font-weight: var(--fw-semibold);
  }

  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--mg-sm);
  }
  .compare__col {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
  }
  .compare__tag {
    margin: 0 0 var(--mg-xs);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }

  /* The sidebar footer of the visual brief: 36px avatar, name, role, logout. */
  .account {
    display: flex;
    align-items: center;
    gap: var(--mg-sm);
  }
  .account__who {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-inline-size: 0;
  }
  .account__name {
    overflow: hidden;
    font-size: var(--fs-sm);
    font-weight: var(--fw-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .account__role {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }

  @media (max-width: 640px) {
    .compare {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 480px) {
    .facts__row {
      grid-template-columns: 1fr;
    }
  }
</style>
