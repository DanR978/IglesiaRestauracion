// PR-C2 — the Avatar contract's URL gate: which photo URLs an <img> may load.
// The legacy painted a stored string into a style attribute; the port refuses
// anything but image-safe schemes before it reaches the element.
import { describe, expect, it } from 'vitest';
import { avatarSrc } from '#lib/components/avatar.js';

describe('avatarSrc — which photo URLs an avatar may load', () => {
  it('accepts http(s), root-relative, blob: and data:image/*', () => {
    for (const ok of [
      'https://snq.supabase.co/storage/v1/object/public/avatars/u/a.jpg',
      'http://127.0.0.1:54321/storage/v1/object/public/avatars/u/a.jpg',
      '/kit/avatar/foto.jpg',
      'blob:http://localhost:5173/6f1c',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/jpeg;base64,/9j/4AAQ',
      'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
    ]) {
      expect(avatarSrc(ok), ok).toBe(ok);
    }
    expect(avatarSrc('  https://a.example/b.png  ')).toBe('https://a.example/b.png');
  });

  it('refuses script, other data types, protocol-relative and bare values', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'vbscript:x',
      'data:text/html,<script>alert(1)</script>',
      'data:image/x-icon;base64,AA',
      '//evil.example/a.png',
      'avatar.png',
      'ftp://x/a.png',
      '',
      '   ',
      null,
      undefined,
      42,
    ]) {
      expect(avatarSrc(bad), String(bad)).toBeNull();
    }
  });
});
