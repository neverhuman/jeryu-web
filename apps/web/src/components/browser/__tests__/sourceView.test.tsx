import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SourceView } from '../SourceView';
import {
  SOURCE_LINE_CAP,
  hashForLine,
  lineElementId,
  lineFromHash,
  splitSourceLines,
} from '../sourceViewModel';

describe('sourceViewModel', () => {
  it('splits on any newline style and ignores one trailing newline', () => {
    expect(splitSourceLines('a\r\nb\rc\n')).toEqual({
      lines: ['a', 'b', 'c'],
      total: 3,
      truncated: false,
    });
    expect(splitSourceLines('a\n\n').lines).toEqual(['a', '']);
    expect(splitSourceLines('')).toEqual({ lines: [], total: 0, truncated: false });
  });

  it('stops at the cap and says how long the file is', () => {
    const text = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');
    const out = splitSourceLines(text, 5);
    expect(out.lines).toHaveLength(5);
    expect(out.total).toBe(12);
    expect(out.truncated).toBe(true);
    expect(SOURCE_LINE_CAP).toBeGreaterThanOrEqual(1000);
  });

  it('reads and writes line fragments', () => {
    expect(lineFromHash('#L12')).toBe(12);
    expect(lineFromHash('L3')).toBe(3);
    expect(lineFromHash('#L0')).toBeNull();
    expect(lineFromHash('#readme')).toBeNull();
    expect(lineFromHash('')).toBeNull();
    expect(hashForLine(7)).toBe('#L7');
    expect(lineElementId(7)).toBe('L7');
  });
});

describe('SourceView', () => {
  it('renders numbered lines at once, links each number, and marks the line in the fragment', () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(
      <MemoryRouter initialEntries={['/repos/jeryu/jeryu/jeryu/blob/main/LICENSE#L2']}>
        <SourceView text={'first\nsecond\nthird\n'} fontSize={13} label="LICENSE" />
      </MemoryRouter>
    );
    expect(screen.getByRole('table', { name: 'Source of LICENSE' })).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Line 3' })).toHaveAttribute('href', '#L3');
    expect(document.getElementById('L2')).toHaveClass('is-marked');
    expect(document.getElementById('L1')).not.toHaveClass('is-marked');
    expect(scrolled).toHaveBeenCalled();
  });

  it('says so when the file is empty', () => {
    render(
      <MemoryRouter>
        <SourceView text="" fontSize={13} label="empty.txt" />
      </MemoryRouter>
    );
    expect(screen.getByText('This file is empty.')).toBeInTheDocument();
  });
});
