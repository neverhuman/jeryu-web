import { describe, expect, it } from 'vitest';

import {
  DEFAULT_E2E_WORKERS,
  MAX_E2E_WORKERS,
  resolveE2eWorkers,
} from './e2e-workers.mjs';

describe('resolveE2eWorkers', () => {
  it('falls back to the default when nothing is set', () => {
    expect(resolveE2eWorkers({})).toBe(DEFAULT_E2E_WORKERS);
    expect(resolveE2eWorkers()).toBe(DEFAULT_E2E_WORKERS);
  });

  it('scales the governed CI job count down to browser workers', () => {
    expect(resolveE2eWorkers({ JERYU_CI_JOBS: '8' })).toBe(6);
    expect(resolveE2eWorkers({ JERYU_CI_JOBS: '4' })).toBe(3);
  });

  it('keeps one worker on a single-job host', () => {
    expect(resolveE2eWorkers({ JERYU_CI_JOBS: '1' })).toBe(1);
  });

  it('caps the governed job count at the browser ceiling', () => {
    expect(resolveE2eWorkers({ JERYU_CI_JOBS: '64' })).toBe(MAX_E2E_WORKERS);
  });

  it('lets an explicit worker count win over the governed one, uncapped', () => {
    expect(
      resolveE2eWorkers({ JERYU_PLAYWRIGHT_WORKERS: '2', JERYU_CI_JOBS: '8' })
    ).toBe(2);
    expect(
      resolveE2eWorkers({ JERYU_PLAYWRIGHT_WORKERS: '24', JERYU_CI_JOBS: '4' })
    ).toBe(24);
  });

  it('ignores values that are not a worker count', () => {
    for (const raw of ['', '  ', '0', '-3', 'many', '2.5']) {
      expect(resolveE2eWorkers({ JERYU_CI_JOBS: raw })).toBe(DEFAULT_E2E_WORKERS);
    }
  });
});
