// <When> is the only way a page shows an instant.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { When } from '../When';
import { absoluteText } from '../when';

const NOW = new Date('2026-09-19T14:00:00Z');

describe('When', () => {
  it('reads relative, and carries the instant and its zone for the asking', () => {
    render(<When at="2026-09-19T13:48:00Z" now={NOW} />);
    const when = screen.getByText('12 min ago');
    expect(when.tagName).toBe('TIME');
    expect(when).toHaveAttribute('datetime', '2026-09-19T13:48:00Z');
    expect(when).toHaveAttribute('title', absoluteText('2026-09-19T13:48:00Z'));
    expect(when.getAttribute('title')).toContain('EDT');
  });

  it('normalises a +00:00 stamp into the machine form', () => {
    render(<When at="2026-09-19T13:48:00+00:00" now={NOW} />);
    expect(screen.getByText('12 min ago')).toHaveAttribute('datetime', '2026-09-19T13:48:00Z');
  });

  it('says what the instant is when a row needs telling apart', () => {
    render(<When at="2026-09-19T13:48:00Z" now={NOW} label="Last push" />);
    expect(screen.getByText('12 min ago').getAttribute('title')).toMatch(/^Last push: /);
  });

  it('falls back without a time element when there is no instant', () => {
    const { container } = render(<When at={null} fallback="never rotated" />);
    expect(screen.getByText('never rotated').tagName).toBe('SPAN');
    expect(container.querySelector('time')).toBeNull();
  });

  it('shows what arrived when it cannot be read', () => {
    render(<When at="nonsense" />);
    expect(screen.getByText('nonsense').tagName).toBe('SPAN');
  });
});
