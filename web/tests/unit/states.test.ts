// PR-C2 — the state-system contract's pure helpers: skeleton bounds, the error
// copy fallback, and the promise check that drives Reintentar's progress.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLUMNS,
  DEFAULT_ROWS,
  MAX_COLUMNS,
  MAX_ROWS,
  STATE_ERROR_FALLBACK,
  errorCopy,
  isThenable,
  skeletonColumns,
  skeletonRows,
} from '#lib/components/states.js';

describe('the state-system bounds and copy', () => {
  it('skeletonRows: the shape default, else rounded into 1…MAX_ROWS', () => {
    expect(skeletonRows('table')).toBe(DEFAULT_ROWS.table);
    expect(skeletonRows('card-grid', 6)).toBe(6);
    expect(skeletonRows('list', 0)).toBe(1);
    expect(skeletonRows('list', -3)).toBe(1);
    expect(skeletonRows('list', 1e6)).toBe(MAX_ROWS);
    expect(skeletonRows('detail', 3.4)).toBe(3);
    expect(skeletonRows('detail', Number.POSITIVE_INFINITY)).toBe(DEFAULT_ROWS.detail);
  });

  it('skeletonColumns: DEFAULT_COLUMNS, else rounded into 1…MAX_COLUMNS', () => {
    expect(skeletonColumns()).toBe(DEFAULT_COLUMNS);
    expect(skeletonColumns(3)).toBe(3);
    expect(skeletonColumns(40)).toBe(MAX_COLUMNS);
    expect(skeletonColumns(0)).toBe(1);
  });

  it('errorCopy: the trimmed message, or the fallback when there is none', () => {
    expect(errorCopy('  Algo salió mal.  ')).toBe('Algo salió mal.');
    for (const blank of ['', '  ', null, undefined]) {
      expect(errorCopy(blank)).toBe(STATE_ERROR_FALLBACK);
    }
  });

  it('the fallback says what happened and what to do, in Spanish', () => {
    expect(STATE_ERROR_FALLBACK).toMatch(/^No pudimos .+\. Inténtalo de nuevo\.$/);
  });

  it('isThenable recognises promises and promise-likes only', () => {
    expect(isThenable(Promise.resolve())).toBe(true);
    expect(isThenable({ then: () => undefined })).toBe(true);
    for (const value of [undefined, null, 1, 'x', {}, () => undefined, { then: 1 }]) {
      expect(isThenable(value)).toBe(false);
    }
  });
});
