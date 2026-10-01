import { execFileSync } from 'node:child_process';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { reproducibleFileNames, sourcemapSourcePath } from './src/build/reproducibleOutput';
import { resolveWebCommit } from './src/build/webCommit';

const projectRoot = decodeURIComponent(new URL('.', import.meta.url).pathname);

// The commit the page reports as its own build (see src/build/webCommit.ts).
const webCommit = resolveWebCommit(process.env.JERYU_WEB_COMMIT, () =>
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
);

export default defineConfig({
  plugins: [react()],
  define: {
    __JERYU_WEB_COMMIT__: JSON.stringify(webCommit),
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    terserOptions: { compress: { passes: 3 } },
    // Manual chunking keeps the main entry under Vite's 500 KB
    // warning threshold by splitting the large vendor surfaces
    // (terminal, markdown pipeline, TanStack data layer) into
    // their own lazily-evaluated chunks.
    // jeryu-deploy pins this build by commit and a hash of the whole dist, so
    // the output must not depend on where the checkout lives.
    rollupOptions: {
      output: {
        ...reproducibleFileNames,
        sourcemapPathTransform: (source) => sourcemapSourcePath(source, projectRoot),
        // Vite 8 / Rollup accept only the function form of manualChunks.
        // Keep the same vendor groups as the previous object form.
        manualChunks(id) {
          if (id.includes('@xterm/')) {
            return 'xterm-vendor';
          }
          if (
            id.includes('react-markdown') ||
            id.includes('remark-gfm') ||
            id.includes('rehype-') ||
            id.includes('/dompurify/')
          ) {
            return 'markdown-vendor';
          }
          if (id.includes('@tanstack/')) {
            return 'tanstack-vendor';
          }
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('react-router-dom')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
