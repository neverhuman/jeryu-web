// The one number formatter.

import { describe, expect, it } from 'vitest';

import { COUNT_BADGE_CAP, formatBadgeCount, formatCount } from '../number';

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

describe('formatBadgeCount', () => {
  it('says the count itself up to the cap', () => {
    expect(formatBadgeCount(0)).toBe('0');
    expect(formatBadgeCount(1)).toBe('1');
    expect(formatBadgeCount(COUNT_BADGE_CAP)).toBe('99');
  });

  it('says "more than the cap" past it, wherever the number is shown', () => {
    expect(formatBadgeCount(100)).toBe('99+');
    expect(formatBadgeCount(1_000)).toBe('99+');
  });

  it('takes another cap for a place with less room', () => {
    expect(formatBadgeCount(10, 9)).toBe('9+');
    expect(formatBadgeCount(9, 9)).toBe('9');
  });

  it('reads as an em dash when there is no number', () => {
    expect(formatBadgeCount(null)).toBe('—');
    expect(formatBadgeCount(Number.NaN)).toBe('—');
  });
});
