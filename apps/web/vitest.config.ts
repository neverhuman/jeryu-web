import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // A fixed, non-UTC zone: the UI shows instants in the reader's zone, so the
    // suite only proves that if the suite's own zone is not UTC.
    env: { TZ: 'America/New_York' },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e/**', 'playwright-report/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Harness, generated wire types and entry points carry no assertions of
      // their own; counting them would blur what the suite actually reaches.
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.stories.{ts,tsx}',
        'src/test/**',
        'src/api/types.ts',
        'src/global.d.ts',
        'src/main.tsx',
      ],
      // Baseline measured on 2026-09-29 over 760 cases in 111 files:
      // 77.79% lines, 76.70% statements, 70.89% branches, 74.27% functions.
      // The floor sits just under each so ordinary churn does not trip it.
      // Raise it as the suite reaches further; never lower it to pass a change.
      thresholds: {
        lines: 77,
        statements: 76,
        branches: 70,
        functions: 74,
      },
    },
  },
});
