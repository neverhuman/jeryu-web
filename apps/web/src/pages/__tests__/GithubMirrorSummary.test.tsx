import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GithubMirrorSummary } from '../GithubMirrorSummary';
import { MIRROR_OPERATOR_SENTENCE } from '../repoStatusModel';

describe('GithubMirrorSummary', () => {
  it('says in one quiet sentence that a repository is not mirrored', () => {
    render(<GithubMirrorSummary mirror={null} />);
    expect(
      screen.getByText('This repository is not mirrored to GitHub.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Last attempt/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the last attempt, that it never succeeded, and what an operator must do', () => {
    render(
      <GithubMirrorSummary
        mirror={{
          configured: true,
          last_attempt_at: '2026-09-19T17:35:49Z',
          last_attempt_ok: false,
          last_attempt_conclusion: 'failure',
          last_success_at: null
        }}
      />
    );
    expect(screen.getByText(/the last push failed/)).toBeInTheDocument();
    expect(screen.getByText(/Last attempt:/)).toHaveTextContent('failure');
    expect(screen.getByText(/Last success:/)).toHaveTextContent('never');
    expect(screen.getByText(MIRROR_OPERATOR_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is calm when the mirror works', () => {
    render(
      <GithubMirrorSummary
        mirror={{
          configured: true,
          last_attempt_at: '2026-09-19T17:35:49Z',
          last_attempt_ok: true,
          last_attempt_conclusion: 'success',
          last_success_at: '2026-09-19T17:35:49Z'
        }}
      />
    );
    expect(
      screen.getByText('Merges to the default branch are pushed to GitHub.')
    ).toBeInTheDocument();
    expect(screen.getByText(/Last attempt:/)).toHaveTextContent('success');
    expect(screen.queryByText(MIRROR_OPERATOR_SENTENCE)).toBeNull();
  });
});
