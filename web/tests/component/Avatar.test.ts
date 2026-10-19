// PR-C2 — Avatar.svelte under jsdom: a photo is an <img> (never a
// background-image string) named by the person unless decorative; the
// initials from #lib/initials are always underneath; a missing, refused or
// broken photo leaves the initials, which then carry the name; every size
// renders its modifier.
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import Avatar from '#lib/components/Avatar.svelte';
import { AVATAR_BLOCK, AVATAR_SIZES } from '#lib/components/avatar.js';

const PHOTO = 'https://example.supabase.co/storage/v1/object/public/avatars/u1/a.jpg';

const root = (container: HTMLElement) => container.querySelector<HTMLElement>(`.${AVATAR_BLOCK}`);

function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/Avatar.svelte'), 'utf8');
  const block = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  return block.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Avatar — photo', () => {
  it('renders the photo as an <img> whose alt is the name', () => {
    const { container, getByRole } = render(Avatar, { name: 'Ana Pastor', src: PHOTO });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', PHOTO);
    expect(img).toHaveAttribute('alt', 'Ana Pastor');
    expect(getByRole('img', { name: 'Ana Pastor' })).toBe(img);
    // The disc is not a second named image while the photo names the avatar.
    expect(root(container)).not.toHaveAttribute('role');
  });

  it('never paints the photo through a style attribute', () => {
    const { container } = render(Avatar, { name: 'Ana Pastor', src: PHOTO });
    expect(container.querySelector('[style]')).toBeNull();
    expect(styleBlock()).not.toContain('background-image');
  });

  it('decorative (the name is beside it): alt="" and hidden from assistive tech', () => {
    const { container, queryByRole } = render(Avatar, {
      name: 'Ana Pastor',
      src: PHOTO,
      decorative: true,
    });
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(root(container)).toHaveAttribute('aria-hidden', 'true');
    expect(queryByRole('img')).toBeNull();
  });

  it('sets intrinsic width/height and lazy, async decoding (no layout shift)', () => {
    const { container } = render(Avatar, { name: 'Ana', src: PHOTO, size: 48 });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width', '48');
    expect(img).toHaveAttribute('height', '48');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });
});

describe('Avatar — initials', () => {
  it('without a photo the disc shows the shared initials and is named by the person', () => {
    const { container, getByRole } = render(Avatar, { name: 'Pastor Raúl García Guerra' });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ird-avatar__fallback')).toHaveTextContent('RG');
    expect(container.querySelector('.ird-avatar__fallback')).toHaveAttribute('aria-hidden', 'true');
    expect(getByRole('img', { name: 'Pastor Raúl García Guerra' })).toBe(root(container));
  });

  it('draws the initials under the photo too, so a failed load is never blank', () => {
    const { container } = render(Avatar, { name: 'Flor Alfaro', src: PHOTO });
    expect(container.querySelector('.ird-avatar__fallback')).toHaveTextContent('FA');
  });

  it('a name with no letters shows a person glyph instead', () => {
    const { container, getByRole } = render(Avatar, { name: '🙏' });
    expect(container.querySelector('.ird-avatar__fallback .icon')).toHaveClass('fa-user');
    expect(getByRole('img', { name: '🙏' })).toBe(root(container));
  });

  it('decorative initials are hidden as a whole', () => {
    const { container, queryByRole } = render(Avatar, { name: 'Ana Pastor', decorative: true });
    expect(root(container)).toHaveAttribute('aria-hidden', 'true');
    expect(root(container)).not.toHaveAttribute('role');
    expect(queryByRole('img')).toBeNull();
  });

  it('renders the name as text, never markup', () => {
    const { container } = render(Avatar, { name: '<b>Ana</b> Soto' });
    expect(container.querySelector('b')).toBeNull();
    expect(root(container)).toHaveAttribute('aria-label', '<b>Ana</b> Soto');
  });
});

describe('Avatar — fallback paths', () => {
  it('an image error falls back to the initials, which then carry the name', async () => {
    const { container, getByRole } = render(Avatar, { name: 'Ana Pastor', src: PHOTO });
    await fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(getByRole('img', { name: 'Ana Pastor' })).toBe(root(container));
    expect(container.querySelector('.ird-avatar__fallback')).toHaveTextContent('AP');
  });

  it('a photo that failed before mount (no error event to hear) falls back too', async () => {
    // A complete image with no pixels: what a prerendered page's 404 looks like
    // by the time hydration attaches onerror (jsdom's naturalWidth is 0).
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    try {
      const { container } = render(Avatar, { name: 'Ana Pastor', src: PHOTO });
      await tick();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('.ird-avatar__fallback')).toHaveTextContent('AP');
    } finally {
      complete.mockRestore();
    }
  });

  it('a new src after a failure gets its own chance to load', async () => {
    const { container, rerender } = render(Avatar, { name: 'Ana Pastor', src: PHOTO });
    await fireEvent.error(container.querySelector('img')!);
    await rerender({ name: 'Ana Pastor', src: `${PHOTO}?v=2` });
    expect(container.querySelector('img')).toHaveAttribute('src', `${PHOTO}?v=2`);
  });

  it('refuses unsafe or unknown URL schemes and shows the initials', () => {
    for (const src of [
      'javascript:alert(1)',
      '//evil.example/a.png',
      'data:text/html,<script>alert(1)</script>',
      'avatar.png',
      '',
      null,
    ]) {
      const { container } = render(Avatar, { name: 'Ana Pastor', src });
      expect(container.querySelector('img'), String(src)).toBeNull();
      expect(container.querySelector('.ird-avatar__fallback')).toHaveTextContent('AP');
    }
  });
});

describe('Avatar — sizes and styles', () => {
  it('every size renders its modifier; 36 is the default', () => {
    for (const size of AVATAR_SIZES) {
      const { container } = render(Avatar, { name: 'Ana', size });
      expect(root(container), String(size)).toHaveClass(`${AVATAR_BLOCK}--${size}`);
    }
    const { container } = render(Avatar, { name: 'Ana' });
    expect(root(container)).toHaveClass(`${AVATAR_BLOCK}--36`);
  });

  it('maps the four sizes to 24/36/48/96px squares (rem at the default root size)', () => {
    const css = styleBlock();
    for (const [size, rem] of [
      [24, '1.5rem'],
      [36, '2.25rem'],
      [48, '3rem'],
      [96, '6rem'],
    ] as const) {
      expect(css, String(size)).toMatch(
        new RegExp(
          `\\.ird-avatar--${size}\\s*\\{[^}]*--avatar-size:\\s*${rem.replace('.', '\\.')}`,
        ),
      );
    }
  });

  it('is token-only: no hex literal, no px/rem font-size, no colour-scheme query', () => {
    const css = styleBlock();
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).toMatch(/border-radius:\s*var\(--radius-full\)/);
  });
});
