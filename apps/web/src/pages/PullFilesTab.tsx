// PullFilesTab.tsx — the Files tab of a pull request: the tree of changed
// files on the left, the diff of the open one on the right.
//
// The tree was a 240px column that cut `src/login.rs` down to `login`; it is
// 280px at its narrowest now and the reader can drag it wider (arrow keys on
// the handle do the same). Below 720px there is no room for two columns, so
// the tree becomes a one-line picker above the diff.
//
// Which file is open lives in the URL (`?path=`), so a thread, a review
// comment or a bookmark can point at one file of the diff.

import {
  useCallback,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import {
  DiffFileTree,
  DiffViewer,
  type DiffViewerMode,
} from '../components/merge';
import { ErrorState, LoadingState } from '../components/state';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { PullRequestDiffFile } from '../api/types';

import './page.css';

/** The tree never gets narrower than this: a path has to be readable. */
export const TREE_MIN_WIDTH = 280;
const TREE_MAX_WIDTH = 720;
const TREE_STEP = 32;
const NARROW = '(max-width: 720px)';

export function clampTreeWidth(width: number): number {
  return Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, Math.round(width)));
}

/**
 * What this tab reads of the diff query: whether the read is in flight, what
 * went wrong, and the changed files. Narrower than the query itself, so a test
 * states a diff rather than standing in for a whole query object.
 */
export interface PullDiffState {
  isPending: boolean;
  error: Error | null;
  data?: { files: PullRequestDiffFile[] } | undefined;
}

export interface PullFilesTabProps {
  diff: PullDiffState;
  activePath: string | null;
  activeFile: PullRequestDiffFile | undefined;
  viewedPaths: Set<string>;
  diffMode: string;
  onSelectFile: (path: string) => void;
  onToggleViewed: (path: string, viewed: boolean) => void;
  onDiffModeChange: (mode: DiffViewerMode) => void;
}

export function PullFilesTab({
  diff,
  activePath,
  activeFile,
  viewedPaths,
  diffMode,
  onSelectFile,
  onToggleViewed,
  onDiffModeChange,
}: PullFilesTabProps): JSX.Element {
  const narrow = useMediaQuery(NARROW);
  const [treeWidth, setTreeWidth] = useState(TREE_MIN_WIDTH + 40);
  const [dragging, setDragging] = useState(false);

  const onHandleDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const onHandleMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
      setTreeWidth(clampTreeWidth(event.clientX - left));
    },
    [dragging]
  );

  const onHandleUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }, []);

  const onHandleKey = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowLeft' ? -TREE_STEP : event.key === 'ArrowRight' ? TREE_STEP : 0;
    if (step === 0) {
      if (event.key !== 'Home') return;
      event.preventDefault();
      setTreeWidth(TREE_MIN_WIDTH);
      return;
    }
    event.preventDefault();
    setTreeWidth((width) => clampTreeWidth(width + step));
  }, []);

  if (diff.isPending) {
    return (
      <div className="pr-files" data-testid="pr-files-tab">
        <LoadingState title="Loading the diff…" variant="skeleton" rows={8} />
      </div>
    );
  }

  // A diff that could not be read is an error, never "this pull request
  // changes no files": the reader would take a failed read for an empty one.
  if (diff.error) {
    return (
      <div className="pr-files" data-testid="pr-files-tab">
        <ErrorState
          title="Could not load the diff"
          error={diff.error}
          className="pr-files__error"
        />
      </div>
    );
  }

  const files = diff.data?.files ?? [];
  if (files.length === 0) {
    return (
      <div className="pr-files" data-testid="pr-files-tab">
        <p className="pr-files__note" data-testid="pr-diff-note">
          This pull request changes no files.
        </p>
      </div>
    );
  }

  const tree = (
    <DiffFileTree
      files={files}
      activePath={activePath}
      viewedPaths={viewedPaths}
      onSelect={onSelectFile}
      onToggleViewed={onToggleViewed}
    />
  );

  const picker = (
    <div className="pr-files__picker">
      <label className="pr-files__picker-label" htmlFor="pr-files-picker">
        File
      </label>
      <select
        id="pr-files-picker"
        className="pr-files__picker-control"
        value={activePath ?? ''}
        onChange={(event) => onSelectFile(event.target.value)}
        data-testid="pr-files-picker"
      >
        {files.map((file) => (
          <option key={file.path} value={file.path}>
            {file.path} (+{file.additions} −{file.deletions})
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div
      className={`pr-files pr-files--split ${narrow ? 'pr-files--narrow' : ''}`.trim()}
      data-testid="pr-files-tab"
      style={{ '--pr-tree-width': `${treeWidth}px` } as CSSProperties}
    >
      {narrow ? (
        picker
      ) : (
        <>
          <aside className="pr-files__tree" data-testid="pr-files-tree">
            {tree}
          </aside>
          <div
            className="pr-files__handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the file tree"
            aria-valuenow={treeWidth}
            aria-valuemin={TREE_MIN_WIDTH}
            aria-valuemax={TREE_MAX_WIDTH}
            tabIndex={0}
            data-testid="pr-files-handle"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onKeyDown={onHandleKey}
          />
        </>
      )}
      <main className="pr-files__diff">
        {activeFile ? (
          <DiffViewer
            file={activeFile}
            mode={diffMode as DiffViewerMode}
            onModeChange={onDiffModeChange}
          />
        ) : (
          <p className="pr-files__note" data-testid="pr-diff-note">
            Choose a file to see its changes.
          </p>
        )}
      </main>
    </div>
  );
}
