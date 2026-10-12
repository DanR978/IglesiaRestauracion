// S13 — Icon.svelte under jsdom: both glyph sources render, `label` toggles
// aria-label vs aria-hidden, the sprite is injected exactly once, and no
// untrusted name can reach the sprite or add a class to the element.
import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Icon from '$lib/components/Icon.svelte';
import { SPRITE_HOLDER_ID, SPRITE_ICONS } from '$lib/components/icon';

const holders = () => document.querySelectorAll(`#${SPRITE_HOLDER_ID}`);
const icon = (container: HTMLElement) => container.querySelector('.icon');

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Icon — Font Awesome', () => {
  it('renders a solid glyph as <i class="fas fa-…"> (set defaults to fas)', () => {
    const { container } = render(Icon, { name: 'church' });
    const el = icon(container);
    expect(el?.tagName).toBe('I');
    expect(el).toHaveClass('icon', 'fas', 'fa-church');
    expect(el).not.toHaveClass('far', 'fab', 'fa-spin');
  });

  it('renders regular and brand glyphs with their style prefix', () => {
    const far = render(Icon, { set: 'far', name: 'clock' });
    expect(icon(far.container)).toHaveClass('far', 'fa-clock');
    const fab = render(Icon, { set: 'fab', name: 'whatsapp' });
    expect(icon(fab.container)).toHaveClass('fab', 'fa-whatsapp');
  });

  it('is decorative by default: aria-hidden="true", no role, no aria-label', () => {
    const { container } = render(Icon, { set: 'fas', name: 'bell' });
    const el = icon(container);
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).not.toHaveAttribute('role');
    expect(el).not.toHaveAttribute('aria-label');
  });

  it('becomes meaningful with `label`: role="img" + aria-label, no aria-hidden', () => {
    const { container, getByRole } = render(Icon, {
      set: 'fas',
      name: 'bell',
      label: 'Notificaciones',
    });
    const el = icon(container);
    expect(el).toHaveAttribute('role', 'img');
    expect(el).toHaveAttribute('aria-label', 'Notificaciones');
    expect(el).not.toHaveAttribute('aria-hidden');
    expect(getByRole('img', { name: 'Notificaciones' })).toBe(el);
  });

  it('treats an empty / whitespace label as absent (decorative)', () => {
    const { container } = render(Icon, { set: 'fas', name: 'bell', label: '   ' });
    const el = icon(container);
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).not.toHaveAttribute('aria-label');
  });

  it('`spin` adds fa-spin; `class` is appended verbatim', () => {
    const { container } = render(Icon, {
      set: 'fas',
      name: 'spinner',
      spin: true,
      class: 'btn__icon',
    });
    expect(icon(container)).toHaveClass('fa-spin', 'btn__icon');
  });

  it('refuses a name that is not a kebab token (no class injection), and warns', () => {
    for (const bad of ['spinner fa-spin', 'Church', 'a b', '<img>', '', '-x', 'x--y']) {
      const { container } = render(Icon, { set: 'fas', name: bad });
      expect(icon(container), JSON.stringify(bad)).toBeNull();
      expect(container.querySelector('.fa-spin')).toBeNull();
    }
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not inject the sprite for Font Awesome icons', () => {
    // Runs before every sprite test in this file, so the holder must not exist yet.
    render(Icon, { set: 'fas', name: 'church' });
    render(Icon, { set: 'fab', name: 'youtube', label: 'YouTube' });
    expect(holders()).toHaveLength(0);
  });
});

describe('Icon — sprite', () => {
  it('renders <svg><use href="#id"> with an xlink fallback', () => {
    const { container } = render(Icon, { set: 'sprite', name: 'logo-church' });
    const el = icon(container);
    expect(el?.tagName.toLowerCase()).toBe('svg');
    expect(el).toHaveClass('icon', 'icon--sprite');
    expect(el).toHaveAttribute('focusable', 'false');
    const use = el?.querySelector('use');
    expect(use?.getAttribute('href')).toBe('#logo-church');
    expect(use?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#logo-church');
  });

  it('injects the sprite into document.body exactly once, with every symbol', () => {
    render(Icon, { set: 'sprite', name: 'icon-calendar' });
    render(Icon, { set: 'sprite', name: 'icon-clock' });
    render(Icon, { set: 'sprite', name: 'logo-church' });
    expect(holders()).toHaveLength(1);
    const holder = holders()[0];
    expect(holder).toHaveAttribute('aria-hidden', 'true');
    expect(holder.parentElement).toBe(document.body);
    for (const id of SPRITE_ICONS) {
      expect(holder.querySelector(`symbol#${id}`), id).not.toBeNull();
    }
  });

  it('toggles aria-label vs aria-hidden exactly like the Font Awesome branch', () => {
    const plain = render(Icon, { set: 'sprite', name: 'icon-location' });
    expect(icon(plain.container)).toHaveAttribute('aria-hidden', 'true');
    expect(icon(plain.container)).not.toHaveAttribute('role');

    const named = render(Icon, { set: 'sprite', name: 'icon-location', label: 'Ubicación' });
    const el = icon(named.container);
    expect(el).toHaveAttribute('role', 'img');
    expect(el).toHaveAttribute('aria-label', 'Ubicación');
    expect(el).not.toHaveAttribute('aria-hidden');
  });

  it('`spin` uses the component keyframe class, not fa-spin', () => {
    const { container } = render(Icon, { set: 'sprite', name: 'icon-clock', spin: true });
    expect(icon(container)).toHaveClass('icon--spin');
    expect(icon(container)).not.toHaveClass('fa-spin');
  });

  it('refuses any id outside SPRITE_ICONS (an untrusted string never reaches the sprite)', () => {
    for (const bad of ['Image', 'g14', 'path24', 'star1', 'church', '#logo-church', '']) {
      const { container } = render(Icon, { set: 'sprite', name: bad });
      expect(icon(container), JSON.stringify(bad)).toBeNull();
      expect(container.querySelector('use'), JSON.stringify(bad)).toBeNull();
    }
    expect(console.warn).toHaveBeenCalled();
  });
});
