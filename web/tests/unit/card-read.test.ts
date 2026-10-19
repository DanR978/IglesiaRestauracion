// S41 — CardRead, the per-card async state of Inicio: null until the first
// answer, the newest load wins, a background refresh that fails keeps the
// last good answer (an error card takes whatever comes), and a throw — a bug,
// since repos never throw — becomes the generic error instead of a card stuck
// loading.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardRead } from '#lib/components/admin/dashboard/card-read.svelte.js';
import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
import type { ReadResult } from '#lib/repos/types.js';

const ok = <T>(data: T): ReadResult<T> => ({ ok: true, data });
const failed = (message = 'No pudimos conectar con el servidor.'): ReadResult<never> => ({
  ok: false,
  error: { kind: 'network', message },
});

function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CardRead', () => {
  it('is null and not started until asked, then holds the answer', async () => {
    const read = new CardRead('albums', async () => ok(3));
    expect(read.result).toBeNull();
    expect(read.started).toBe(false);
    const loading = read.load();
    expect(read.started).toBe(true);
    await loading;
    expect(read.result).toEqual(ok(3));
  });

  it('keeps an error as an error — never an empty success', async () => {
    const read = new CardRead('albums', async () => failed());
    await read.load();
    expect(read.result).toEqual(failed());
  });

  it('lets the newest load win over an older one still in flight', async () => {
    const first = deferred<ReadResult<number>>();
    const second = deferred<ReadResult<number>>();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const read = new CardRead<number>('albums', run);
    const a = read.load();
    const b = read.load();
    second.settle(ok(2));
    await b;
    first.settle(ok(1));
    await a;
    expect(read.result).toEqual(ok(2));
  });

  it('a failed background refresh keeps the last good answer', async () => {
    const run = vi.fn().mockResolvedValueOnce(ok(5)).mockResolvedValueOnce(failed());
    const read = new CardRead<number>('albums', run);
    await read.load();
    await read.load({ background: true });
    expect(read.result).toEqual(ok(5));
  });

  it('a background refresh replaces an error, and good news always lands', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(failed('primero'))
      .mockResolvedValueOnce(failed('segundo'))
      .mockResolvedValueOnce(ok(8));
    const read = new CardRead<number>('albums', run);
    await read.load();
    await read.load({ background: true });
    expect(read.result).toEqual(failed('segundo'));
    await read.load({ background: true });
    expect(read.result).toEqual(ok(8));
  });

  it('a foreground load (Retry) shows its failure even over good data', async () => {
    const run = vi.fn().mockResolvedValueOnce(ok(5)).mockResolvedValueOnce(failed());
    const read = new CardRead<number>('albums', run);
    await read.load();
    await read.load();
    expect(read.result).toEqual(failed());
  });

  it('turns a throw into the generic error and logs it under [inicio]', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const read = new CardRead('albums', async () => {
      throw new Error('boom');
    });
    await read.load();
    expect(read.result).toEqual({
      ok: false,
      error: { kind: 'unknown', message: REPO_ERROR_MESSAGES.unknown },
    });
    expect(log).toHaveBeenCalledWith('[inicio] albums:', expect.any(Error));
  });
});
