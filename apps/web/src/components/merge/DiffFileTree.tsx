// DiffFileTree.tsx — list of files changed in the PR (W-FE-11).
//
// One row per file, with:
//   * Status icon (added / modified / removed / renamed).
//   * Risk dot — when the backend tags a file with low / medium / high /
//     critical risk, one coloured dot carries it, named in its tooltip and to
//     a screen reader. A full word per row cost the path its room.
//   * Additions / deletions counters, pinned to the right edge.
//
// There is no "Viewed" checkbox: it was browser-only state the server never
// saw, and its hidden slot kept the counters off the right edge.
//
// The path is shown whole: `src/login.rs` reading as `login` or `ca` told the
// reviewer nothing, so a long path wraps rather than being cut.

import {
  CircleDot,
  FilePlus,
  FileX,
  GitMerge,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import type {
  PullRequestDiffFile,
  PullRequestFileStatus,
} from '../../api/types';

import './merge.css';

const STATUS_ICONS: Record<PullRequestFileStatus, LucideIcon> = {
  added: FilePlus,
  modified: Pencil,
  removed: FileX,
  renamed: GitMerge,
};

const STATUS_LABELS: Record<PullRequestFileStatus, string> = {
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed',
  renamed: 'Renamed',
};

/**
 * Split a path into its directory prefix (with trailing slash) and basename,
 * so the prefix can ellipsize while the basename always stays visible.
 */
export function splitPath(path: string): { dir: string; base: string } {
  const cut = path.lastIndexOf('/');
  if (cut < 0) return { dir: '', base: path };
  return { dir: path.slice(0, cut + 1), base: path.slice(cut + 1) };
}

const RISK_LABELS: Record<NonNullable<PullRequestDiffFile['risk']>, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/** The file's risk, as one dot that says what it is when pointed at. */
function RiskDot({
  risk,
}: {
  risk: NonNullable<PullRequestDiffFile['risk']>;
}): JSX.Element {
  const label = `Risk: ${RISK_LABELS[risk]}`;
  return (
    <span
      className={`diff-file-tree__risk diff-file-tree__risk--${risk}`}
      title={label}
      data-testid={`diff-risk-${risk}`}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface DiffFileTreeProps {
  files: PullRequestDiffFile[];
  /** Currently selected file path. */
  activePath: string | null;
  onSelect: (path: string) => void;
  className?: string;
}

export function DiffFileTree({
  files,
  activePath,
  onSelect,
  className,
}: DiffFileTreeProps): JSX.Element {
  if (files.length === 0) {
    return (
      <div className={`diff-file-tree ${className ?? ''}`.trim()}>
        <p className="diff-file-tree__empty">No files changed.</p>
      </div>
    );
  }

  return (
    <nav
      className={`diff-file-tree ${className ?? ''}`.trim()}
      aria-label="Files changed"
    >
      <ul className="diff-file-tree__list">
        {files.map((file) => {
          const Icon = STATUS_ICONS[file.status] ?? CircleDot;
          const isActive = file.path === activePath;
          return (
            <li key={file.path}>
              <div
                className={`diff-file-tree__row ${isActive ? 'diff-file-tree__row--active' : ''}`.trim()}
                data-status={file.status}
              >
                <button
                  type="button"
                  className="diff-file-tree__button"
                  onClick={() => onSelect(file.path)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span
                    className={`diff-file-tree__status diff-file-tree__status--${file.status}`}
                  >
                    <Icon aria-hidden="true" size={16} />
                    {/* `aria-label` on a span with no role is dropped, which
                        left the status announced as nothing: say it in text. */}
                    <span className="sr-only">{STATUS_LABELS[file.status]} </span>
                  </span>
                  <span className="diff-file-tree__path" title={file.path}>
                    {file.status === 'renamed' && file.old_path ? (
                      <>
                        <span className="diff-file-tree__prior-path">
                          {file.old_path}
                        </span>
                        <span aria-hidden="true"> → </span>
                      </>
                    ) : null}
                    <span className="diff-file-tree__dir">
                      {splitPath(file.path).dir}
                    </span>
                    <span className="diff-file-tree__base">
                      {splitPath(file.path).base}
                    </span>
                  </span>
                  <span className="diff-file-tree__counts">
                    <span className="diff-file-tree__additions">
                      +{file.additions}
                    </span>
                    <span className="diff-file-tree__deletions">
                      −{file.deletions}
                    </span>
                  </span>
                  {file.risk ? <RiskDot risk={file.risk} /> : null}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
