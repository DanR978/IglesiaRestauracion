// PR-C2 golden parity for #lib/initials (port of the legacy initials() in
// js/pages/lideres/index.js, ex js/utils/string.js). The fixture was generated
// by RUNNING THE LEGACY FUNCTION over the inputs (its source extracted from the
// module, which does not export it) — never regenerate it from the port (D-012).
import { describe } from 'vitest';
import { itGolden, type GoldenVector } from '#lib/test/golden.js';
import { initials } from '#lib/initials.js';
import vectorsJson from '../fixtures/initials.json';

const vectors = vectorsJson as GoldenVector<string | null, string>[];

describe('initials golden (legacy js/pages/lideres/index.js)', () => {
  itGolden('initials', vectors, (input) => initials(input));
});
