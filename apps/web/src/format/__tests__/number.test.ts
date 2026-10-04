// The one number formatter.

import { describe, expect, it } from 'vitest';

import { formatCount } from '../number';

describe('formatCount', () => {
  it('groups thousands the same way everywhere', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(12_480)).toBe('12,480');
    expect(formatCount(1_234_567)).toBe('1,234,567');
    expect(formatCount(12.6)).toBe('13');
  });

  it('reads as an em dash when there is no number', () => {
    expect(formatCount(null)).toBe('—');
    expect(formatCount(undefined)).toBe('—');
    expect(formatCount(Number.NaN)).toBe('—');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
