// freshnessStamp.test.tsx — the stamp moves when the data under it does.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageFreshnessStamp } from '..';

describe('PageFreshnessStamp', () => {
  it('shows the newer instant after a refetch landed', () => {
    const first = Date.parse('2026-10-04T12:00:00Z');
    const { rerender } = render(<PageFreshnessStamp updatedAt={first} />);
    expect(
      screen.getByTestId('page-freshness').getAttribute('data-updated-at')
    ).toBe('2026-10-04T12:00:00Z');
    rerender(<PageFreshnessStamp updatedAt={first + 60_000} />);
    expect(
      screen.getByTestId('page-freshness').getAttribute('data-updated-at')
    ).toBe('2026-10-04T12:01:00Z');
  });
});
