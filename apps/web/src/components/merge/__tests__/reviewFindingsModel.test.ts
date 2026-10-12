// reviewFindingsModel.test.ts — which review tables get the findings layout.

import { describe, expect, it } from 'vitest';

import { findingsLayout } from '../reviewFindingsModel';

describe('findingsLayout', () => {
  it('folds Where into Finding and keeps the other columns in order', () => {
    expect(findingsLayout(['', 'Finding', 'Where'])).toEqual({ finding: 1, where: 2, columns: [0, 1] });
    expect(findingsLayout(['Where', ' Findings ', 'Severity'])).toEqual({ finding: 1, where: 0, columns: [1, 2] });
  });

  it('leaves a table without both columns alone', () => {
    expect(findingsLayout(['Severity', 'Finding'])).toBeNull();
    expect(findingsLayout(['Where', 'What'])).toBeNull();
    expect(findingsLayout([])).toBeNull();
  });
});
