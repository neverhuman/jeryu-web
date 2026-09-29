import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiffFileTree, splitPath } from '../DiffFileTree';
import type { PullRequestDiffFile } from '../../../api/types';

describe('splitPath', () => {
  it('keeps the basename apart from its directory', () => {
    expect(splitPath('crates/jeryu-api/src/web/pulls.rs')).toEqual({
      dir: 'crates/jeryu-api/src/web/',
      base: 'pulls.rs',
    });
    expect(splitPath('README.md')).toEqual({ dir: '', base: 'README.md' });
  });
});

describe('DiffFileTree', () => {
  it('renders each basename in its own non-shrinking span', () => {
    const files = ['crates/jeryu-api/src/a.rs', 'crates/jeryu-api/src/b.rs'].map(
      (path) => ({ path, status: 'modified', additions: 1, deletions: 0 }),
    ) as unknown as PullRequestDiffFile[];
    render(
      <DiffFileTree
        files={files}
        activePath={null}
        viewedPaths={new Set()}
        onSelect={vi.fn()}
        onToggleViewed={vi.fn()}
      />,
    );
    const base = screen.getByText('b.rs');
    expect(base).toHaveClass('diff-file-tree__base');
    expect(base.parentElement).toHaveAttribute('title', 'crates/jeryu-api/src/b.rs');
  });

  it('says a file status in text, so no row is announced by its icon alone', () => {
    const files = [
      { path: 'a.rs', status: 'added', additions: 1, deletions: 0 },
      { path: 'b.rs', status: 'removed', additions: 0, deletions: 2 },
    ] as unknown as PullRequestDiffFile[];
    render(
      <DiffFileTree
        files={files}
        activePath={null}
        viewedPaths={new Set()}
        onSelect={vi.fn()}
        onToggleViewed={vi.fn()}
      />,
    );
    // The status is part of the row button's name, not an `aria-label` on a
    // span with no role, which assistive tech drops.
    expect(screen.getByRole('button', { name: /Added\s*.*a\.rs/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Removed\s*.*b\.rs/ })).toBeInTheDocument();
    for (const span of document.querySelectorAll('.diff-file-tree__status')) {
      expect(span).not.toHaveAttribute('aria-label');
    }
  });
});
