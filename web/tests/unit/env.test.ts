// S02b — D-007 under Kit 3. src/env.ts is the only door from the build env
// into a bundle, and its schemas are what stop a build whose Supabase secrets
// are missing or empty (Kit's default lets '' through). Exercised through the
// Standard Schema interface Kit itself calls, then #lib/config.js's required(),
// the runtime second line.
import { describe, expect, it, vi } from 'vitest';
import { variables } from '../../src/env';
import * as stub from '../stubs/app-env-public';

type Name = keyof typeof variables;

function validate(name: Name, value: string | undefined) {
  const result = variables[name].schema['~standard'].validate(value);
  if (result instanceof Promise) throw new Error('env schemas must be synchronous');
  return result;
}

const issues = (name: Name, value: string | undefined) =>
  (validate(name, value).issues ?? []).map((issue) => issue.message);

describe('src/env.ts declares the public build env (D-002/D-007)', () => {
  it('declares exactly the two Supabase values, both public and inlined at build', () => {
    expect(Object.keys(variables).sort()).toEqual([
      'PUBLIC_SUPABASE_ANON_KEY',
      'PUBLIC_SUPABASE_URL',
    ]);
    for (const config of Object.values(variables)) {
      expect(config.public).toBe(true);
      expect(config.static).toBe(true);
    }
  });

  it.each([undefined, '', '   '])('fails the build on a missing or empty value (%j)', (value) => {
    expect(issues('PUBLIC_SUPABASE_URL', value)).toEqual([
      expect.stringContaining('PUBLIC_SUPABASE_URL is empty'),
    ]);
    expect(issues('PUBLIC_SUPABASE_ANON_KEY', value)).toEqual([
      expect.stringContaining('PUBLIC_SUPABASE_ANON_KEY is empty'),
    ]);
  });

  it.each([
    'https://example-ref.supabase.co',
    'http://127.0.0.1:54321',
    'http://localhost:4173/__supabase',
    'http://[::1]:54321',
    'https://localhost:54321',
  ])('accepts the URL %s unchanged', (url) => {
    expect(validate('PUBLIC_SUPABASE_URL', url)).toEqual({ value: url });
  });

  it.each([
    ['no scheme', 'example-ref.supabase.co', 'not an absolute URL'],
    ['plain http off loopback', 'http://example-ref.supabase.co', 'must be https'],
    ['a loopback lookalike', 'http://127.0.0.1.example.com', 'must be https'],
    ['another scheme', 'ftp://127.0.0.1', 'must be https'],
    ['a script URL', 'javascript:alert(1)', 'must be https'],
  ])('rejects %s', (_case, url, message) => {
    expect(issues('PUBLIC_SUPABASE_URL', url)).toEqual([expect.stringContaining(message)]);
  });

  it('never echoes the rejected value (messages land in CI logs)', () => {
    const value = 'http://leak.example.com/should-not-print';
    expect(issues('PUBLIC_SUPABASE_URL', value).join(' ')).not.toContain('leak.example.com');
  });

  it('passes the anon key through unchanged', () => {
    expect(validate('PUBLIC_SUPABASE_ANON_KEY', 'local-test-key')).toEqual({
      value: 'local-test-key',
    });
  });

  it('the Vitest stub holds values the real schemas accept', () => {
    expect(issues('PUBLIC_SUPABASE_URL', stub.PUBLIC_SUPABASE_URL)).toEqual([]);
    expect(issues('PUBLIC_SUPABASE_ANON_KEY', stub.PUBLIC_SUPABASE_ANON_KEY)).toEqual([]);
  });
});

describe('#lib/config.js required() — the runtime second line', () => {
  it('reads the declared values', async () => {
    vi.resetModules();
    const config = await import('#lib/config.js');
    expect(config.SUPABASE_URL).toBe(stub.PUBLIC_SUPABASE_URL);
    expect(config.SUPABASE_ANON_KEY).toBe(stub.PUBLIC_SUPABASE_ANON_KEY);
  });

  it.each(['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'] as const)(
    'throws on import when %s arrives empty',
    async (name) => {
      vi.resetModules();
      vi.doMock('$app/env/public', () => ({ ...stub, [name]: '' }));
      try {
        await expect(import('#lib/config.js')).rejects.toThrow(
          `config: missing required build-time variable ${name}`,
        );
      } finally {
        vi.doUnmock('$app/env/public');
      }
    },
  );
});
