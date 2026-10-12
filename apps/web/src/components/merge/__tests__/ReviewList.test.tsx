// ReviewList.test.tsx — the reviews of a pull request, with their bodies, and
// the link that lands on the review asking for changes.

import { fireEvent, render, screen, within } from '@testing-library/react';
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

function show(
  at: string,
  reviews: PullRequestReview[] = REVIEWS,
  fileHref?: (location: { path: string; line: number | null }) => string
): void {
  render(
    <MemoryRouter initialEntries={[at]}>
      <ReviewList reviews={reviews} fileHref={fileHref} />
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

  it('lays out a findings table: Where on top of each finding, three lines until "more"', () => {
    const tall = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.textContent?.includes('never stops') ? 200 : 40;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
    show(PULL, [
      approvalRow({
        id: 'r3',
        author: 'pragent',
        state: 'CHANGES_REQUESTED',
        body_markdown:
          '| | Finding | Where |\n|---|---|---|\n' +
          '| 🟠 high | **Loop** — the retry loop never stops | `ops/retry.sh:12` |\n' +
          '| ⚪ low | **Name** — short | `ops/name.sh:3` |\n',
      }),
    ]);

    const table = within(screen.getByTestId('pr-review-r3')).getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['', 'Finding']);
    const [high, low] = within(table).getAllByRole('row').slice(1);
    const highCells = within(high).getAllByRole('cell');
    expect(highCells[0]).toHaveTextContent('🟠 high');
    expect(highCells[0]).toHaveClass('review-findings__aside');
    expect(highCells[1].firstElementChild).toHaveTextContent('ops/retry.sh:12');

    const text = within(high).getByTestId('review-finding-text');
    expect(text).toHaveClass('review-findings__text--clamped');
    fireEvent.click(within(high).getByRole('button', { name: 'more' }));
    expect(text).not.toHaveClass('review-findings__text--clamped');
    expect(within(high).getByRole('button', { name: 'less' })).toHaveAttribute('aria-expanded', 'true');

    expect(within(low).queryByRole('button')).toBeNull();
    expect(tall).toHaveBeenCalled();
  });

  it('keeps a finding whole when its code span holds an over-escaped pipe, and links its Where', () => {
    const fileHref = (location: { path: string; line: number | null }): string =>
      `${PULL}/files?path=${encodeURIComponent(location.path)}&view=unified#L${location.line}`;
    show(
      PULL,
      [
        approvalRow({
          id: 'r4',
          author: 'pragent',
          state: 'CHANGES_REQUESTED',
          body_markdown:
            '| | Finding | Where |\n|---|---|---|\n' +
            '| 🟠 high | **Every tool is `' + String.raw`\\|\\| true` + '`** — stubs follow | `.github/workflows/ci.yml:44` |\n',
        }),
      ],
      fileHref
    );

    const table = within(screen.getByTestId('pr-review-r4')).getByRole('table');
    const cells = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells).toHaveLength(2);
    expect(within(cells[1]).getByTestId('review-finding-text')).toHaveTextContent('Every tool is || true — stubs follow');
    expect(within(cells[1]).getByRole('link', { name: '.github/workflows/ci.yml:44' })).toHaveAttribute(
      'href',
      `${PULL}/files?path=.github%2Fworkflows%2Fci.yml&view=unified#L44`
    );
  });

  it('leaves a table without Finding and Where columns alone', () => {
    show(`${PULL}#review-r2`);
    const table = within(screen.getByTestId('pr-review-r2')).getByRole('table');
    expect(table).not.toHaveClass('review-findings');
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Severity', 'Finding']);
  });
});
