<script lang="ts">
  // /kit/action-sheet/ — the S17 staging smoke page. Every ActionSheet shape:
  // the flat row kebab, variants, disabled + contextual extra rows, the grouped
  // member menu (section label · divider · empty fallback), the four viewport
  // corners the popover has to flip and clamp against, the imperative
  // showActionSheet() singleton, and the admin surface. Prerendered, no data.
  import ActionSheet from '$lib/components/ActionSheet.svelte';
  import ActionSheetHost from '$lib/components/ActionSheetHost.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import {
    MOBILE_QUERY,
    VIEWPORT_GUTTER,
    isMobileViewport,
    showActionSheet,
    type SheetAction,
    type SheetGroup,
  } from '$lib/components/action-sheet.svelte';
  import { prefersReducedMotion } from '$lib/reduced-motion';
  import { onMount } from 'svelte';

  const GROUPS: SheetGroup[] = [
    { id: 'move', label: 'Mover a otro grupo', empty: 'No hay otros grupos todavía.' },
  ];

  let viewport = $state(0);
  let mobile = $state(false);
  let lastAction = $state('—');

  // Declarative instance: this page owns the trigger and the open flag.
  let declarativeOpen = $state(false);
  let declarativeTrigger: HTMLButtonElement | undefined = $state();

  function note(label: string) {
    return () => {
      lastAction = `${label} · ${new Date().toLocaleTimeString('es-MX')}`;
    };
  }

  const rowActions: SheetAction[] = [
    { label: 'Ver registros', icon: 'fa-clipboard-list', onClick: note('Ver registros') },
    { label: 'Editar evento', icon: 'fa-pen', onClick: note('Editar evento') },
    {
      label: 'Cancelar evento',
      icon: 'fa-ban',
      variant: 'warn',
      onClick: note('Cancelar evento'),
    },
    {
      label: 'Eliminar evento',
      icon: 'fa-trash',
      variant: 'danger',
      onClick: note('Eliminar evento'),
    },
  ];

  const contextualActions: SheetAction[] = [
    { label: 'Editar', icon: 'fa-pen', onClick: note('Editar') },
    {
      label: 'Marcar pagado',
      icon: 'fa-circle-check',
      description: 'Disponible solo cuando el movimiento está abierto',
      disabled: true,
      onClick: note('Marcar pagado'),
    },
    { label: 'Duplicar', icon: 'fa-copy', onClick: note('Duplicar') },
    { label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: note('Eliminar') },
  ];

  const memberActions: SheetAction[] = [
    {
      label: 'Nivel 1 · Fundamentos',
      icon: 'fa-arrow-right-arrow-left',
      description: 'Domingos 10:00',
      group: 'move',
      onClick: note('Mover a Nivel 1'),
    },
    {
      label: 'Nivel 3 · Servicio',
      icon: 'fa-arrow-right-arrow-left',
      description: 'Miércoles 19:00',
      group: 'move',
      onClick: note('Mover a Nivel 3'),
    },
    {
      label: 'Crear nuevo grupo y mover aquí',
      icon: 'fa-plus',
      onClick: note('Crear y mover'),
    },
    {
      label: 'Remover del grupo',
      icon: 'fa-user-minus',
      variant: 'danger',
      onClick: note('Remover'),
    },
  ];

  const emptyGroupActions: SheetAction[] = [
    {
      label: 'Remover del grupo',
      icon: 'fa-user-minus',
      variant: 'danger',
      onClick: note('Remover'),
    },
  ];

  const CORNERS = [
    { id: 'tl', label: 'Arriba izq.' },
    { id: 'tr', label: 'Arriba der.' },
    { id: 'bl', label: 'Abajo izq.' },
    { id: 'br', label: 'Abajo der.' },
  ] as const;

  function openFrom(
    event: MouseEvent,
    request: Omit<Parameters<typeof showActionSheet>[0], 'trigger'>,
  ) {
    showActionSheet({ ...request, trigger: event.currentTarget as HTMLElement });
  }

  function measure() {
    viewport = window.innerWidth;
    mobile = isMobileViewport();
  }

  onMount(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
</script>

<svelte:head>
  <title>Kit · ActionSheet</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip-link" href="#kit-main">Saltar al contenido</a>

<main id="kit-main" class="kit" tabindex="-1">
  <header class="kit__head">
    <h1 class="kit__title">Menú de acciones</h1>
    <p class="kit__lede">
      Página de prueba de S17. Un solo componente reemplaza los cuatro menús del panel actual. En
      escritorio es un <strong>popover anclado</strong> al botón que lo abre; a
      <code>{MOBILE_QUERY}</code>
      se convierte en una <strong>hoja inferior</strong> con fila «Cancelar». Se navega con ↑ ↓ Inicio
      Fin, se cierra con Escape y el foco vuelve al botón.
    </p>
    <dl class="facts">
      <div class="facts__row">
        <dt>Ancho de ventana</dt>
        <dd>{viewport ? `${viewport}px` : '…'}</dd>
      </div>
      <div class="facts__row">
        <dt>Modo</dt>
        <dd>{mobile ? 'hoja inferior (≤640px)' : 'popover anclado'}</dd>
      </div>
      <div class="facts__row">
        <dt>Margen mínimo al borde</dt>
        <dd>{VIEWPORT_GUTTER}px</dd>
      </div>
      <div class="facts__row">
        <dt>Movimiento reducido</dt>
        <dd>{prefersReducedMotion.current ? 'activado' : 'no solicitado'}</dd>
      </div>
      <div class="facts__row">
        <dt>Última acción ejecutada</dt>
        <dd>{lastAction}</dd>
      </div>
    </dl>
  </header>

  <section class="kit__section" aria-labelledby="h-rows">
    <h2 id="h-rows">Kebab de fila — el caso base</h2>
    <p class="kit__note">
      Todo menú de fila pasa por aquí: ningún botón de tres puntos va cableado directo a «Eliminar».
    </p>
    <ul class="rows">
      {#each ['Escuela Bíblica de Vacaciones', 'Vigilia de oración', 'Retiro de matrimonios'] as name (name)}
        <li class="row">
          <span class="row__title">{name}</span>
          <button
            type="button"
            class="kebab"
            aria-label="Acciones de {name}"
            onclick={(event) =>
              openFrom(event, {
                title: name,
                subtitle: 'Sábado, 12 de octubre',
                actions: rowActions,
              })}
          >
            <Icon name="ellipsis-vertical" />
          </button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="kit__section" aria-labelledby="h-variants">
    <h2 id="h-variants">Variantes y estados</h2>
    <div class="btns">
      <button
        type="button"
        class="ctl"
        onclick={(event) =>
          openFrom(event, {
            title: 'Movimiento',
            subtitle: '$1,250.00 · Pendiente',
            actions: contextualActions,
          })}
      >
        <Icon name="list-check" /> Con fila deshabilitada
      </button>
      <button
        type="button"
        class="ctl"
        onclick={(event) =>
          openFrom(event, {
            actions: [
              { label: 'Predeterminada', icon: 'fa-circle', onClick: note('default') },
              {
                label: 'Advertencia',
                icon: 'fa-triangle-exclamation',
                variant: 'warn',
                onClick: note('warn'),
              },
              {
                label: 'Destructiva',
                icon: 'fa-trash',
                variant: 'danger',
                onClick: note('danger'),
              },
              { label: 'Sin icono', onClick: note('sin icono') },
              {
                label: 'Con descripción',
                icon: 'fa-circle-info',
                description: 'Una segunda línea explicativa',
                onClick: note('descripción'),
              },
            ],
          })}
      >
        <Icon name="palette" /> Las tres variantes
      </button>
      <button
        type="button"
        class="ctl"
        onclick={(event) =>
          openFrom(event, {
            title: 'Un título muy largo que tiene que partirse en varias líneas sin desbordar',
            subtitle: 'Y un subtítulo igual de largo para comprobar el ajuste del texto',
            actions: rowActions,
          })}
      >
        <Icon name="text-width" /> Texto largo
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-groups">
    <h2 id="h-groups">Secciones — etiqueta, separador y vacío</h2>
    <p class="kit__note">
      El menú de miembros del discipulado: una sección «Mover a otro grupo», un separador y una fila
      destructiva. Si no hay otros grupos, la sección muestra su texto de vacío.
    </p>
    <div class="btns">
      <button
        type="button"
        class="ctl"
        onclick={(event) =>
          openFrom(event, { title: 'María Hernández', actions: memberActions, groups: GROUPS })}
      >
        <Icon name="users" /> Con grupos
      </button>
      <button
        type="button"
        class="ctl"
        onclick={(event) =>
          openFrom(event, {
            title: 'María Hernández',
            actions: emptyGroupActions,
            groups: GROUPS,
          })}
      >
        <Icon name="user-slash" /> Sección vacía
      </button>
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-edges">
    <h2 id="h-edges">Bordes de la ventana</h2>
    <p class="kit__note">
      Desde las cuatro esquinas: el popover se voltea hacia arriba cuando no cabe abajo y se pega a
      {VIEWPORT_GUTTER}px de los bordes laterales. Desplaza la página con el menú abierto — se
      recoloca solo.
    </p>
    <div class="corners">
      {#each CORNERS as corner (corner.id)}
        <button
          type="button"
          class="ctl corner corner--{corner.id}"
          onclick={(event) => openFrom(event, { title: corner.label, actions: rowActions })}
        >
          {corner.label}
        </button>
      {/each}
    </div>
    <div class="scroller">
      <p class="kit__note">Contenido para poder desplazar la página.</p>
      {#each Array.from({ length: 12 }, (_, i) => i + 1) as n (n)}
        <p class="filler">Línea de relleno {n}</p>
      {/each}
    </div>
  </section>

  <section class="kit__section" aria-labelledby="h-declarative">
    <h2 id="h-declarative">Uso declarativo</h2>
    <p class="kit__note">
      Cuando el componente ya es dueño del botón: <code>&lt;ActionSheet bind:open … /&gt;</code>. La
      instancia imperativa de arriba usa <code>showActionSheet()</code> y un solo
      <code>&lt;ActionSheetHost /&gt;</code>.
    </p>
    <button
      type="button"
      class="ctl"
      bind:this={declarativeTrigger}
      onclick={() => (declarativeOpen = true)}
    >
      <Icon name="code" /> Abrir instancia local
    </button>
    <ActionSheet
      bind:open={declarativeOpen}
      trigger={declarativeTrigger}
      title="Instancia local"
      subtitle="bind:open"
      actions={rowActions}
    />
  </section>

  <section class="kit__section" aria-labelledby="h-admin" data-surface="admin">
    <h2 id="h-admin">Superficie admin</h2>
    <p class="kit__note">
      La misma hoja dentro de <code>data-surface="admin"</code>: la paleta pizarra se hereda por
      variables, el componente no codifica ningún color de superficie.
    </p>
    <button
      type="button"
      class="ctl"
      onclick={(event) => openFrom(event, { title: 'Panel', actions: rowActions })}
    >
      <Icon name="gauge" /> Abrir en admin
    </button>
  </section>
</main>

<ActionSheetHost />

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
    grid-template-columns: 14rem 1fr;
    gap: var(--mg-xs);
    padding: var(--mg-xxs) 0;
  }
  .facts__row dt {
    color: var(--color-muted);
  }
  .facts__row dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--mg-sm);
    padding: var(--pd-xs) var(--pd-sm);
    border-top: 1px solid rgba(127, 127, 127, 0.18);
  }
  .row:first-child {
    border-top: 0;
  }
  .row__title {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .kebab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    color: var(--color-muted);
    transition: color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .kebab:hover {
    color: var(--color-text);
  }

  .btns,
  .corners {
    display: flex;
    flex-wrap: wrap;
    gap: var(--mg-sm);
  }
  .ctl {
    display: inline-flex;
    align-items: center;
    gap: var(--mg-xs);
    min-height: 44px;
    padding: var(--btn-pd-y) var(--btn-pd-x);
    border: 1.5px solid var(--gray-50);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: inherit;
    font-size: var(--fs-btn);
    font-weight: var(--fw-semibold);
    transition:
      border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ctl:hover {
    border-color: var(--color-text);
  }

  .corners {
    justify-content: space-between;
    margin-bottom: var(--mg-md);
  }
  .corner {
    flex: 0 0 auto;
  }
  .corner--tr,
  .corner--br {
    margin-left: auto;
  }

  .scroller {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
  }
  .filler {
    margin: 0;
    padding: var(--mg-xxs) 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }

  [data-surface='admin'] {
    padding: var(--pd-sm);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .kebab,
    .ctl {
      transition: none;
    }
  }

  @media (max-width: 480px) {
    .facts__row {
      grid-template-columns: 1fr;
    }
  }
</style>
