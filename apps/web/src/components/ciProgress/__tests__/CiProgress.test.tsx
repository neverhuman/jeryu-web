import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CiProgress } from '../CiProgress';

const startedAt = '2026-10-06T12:00:00Z';
const now = (seconds: number): number => Date.parse(startedAt) + seconds * 1000;

describe('CiProgress', () => {
  it('fills toward the usual time and says what is left', () => {
    render(
      <CiProgress
        startedAt={startedAt}
        estimate={{ typicalSeconds: 600, slowSeconds: 900, samples: 5 }}
        nowMs={now(300)}
        testId="progress"
      />
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuetext')).toBe(
      'about 5m left, 5m so far · usually 10m'
    );
    expect(screen.getByTestId('progress').getAttribute('data-phase')).toBe('on-track');
    expect(screen.getByText('about 5m left')).toBeTruthy();
  });

  it('is an indeterminate bar with elapsed time when there is no estimate', () => {
    render(<CiProgress startedAt={startedAt} nowMs={now(75)} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(screen.getByText('1m 15s so far')).toBeTruthy();
  });

  it('keeps only the headline in the compact form, the rest in its tooltip', () => {
    render(
      <CiProgress
        startedAt={startedAt}
        estimate={{ typicalSeconds: 600, slowSeconds: 900, samples: 5 }}
        nowMs={now(700)}
        variant="compact"
        testId="progress"
      />
    );
    const root = screen.getByTestId('progress');
    expect(root.getAttribute('data-phase')).toBe('over');
    expect(root.getAttribute('title')).toBe(
      'Gate running: 2m longer than usual, 11m 40s so far · usually 10m'
    );
    expect(screen.queryByText(/so far/)).toBeNull();
  });

  it('renders nothing for a start it cannot read', () => {
    const { container } = render(<CiProgress startedAt="soon" nowMs={0} />);
    expect(container.childElementCount).toBe(0);
  });
});
