// Vitest stand-in for $app/paths (Kit 3): the app at the domain root (base
// ''). Tests that need another base mock it with pathsAt() from
// tests/helpers/app-paths.ts.
import { pathsAt } from '../helpers/app-paths';

export const { base, assets, resolve, asset, match } = pathsAt('');
