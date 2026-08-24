// S13 — the icon contract as text: the sprite asset is the legacy file with
// exactly the ids SPRITE_ICONS names, injectSprite() is idempotent, and
// app.html loads the pinned Font Awesome stylesheet with its SRI hash.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FA_CSS_INTEGRITY,
  FA_CSS_URL,
  FA_VERSION,
  ICON_SETS,
  SPRITE_HOLDER_ID,
  SPRITE_ICONS,
  injectSprite,
  isFaIconName,
  isSpriteIcon,
  isValidIcon,
} from '$lib/components/icon';

// cwd is web/ under vitest (import.meta.url is not a file: URL for test files).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const sprite = read('src/lib/assets/icons.svg');
const appHtml = read('src/app.html');

afterEach(() => {
  document.getElementById(SPRITE_HOLDER_ID)?.remove();
});

describe('sprite asset', () => {
  it('declares exactly the symbols SPRITE_ICONS lists (one source of truth)', () => {
    const ids = [...sprite.matchAll(/<symbol\s+id="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(ids).toEqual([...SPRITE_ICONS].sort());
  });

  it('is a single hidden <svg> root whose symbols all carry a viewBox', () => {
    expect(sprite.match(/<svg\b/g)).toHaveLength(1);
    expect(sprite).toMatch(/<svg[^>]*style="display:none;"/);
    for (const m of sprite.matchAll(/<symbol\b[^>]*>/g)) {
      expect(m[0]).toMatch(/viewBox="/);
    }
  });

  it('contains no scripts, event handlers or external references', () => {
    expect(sprite).not.toMatch(/<script/i);
    expect(sprite).not.toMatch(/\son[a-z]+=/i);
    expect(sprite).not.toMatch(/href="(?!#)/i);
  });
});

describe('name guards', () => {
  it('isSpriteIcon narrows to the closed set only', () => {
    for (const id of SPRITE_ICONS) expect(isSpriteIcon(id)).toBe(true);
    for (const bad of ['Image', 'g14', 'church', '#logo-church', '', null, undefined, 3]) {
      expect(isSpriteIcon(bad), String(bad)).toBe(false);
    }
  });

  it('isFaIconName accepts kebab tokens and nothing else', () => {
    for (const ok of ['church', 'map-marker-alt', 'circle-check', 'x', 'calendar-3']) {
      expect(isFaIconName(ok), ok).toBe(true);
    }
    for (const bad of ['Church', 'a b', 'spinner fa-spin', '-x', 'x-', 'x--y', '', 'é', null, 1]) {
      expect(isFaIconName(bad), String(bad)).toBe(false);
    }
  });

  it('isValidIcon routes by set', () => {
    expect(isValidIcon('fas', 'church')).toBe(true);
    expect(isValidIcon('fas', 'logo-church')).toBe(true); // a kebab token; FA decides whether it exists
    expect(isValidIcon('sprite', 'logo-church')).toBe(true);
    expect(isValidIcon('sprite', 'church')).toBe(false);
    expect(ICON_SETS).toEqual(['fas', 'far', 'fab', 'sprite']);
  });
});

describe('injectSprite()', () => {
  it('injects once into document.body and returns the same holder afterwards', () => {
    const first = injectSprite();
    const second = injectSprite();
    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${SPRITE_HOLDER_ID}`)).toHaveLength(1);
    expect(first!.parentElement).toBe(document.body);
    expect(first!.getAttribute('aria-hidden')).toBe('true');
    expect(first!.querySelectorAll('symbol')).toHaveLength(SPRITE_ICONS.length);
    expect(first!.querySelector('svg')!.getAttribute('xmlns:xlink')).toBe(
      'http://www.w3.org/1999/xlink',
    );
  });

  it('re-injects if the holder was removed, and adopts a pre-existing holder', () => {
    const first = injectSprite()!;
    first.remove();
    const again = injectSprite()!;
    expect(again).not.toBe(first);
    expect(again.isConnected).toBe(true);

    again.remove();
    const foreign = document.createElement('div');
    foreign.id = SPRITE_HOLDER_ID;
    document.body.append(foreign);
    expect(injectSprite()).toBe(foreign);
    expect(document.querySelectorAll(`#${SPRITE_HOLDER_ID}`)).toHaveLength(1);
  });

  it('re-points <use> elements that were in the DOM before the sprite arrived', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#logo-church');
    svg.append(use);
    document.body.append(svg);
    injectSprite();
    expect(use.getAttribute('href')).toBe('#logo-church');
    svg.remove();
  });
});

describe('Font Awesome pin (app.html)', () => {
  it('loads exactly one FA stylesheet: the pinned URL with its SRI hash, anonymous, no referrer', () => {
    const links = appHtml.match(/<link[^>]*font-awesome[^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    const link = (links[0] ?? '').replace(/\s+/g, ' ');
    expect(link).toContain(`href="${FA_CSS_URL}"`);
    expect(link).toContain(`integrity="${FA_CSS_INTEGRITY}"`);
    expect(link).toContain('crossorigin="anonymous"');
    expect(link).toContain('referrerpolicy="no-referrer"');
    expect(link).toContain('rel="stylesheet"');
  });

  it('pins the version the legacy heads load (no second icon set)', () => {
    expect(FA_VERSION).toBe('6.5.0');
    expect(FA_CSS_URL).toContain(`/font-awesome/${FA_VERSION}/`);
    expect(FA_CSS_INTEGRITY).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
    expect(appHtml.match(/font-awesome\/\d+\.\d+\.\d+/g)).toEqual([`font-awesome/${FA_VERSION}`]);
  });
});
