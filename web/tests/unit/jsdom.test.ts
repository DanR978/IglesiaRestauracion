// Guards G-001: the suite must run under jsdom because sanitize-html (S07)
// depends on DOMParser. If someone flips the vitest environment to 'node',
// this fails before a silent sanitize regression can.
import { describe, expect, it } from 'vitest';

describe('vitest environment', () => {
  it('provides DOMParser (jsdom, G-001)', () => {
    const doc = new DOMParser().parseFromString('<p>hola</p>', 'text/html');
    expect(doc.body.querySelector('p')?.textContent).toBe('hola');
  });
});
