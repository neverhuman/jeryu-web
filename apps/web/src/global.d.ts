// global.d.ts — ambient declarations for the SPA.
//
// React 19 removed the global `JSX` namespace; component return types must
// reference `React.JSX.Element` explicitly. We re-export the namespace into
// the global scope so existing `: JSX.Element` annotations continue to work
// without spelunking through every file.

import type { JSX as ReactJsx } from 'react';

declare global {
  /**
   * The commit this bundle was built from, defined by `vite.config.ts`; null
   * when the build knew none. Undefined where no build defines it (vitest), so
   * read it through `pageWebCommit()` in `build/webCommit.ts`.
   */
  const __JERYU_WEB_COMMIT__: string | null | undefined;

  namespace JSX {
    type Element = ReactJsx.Element;
    type ElementType = ReactJsx.ElementType;
    type ElementClass = ReactJsx.ElementClass;
    type IntrinsicElements = ReactJsx.IntrinsicElements;
  }
}

export {};
