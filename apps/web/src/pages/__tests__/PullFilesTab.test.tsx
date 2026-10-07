// PullFilesTab.test.tsx — the Files tab: a tree beside the diff.
//
// The two things it must never do: cut a path down to a word, and report a
// failed diff read as a pull request that changes no files.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  clampTreeWidth,
  PullFilesTab,
  TREE_MIN_WIDTH,
  type PullDiffState,
} from '../PullFilesTab';
import type { PullRequestDiffFile } from '../../api/types';

const FILE: PullRequestDiffFile = {
  path: 'src/login.rs',
  old_path: null,
  status: 'modified',
  additions: 3,
  deletions: 1,
  risk: 'high',
  is_binary: false,
  hunks: [],
};

function diffQuery(over: Partial<PullDiffState>): PullDiffState {
  return {
    isPending: false,
    error: null,
    data: { files: [FILE] },
    ...over,
  };
}

function show(diff: PullDiffState, activePath: string | null = FILE.path): {
  onSelectFile: ReturnType<typeof vi.fn>;
} {
  const onSelectFile = vi.fn();
  render(
    <PullFilesTab
      diff={diff}
      activePath={activePath}
      activeFile={diff.data?.files.find((file) => file.path === activePath)}
      diffMode="unified"
      onSelectFile={onSelectFile}
      onDiffModeChange={vi.fn()}
    />
  );
  return { onSelectFile };
}

describe('PullFilesTab', () => {
  it('shows the tree, with the whole path, beside the diff', () => {
    show(diffQuery({}));
    expect(screen.getByTestId('pr-files-tree')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /src\/login\.rs/ })
    ).toBeInTheDocument();
  });

  it('offers a resize handle the keyboard can move', async () => {
    show(diffQuery({}));
    const handle = screen.getByTestId('pr-files-handle');
    expect(handle).toHaveAttribute('aria-valuemin', String(TREE_MIN_WIDTH));
    const before = Number(handle.getAttribute('aria-valuenow'));
    handle.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
    await userEvent.keyboard('{Home}');
    expect(handle).toHaveAttribute('aria-valuenow', String(TREE_MIN_WIDTH));
  });

  it('reports a failed diff read as an alert, never as an empty diff', () => {
    show(diffQuery({ error: new Error('upstream diff timed out') }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load the diff');
    expect(alert).toHaveTextContent('upstream diff timed out');
    expect(screen.queryByTestId('pr-diff-note')).toBeNull();
  });

  it('says a pull request changes no files only when it changes none', () => {
    show(
      diffQuery({
        data: { files: [] },
      }),
      null
    );
    expect(screen.getByTestId('pr-diff-note')).toHaveTextContent(
      'This pull request changes no files.'
    );
  });

  it('becomes a one-line picker when there is no room for two columns', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(max-width: 720px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      const { onSelectFile } = show(
        diffQuery({
          data: { files: [FILE, { ...FILE, path: 'src/session.rs' }] },
        })
      );
      expect(screen.queryByTestId('pr-files-tree')).toBeNull();
      const picker = screen.getByTestId('pr-files-picker');
      await userEvent.selectOptions(picker, 'src/session.rs');
      expect(onSelectFile).toHaveBeenCalledWith('src/session.rs');
    } finally {
      window.matchMedia = original;
    }
  });

  it('keeps the tree no narrower than a path can be read in', () => {
    expect(clampTreeWidth(10)).toBe(TREE_MIN_WIDTH);
    expect(clampTreeWidth(5000)).toBe(720);
    expect(clampTreeWidth(400.4)).toBe(400);
  });
});
