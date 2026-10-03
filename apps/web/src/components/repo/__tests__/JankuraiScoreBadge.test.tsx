// JankuraiScoreBadge.test.tsx — threshold + null-state coverage.
//
// The pill has four shapes: good (score >= 85, muted), warn (score < 85),
// danger "audit failed" (no score but a decision), and warn "--"
// (no audit ingested, labelled "no score"). Relative-time output depends on the wall clock,
// so assertions match on the stable "scored" prefix instead of exact text.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JankuraiScoreBadge } from '../JankuraiScoreBadge';

describe('JankuraiScoreBadge', () => {
  it('renders a passing pill at the 85 threshold', () => {
    render(<JankuraiScoreBadge score={85} scoredAt="2026-06-09T08:30:00Z" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('85');
    expect(badge).toHaveClass('repo-score-badge--ok');
  });

  it('renders a passing pill above the threshold', () => {
    render(<JankuraiScoreBadge score={92} decision="pass" />);
    expect(screen.getByRole('status')).toHaveClass('repo-score-badge--ok');
  });

  it('renders a failing pill below the threshold', () => {
    render(<JankuraiScoreBadge score={84} decision="fail" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('84');
    expect(badge).toHaveClass('repo-score-badge--failed');
  });

  it('renders "audit failed" when the tool could not score the tree', () => {
    render(
      <JankuraiScoreBadge
        score={null}
        decision="tool-failed"
        scoredAt="2026-06-09T08:30:00Z"
      />
    );
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('audit failed');
    expect(badge).toHaveClass('repo-score-badge--failed');
    expect(badge.getAttribute('aria-label')).toContain('tool-failed');
  });

  it('renders "--" as nothing known when no audit exists', () => {
    render(<JankuraiScoreBadge />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('--');
    expect(badge).not.toHaveTextContent('no score');
    // No audit is not a failure, so the pill stays neutral.
    expect(badge).toHaveClass('repo-score-badge--unknown');
  });

  it('keeps "no score" in the title and aria-label of an unscored pill', () => {
    render(<JankuraiScoreBadge />);
    const badge = screen.getByRole('status');
    const label = badge.getAttribute('aria-label') ?? '';
    expect(label).toContain('no score');
    expect(badge.getAttribute('title')).toBe(label);
  });

  it('carries the score and scored-at time in title and aria-label', () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    render(<JankuraiScoreBadge score={91} scoredAt={recent} />);
    const badge = screen.getByRole('status');
    const label = badge.getAttribute('aria-label') ?? '';
    expect(label).toContain('91');
    expect(label).toContain('scored');
    // The relative timestamp is appended after "scored ".
    expect(label).toMatch(/scored .+/);
    expect(badge.getAttribute('title')).toBe(label);
  });

  it('omits the scored-at suffix when no timestamp is available', () => {
    render(<JankuraiScoreBadge score={91} />);
    const label = screen
      .getByRole('status')
      .getAttribute('aria-label');
    expect(label).toBe('jankurai score 91');
  });
});
