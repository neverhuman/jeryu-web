// jest-dom.d.ts — jest-dom's matchers on vitest's `expect`, at type level.
//
// The runtime half lives in `setup.ts`. Both halves are declared inside
// apps/web because npm hoists @testing-library/jest-dom to the workspace
// root, where its own `declare module 'vitest'` has no vitest to augment.

import 'vitest';

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<any, any> {}
}
