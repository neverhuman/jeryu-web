import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PullRequestCommits } from '../PullRequestCommits';
import type { PullCommit } from '../pullCommitsModel';

const commits: PullCommit[] = [
  {
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    html_url: '/repos/jeryu/jeryu/jeryu-deploy/commit/aaaaaaa',
    commit: {
      message:
        'Add the commits endpoint\n\nA reviewer could not see what landed.\n\nTodo: 20260925-160159-76f16d\nShift: dayshift/2026-09-28\n',
      author: { name: 'Shift Worker', date: '2026-09-27T09:00:00Z' },
    },
  },
  {
    sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    html_url: '/repos/jeryu/jeryu/jeryu-deploy/commit/bbbbbbb',
    commit: {
      message: 'Show them on the PR page',
      author: { name: 'Shift Worker', date: '2026-09-28T09:00:00Z' },
    },
  },
];

describe('PullRequestCommits', () => {
  it('lists every commit with its short sha and the count in the heading', () => {
    render(<PullRequestCommits commits={commits} isPending={false} />);
    expect(screen.getByTestId('pr-commits-count').textContent).toBe('2');
    const rows = screen.getAllByTestId('pr-commit');
    expect(rows).toHaveLength(2);
    // Oldest first, as the server sends them, in two day groups.
    expect(within(rows[0] as HTMLElement).getByText('aaaaaaa')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('Show them on the PR page')).toBeTruthy();
    expect(
      (within(rows[0] as HTMLElement).getByRole('link') as HTMLAnchorElement).getAttribute(
        'href'
      )
    ).toBe('/repos/jeryu/jeryu/jeryu-deploy/commit/aaaaaaa');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  });

  it('expands the full message with its trailers as key/value pairs', async () => {
    render(<PullRequestCommits commits={commits} isPending={false} />);
    expect(screen.queryByTestId('pr-commit-trailers')).toBeNull();

    const toggle = screen.getByRole('button', { name: /Add the commits endpoint/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('A reviewer could not see what landed.')).toBeTruthy();
    const trailers = screen.getByTestId('pr-commit-trailers');
    expect(within(trailers).getByText('Todo')).toBeTruthy();
    expect(within(trailers).getByText('20260925-160159-76f16d')).toBeTruthy();
    expect(within(trailers).getByText('Shift')).toBeTruthy();

    // A subject-only commit offers no toggle at all.
    expect(
      screen.queryByRole('button', { name: /Show them on the PR page/ })
    ).toBeNull();
  });

  it('shows a loading state, an empty state and an error state', () => {
    const loading = render(
      <PullRequestCommits commits={undefined} isPending={true} />
    );
    expect(screen.queryByTestId('pr-commits-count')).toBeNull();
    loading.unmount();

    const empty = render(<PullRequestCommits commits={[]} isPending={false} />);
    expect(screen.getByTestId('pr-commits-empty')).toBeTruthy();
    expect(screen.getByTestId('pr-commits-count').textContent).toBe('0');
    empty.unmount();

    render(
      <PullRequestCommits
        commits={undefined}
        isPending={false}
        error={new Error('forge unreachable')}
      />
    );
    expect(screen.getByText(/Could not load commits/)).toBeTruthy();
  });
});
