// Storybook configuration for the JeRyu Web Forge SPA (W-T-07).
//
// Framework: `@storybook/react-vite` (Vite-driven; matches `vite.config.ts`).
// Addons: `@storybook/addon-a11y` (axe-core panel, every story is scanned),
//         `@storybook/addon-vitest` (vitest runner integration).
//
// Stories live next to their components as `*.stories.tsx`, so `glob`
// matches anywhere under `../src` to pick them up no matter how deep the
// component tree goes.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite';

// npm workspaces hoist `storybook` to the repository root but keep these
// packages in apps/web/node_modules, so a bare name resolved from the root
// `storybook` package finds nothing ("Cannot find package
// '@storybook/react-vite'"). Resolve each one from this config instead, as
// Storybook recommends for monorepos. A gate tree whose node_modules came
// from an older install hid this; a clean `npm ci` exposes it.
const require = createRequire(import.meta.url);
function absolute(name: string): string {
  return dirname(require.resolve(join(name, 'package.json')));
}

const config: StorybookConfig = {
  framework: {
    name: absolute('@storybook/react-vite') as '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [absolute('@storybook/addon-a11y'), absolute('@storybook/addon-vitest')],
  typescript: {
    check: false,
    reactDocgen: false,
  },
  docs: {
    autodocs: false,
  },
};

export default config;
