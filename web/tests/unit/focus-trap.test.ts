// G-038 (S05b finding X-1) — returnFocusTarget() under jsdom: which element an
// overlay hands focus back to. jsdom, like Chrome, can focus a button, but a
// click in Safari does not: the WebKit cases press a control WITHOUT focusing
// it (pointerdown only), leaving document.activeElement on <body> or on a
// focusable ancestor, exactly what Safari leaves behind.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { returnFocusTarget } from '#lib/focus-trap.js';

/** A Safari click: the press is seen, the control is not focused. */
function pressWithoutFocus(el: Element): void {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
}

function keydownOn(el: Element, key = 'a'): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no #${id}`);
  return el;
};

beforeEach(() => {
  // Forget the previous test's press: a keydown on <body> lands on no control.
  keydownOn(document.body);
});

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
  document.body.innerHTML = '';
});

describe('returnFocusTarget — the opener an overlay returns focus to', () => {
  it('an explicit trigger always wins', () => {
    document.body.innerHTML = '<button id="trigger">Menú</button><button id="other">Otro</button>';
    byId('other').focus();
    pressWithoutFocus(byId('other'));
    expect(returnFocusTarget(byId('trigger'))).toBe(byId('trigger'));
  });

  it('a focused control is its own answer (keyboard opening, or a click outside WebKit)', () => {
    document.body.innerHTML = '<button id="open">Abrir</button>';
    byId('open').focus();
    keydownOn(byId('open'), 'Enter');
    expect(returnFocusTarget()).toBe(byId('open'));
    expect(returnFocusTarget(null)).toBe(byId('open'));
  });

  it('WebKit: a clicked button left unfocused, focus on <body>, is still the opener', () => {
    document.body.innerHTML =
      '<button id="open"><i class="fa-solid fa-plus"></i> <span>Nuevo</span></button>';
    pressWithoutFocus(byId('open').querySelector('span')!);
    expect(document.activeElement).toBe(document.body);
    expect(returnFocusTarget()).toBe(byId('open'));
  });

  it('WebKit: focus on a focusable ancestor (<main tabindex="-1">) → the control pressed in it', () => {
    document.body.innerHTML =
      '<main id="main" tabindex="-1"><button id="tile">Foto</button></main>';
    byId('main').focus();
    pressWithoutFocus(byId('tile'));
    expect(returnFocusTarget()).toBe(byId('tile'));
  });

  it('a tab-ring container that took focus still yields the control pressed inside it', () => {
    document.body.innerHTML = '<div id="card" tabindex="0"><button id="edit">Editar</button></div>';
    byId('card').focus();
    pressWithoutFocus(byId('edit'));
    expect(returnFocusTarget()).toBe(byId('edit'));
  });

  it('a press on an SVG icon resolves to the button around it', () => {
    document.body.innerHTML = `<button id="close" aria-label="Cerrar">
      <svg aria-hidden="true"><use href="#xmark"></use></svg>
    </button>`;
    pressWithoutFocus(byId('close').querySelector('use')!);
    expect(returnFocusTarget()).toBe(byId('close'));
  });

  it('a keydown since the click forgets it: a shortcut on <body> does not return to a stale opener', () => {
    document.body.innerHTML = '<button id="old">Antes</button>';
    pressWithoutFocus(byId('old'));
    keydownOn(document.body, 'k');
    expect(returnFocusTarget()).toBe(document.body);
  });

  it('a keyboard user who moved focus since the click gets the focused control', () => {
    document.body.innerHTML = '<button id="clicked">Uno</button><button id="focused">Dos</button>';
    pressWithoutFocus(byId('clicked'));
    byId('focused').focus();
    expect(returnFocusTarget()).toBe(byId('focused'));
  });

  it('a pressed control that has left the page is never returned to', () => {
    document.body.innerHTML = '<button id="row">Eliminar fila</button>';
    pressWithoutFocus(byId('row'));
    byId('row').remove();
    expect(returnFocusTarget()).toBe(document.body);
  });

  it('a press outside the tab ring leaves no opener', () => {
    document.body.innerHTML = `
      <p id="text">Texto</p>
      <button id="off" disabled>Desactivado</button>
      <button id="hidden" aria-hidden="true" tabindex="-1">Oculto</button>
      <div hidden><button id="inside-hidden">Escondido</button></div>`;
    for (const id of ['text', 'off', 'hidden', 'inside-hidden']) {
      pressWithoutFocus(byId(id));
      expect(returnFocusTarget(), id).toBe(document.body);
    }
  });

  it('listens in the capture phase: a handler that stops propagation cannot hide the press', () => {
    document.body.innerHTML = '<div id="wrap"><button id="open">Abrir</button></div>';
    byId('wrap').addEventListener('pointerdown', (event) => event.stopPropagation(), true);
    byId('open').addEventListener('pointerdown', (event) => event.stopImmediatePropagation());
    pressWithoutFocus(byId('open'));
    expect(returnFocusTarget()).toBe(byId('open'));
  });
});
