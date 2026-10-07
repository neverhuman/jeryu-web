// ReviewList.test.tsx — the reviews of a pull request, with their bodies, and
// the link that lands on the review asking for changes.

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PullRequestReview } from '../../../api/types';
import { approvalRow } from '../../../test/fixtures/pullRequest';
import { ReviewList } from '../ReviewList';

const PULL = '/repos/acme/acme/widget-api/pulls/32';

const REVIEWS: PullRequestReview[] = [
  approvalRow({ id: 'r1', author: 'dana', body_markdown: 'Looks right to me.' }),
  approvalRow({
    id: 'r2',
    author: 'globex-bot',
    state: 'CHANGES_REQUESTED',
    submitted_at: '2026-05-27T00:00:00Z',
    body_markdown:
      '## Findings\n\n| Severity | Finding |\n| --- | --- |\n| high | The retry loop never stops |\n',
  }),
];

function show(at: string, reviews: PullRequestReview[] = REVIEWS): void {
  render(
    <MemoryRouter initialEntries={[at]}>
      <ReviewList reviews={reviews} />
    </MemoryRouter>
  );
}

function opened(id: string): boolean {
  const details = screen.getByTestId(`pr-review-${id}`).querySelector('details');
  return details?.open ?? false;
}

describe('ReviewList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lands a #changes-requested link on that review, open, with its Markdown rendered', () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scroll,
      configurable: true,
      writable: true,
    });
    show(`${PULL}#changes-requested`);

    const asking = screen.getByTestId('pr-review-r2');
    expect(asking).toHaveAttribute('id', 'review-r2');
    expect(asking).toHaveAttribute('data-target', 'true');
    expect(opened('r2')).toBe(true);
    expect(opened('r1')).toBe(false);
    expect(within(asking).getByText('Changes requested')).toBeInTheDocument();
    expect(within(asking).getByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(within(asking).getByRole('table')).toHaveTextContent('The retry loop never stops');
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(asking);
  });

  it('opens the one review a #review-<id> link names', () => {
    show(`${PULL}#review-r1`);
    expect(opened('r1')).toBe(true);
    expect(opened('r2')).toBe(false);
    expect(screen.getByTestId('pr-review-r1')).toHaveTextContent('Looks right to me.');
  });

  it('opens the review asking for changes even with no hash, newest first', () => {
    show(PULL);
    expect(opened('r2')).toBe(true);
    const items = within(screen.getByTestId('pr-reviews')).getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('id', 'review-r2');
  });

  it('shows nothing when the pull request has no review', () => {
    show(PULL, []);
    expect(screen.queryByTestId('pr-reviews')).toBeNull();
  });
});
