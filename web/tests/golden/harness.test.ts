// Proves the golden-master harness itself works end-to-end (fixture JSON →
// itGolden → assertions). Real fixtures arrive with S07/S08.
import { describe } from 'vitest';
import { itGolden, type GoldenVector } from '$lib/test/golden';
import vectors from '../fixtures/harness-sum.json';

describe('golden harness self-test', () => {
  itGolden('sum', vectors as GoldenVector<[number, number], number>[], ([a, b]) => a + b);
});
