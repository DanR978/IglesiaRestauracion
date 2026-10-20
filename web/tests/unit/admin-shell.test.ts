// S37 — the admin shell's contract (shell.ts) and the page-title store: how
// the nav is grouped, which item is the open page, the tab title, the frame
// check, and the legacy panel's address.
import { describe, expect, it } from 'vitest';
import { SURFACES, visibleSurfacesFor } from '#lib/auth/surfaces.js';
import {
  LEGACY_PANEL_HREF,
  NAV_GROUPS,
  documentTitle,
  groupNav,
  isCurrentRoute,
  isFramed,
} from '#lib/components/admin/shell/shell.js';
import { pageTitle, setPageTitle } from '#lib/components/admin/shell/page-title.svelte.js';

describe('groupNav', () => {
  it('keeps the legacy group order and leaves empty groups out', () => {
    const sections = groupNav(SURFACES.filter((s) => s.ported));
    expect(sections.map((s) => s.group)).toEqual(['Principal']);
    expect(sections[0].items.map((s) => s.key)).toEqual(['inicio', 'cuenta']);
  });

  it('every group in order, items in registry order, when everything is ported', () => {
    const all = SURFACES.map((s) => ({ ...s, ported: true, route: `/admin/${s.key}/` }));
    const sections = groupNav(all);
    expect(sections.map((s) => s.group)).toEqual([...NAV_GROUPS]);
    expect(sections.flatMap((s) => s.items.map((i) => i.key))).toEqual(
      NAV_GROUPS.flatMap((g) => all.filter((s) => s.group === g).map((s) => s.key)),
    );
  });

  it('leaves out a surface it cannot link to', () => {
    expect(groupNav(SURFACES.filter((s) => !s.ported))).toEqual([]);
  });

  it('a treasurer sees only what perms would show', () => {
    const nav = visibleSurfacesFor({ role: 'treasurer' }).filter((s) => s.ported);
    expect(groupNav(nav).flatMap((s) => s.items.map((i) => i.label))).toEqual([
      'Inicio',
      'Mi cuenta',
    ]);
  });
});

describe('isCurrentRoute', () => {
  const home = '/app/admin/';

  it('Inicio is current on itself only', () => {
    expect(isCurrentRoute(home, '/app/admin/', home)).toBe(true);
    expect(isCurrentRoute(home, '/app/admin/cuenta/', home)).toBe(false);
  });

  it('a section is current on itself and on the pages inside it', () => {
    expect(isCurrentRoute('/app/admin/cuenta/', '/app/admin/cuenta/', home)).toBe(true);
    expect(isCurrentRoute('/app/admin/tesoreria/', '/app/admin/tesoreria/recibos/', home)).toBe(
      true,
    );
    expect(isCurrentRoute('/app/admin/cuenta/', '/app/admin/', home)).toBe(false);
    expect(isCurrentRoute('/app/admin/cuenta/', '/app/admin/cuentas/', home)).toBe(false);
  });
});

describe('documentTitle', () => {
  it('"<title> · Panel · Iglesia Restauración Divina"', () => {
    expect(documentTitle('Inicio')).toBe('Inicio · Panel · Iglesia Restauración Divina');
    expect(documentTitle('  Mi cuenta ')).toBe('Mi cuenta · Panel · Iglesia Restauración Divina');
  });

  it('just the panel and the church without a title', () => {
    expect(documentTitle('')).toBe('Panel · Iglesia Restauración Divina');
    expect(documentTitle('   ')).toBe('Panel · Iglesia Restauración Divina');
  });
});

describe('isFramed (D-037)', () => {
  it('a top-level window is not framed', () => {
    expect(isFramed()).toBe(false);
    const self = {} as Window;
    expect(isFramed({ top: self, self })).toBe(false);
  });

  it('a window inside another is', () => {
    expect(isFramed({ top: {} as Window, self: {} as Window })).toBe(true);
  });

  it('a browser that will not say counts as framed', () => {
    const view = {
      self: {} as Window,
      get top(): Window {
        throw new DOMException('Blocked', 'SecurityError');
      },
    };
    expect(isFramed(view)).toBe(true);
  });
});

describe('the legacy panel', () => {
  it('is the domain root /admin/, never under a base path', () => {
    expect(LEGACY_PANEL_HREF).toBe('/admin/');
  });
});

describe('page-title store', () => {
  it('shows the last title set, and a page leaving takes only its own back', () => {
    const leaveA = setPageTitle('Inicio');
    expect(pageTitle.current).toBe('Inicio');

    // The next page mounts before the previous one is torn down.
    const leaveB = setPageTitle(' Mi cuenta ');
    expect(pageTitle.current).toBe('Mi cuenta');
    leaveA();
    expect(pageTitle.current).toBe('Mi cuenta');

    leaveB();
    expect(pageTitle.current).toBe('');
  });
});
