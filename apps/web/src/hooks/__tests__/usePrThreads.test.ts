import { describe, expect, it } from 'vitest';

import { isPrThreadEvent } from '../usePrThreads';

const frame = {
  kind: 'pull.thread.updated',
  scope: 'repo.alice.jeryu',
  entity: 'pull:5:17',
};

describe('isPrThreadEvent', () => {
  it('accepts the repository-scoped frame for exactly this pull request', () => {
    expect(isPrThreadEvent(frame, '5', '17')).toBe(true);
  });

  it('ignores the same number in another repository', () => {
    expect(isPrThreadEvent(frame, '6', '17')).toBe(false);
  });

  it('does not match a prefix of another pull request number', () => {
    expect(isPrThreadEvent(frame, '5', '1')).toBe(false);
  });

  it('ignores a bare pull.<number> scope and non-thread kinds', () => {
    expect(isPrThreadEvent({ ...frame, scope: 'pull.17' }, '5', '17')).toBe(false);
    expect(isPrThreadEvent({ ...frame, kind: 'runner.changed' }, '5', '17')).toBe(false);
  });
});
