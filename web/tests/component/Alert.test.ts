// PR-C2 — Alert.svelte under jsdom: error is role="alert", success/info/warn
// role="status"; glyph + text with a spoken tone prefix; the message is text,
// never markup; title and actions are optional; the dismiss control is an
// IconButton named "Cerrar aviso", outside the live region, and the parent
// decides what dismiss does.
import { fireEvent, render, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import Alert from '#lib/components/Alert.svelte';
import {
  ALERT_BLOCK,
  ALERT_DISMISS_LABEL,
  ALERT_ICONS,
  ALERT_ROLES,
  ALERT_TONES,
  ALERT_TONE_LABELS,
} from '#lib/components/alert.js';

const root = (container: HTMLElement) => container.querySelector<HTMLElement>(`.${ALERT_BLOCK}`);

function styleBlock(): string {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/components/Alert.svelte'), 'utf8');
  const block = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  return block.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Alert — tones and live-region roles', () => {
  it('error interrupts (role="alert"); success, info and warn are polite (role="status")', () => {
    expect(ALERT_ROLES).toEqual({
      error: 'alert',
      success: 'status',
      info: 'status',
      warn: 'status',
    });
    for (const tone of ALERT_TONES) {
      const { container } = render(Alert, { tone, message: `Mensaje ${tone}` });
      const region = within(container).getByRole(ALERT_ROLES[tone]);
      expect(region, tone).toHaveTextContent(`Mensaje ${tone}`);
      expect(root(container)).toHaveClass(ALERT_BLOCK, `${ALERT_BLOCK}--${tone}`);
    }
  });

  it('defaults to info', () => {
    const { container, getByRole } = render(Alert, { message: 'Hola' });
    expect(root(container)).toHaveClass(`${ALERT_BLOCK}--info`);
    expect(getByRole('status')).toHaveTextContent('Hola');
  });

  it('pairs each tone with its own glyph (decorative) and a spoken prefix', () => {
    for (const tone of ALERT_TONES) {
      const { container } = render(Alert, { tone, message: 'Texto' });
      const glyph = container.querySelector('.ird-alert__icon .icon');
      expect(glyph, tone).toHaveClass(`fa-${ALERT_ICONS[tone]}`);
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      const prefix = container.querySelector('.ird-alert__message .sr-only');
      expect(prefix).toHaveTextContent(`${ALERT_TONE_LABELS[tone]}:`);
      expect(within(container).getByRole(ALERT_ROLES[tone])).toHaveTextContent(
        `${ALERT_TONE_LABELS[tone]}: Texto`,
      );
    }
    expect(new Set(Object.values(ALERT_ICONS)).size).toBe(ALERT_TONES.length);
  });
});

describe('Alert — content', () => {
  it('renders the message as text, never markup (D-005)', () => {
    const { container } = render(Alert, {
      tone: 'error',
      message: '<img src=x onerror="alert(1)"> fallo',
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ird-alert__message')).toHaveTextContent(
      '<img src=x onerror="alert(1)"> fallo',
    );
  });

  it('an optional title leads, and carries the spoken prefix instead', () => {
    const { container, getByRole } = render(Alert, {
      tone: 'warn',
      title: 'Navegador integrado',
      message: 'Abre esta página en Safari o Chrome.',
    });
    expect(container.querySelector('.ird-alert__title')).toHaveTextContent(
      'Advertencia: Navegador integrado',
    );
    expect(container.querySelector('.ird-alert__message .sr-only')).toBeNull();
    expect(getByRole('status')).toHaveTextContent(
      /^Advertencia: Navegador integrado\s*Abre esta página en Safari o Chrome\.$/,
    );
  });

  it('renders an actions snippet OUTSIDE the live region', () => {
    const actions = createRawSnippet(() => ({
      render: () => '<a href="/app/admin/cuenta/">Ir a Seguridad</a>',
    }));
    const { container, getByRole } = render(Alert, {
      tone: 'info',
      message: 'Agrega un segundo dispositivo.',
      actions,
    });
    const link = container.querySelector('.ird-alert__actions a');
    expect(link).toHaveTextContent('Ir a Seguridad');
    expect(getByRole('status').contains(link)).toBe(false);
  });

  it('has no dismiss control unless onDismiss is given', () => {
    const { queryByRole } = render(Alert, { message: 'Hola' });
    expect(queryByRole('button')).toBeNull();
  });
});

describe('Alert — dismiss', () => {
  it('renders an IconButton named "Cerrar aviso" that calls onDismiss', async () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(Alert, { tone: 'success', message: 'Guardado', onDismiss });
    const close = getByRole('button', { name: ALERT_DISMISS_LABEL });
    expect(close).toHaveClass('ird-icon-btn', 'ird-alert__dismiss');
    expect(close).not.toHaveAttribute('title');
    await fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the dismiss control out of the announcement', () => {
    const { getByRole } = render(Alert, { tone: 'error', message: 'Falló', onDismiss: vi.fn() });
    const region = getByRole('alert');
    expect(region).not.toHaveTextContent(ALERT_DISMISS_LABEL);
    expect(region.querySelector('button')).toBeNull();
  });

  it('is keyboard reachable', () => {
    const { getByRole } = render(Alert, { message: 'Hola', onDismiss: vi.fn() });
    const close = getByRole('button', { name: ALERT_DISMISS_LABEL });
    close.focus();
    expect(document.activeElement).toBe(close);
  });
});

describe('Alert — styles honour the design-system rules', () => {
  const css = styleBlock();

  it('is token-only: no hex literal, no px/rem font-size, no colour-scheme query', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(css).not.toContain('prefers-color-scheme');
  });

  it('reads the --status-* pairs and keeps the words in the reversing ink', () => {
    for (const [tone, status] of [
      ['error', 'overdue'],
      ['success', 'active'],
      ['info', 'open'],
      ['warn', 'pending'],
    ]) {
      expect(css, tone).toMatch(
        new RegExp(
          `\\.ird-alert--${tone}\\s*\\{[^}]*--alert-ink:\\s*var\\(--status-${status}\\)[^}]*--alert-tint:\\s*var\\(--status-${status}-bg\\)`,
        ),
      );
    }
    expect(css).toMatch(/\.ird-alert\s*\{[^}]*color:\s*var\(--color-text\)/);
  });
});
