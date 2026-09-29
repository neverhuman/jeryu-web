// setup.ts — Vitest global setup (W-FE-08/09/10).
//
// Loaded automatically by Vitest via `vitest.config.ts → setupFiles`. We
// extend the `expect` matchers with @testing-library/jest-dom so tests can
// use `.toBeInTheDocument()` etc.
//
// We register the matchers here rather than importing
// `@testing-library/jest-dom/vitest`: npm hoists jest-dom to the workspace
// root while vitest stays under apps/web, so jest-dom's own entry point
// cannot resolve `vitest` from where it is installed. Both names resolve
// from this file. `jest-dom.d.ts` declares the matchers for TypeScript.

import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

expect.extend(jestDomMatchers);
