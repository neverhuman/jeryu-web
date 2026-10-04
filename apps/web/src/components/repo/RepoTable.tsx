// RepoTable.tsx — TanStack Table view of repositories (W-FE-08).
//
// Renders one row per `RepositorySummary` with a click target that navigates
// to the overview page. Status is the one column about trouble: a red chip
// that opens, under the row, what is failing and what to do about it. The header carries `aria-sort` so screen readers can
// announce the current sort direction; the sort itself runs against the
// table's data so it stays in sync with column clicks.

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight, Play } from 'lucide-react';
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { RepositorySummary } from '../../api/types';
import type { RepoSort } from '../../hooks/useRepositories';
import { QUALITY_GATE_PATH } from '../../pages/qualityGate/qualityGateModel';
import {
  attentionRank,
  failingLabel,
  mirrorFailing,
  MIRROR_OPERATOR_SENTENCE,
  newerCopies,
  type NewerCopy
} from '../../pages/repoStatusModel';

import {
  JankuraiScoreBadge,
  JANKURAI_GOOD_THRESHOLD
} from './JankuraiScoreBadge';
import { distinctDescriptions } from './repoDescription';
import { RepoFailingChecks } from './RepoFailingChecks';
import { RepoArchivedBadge } from './RepoArchivedBadge';
import { RepoRoleBadge } from './RepoRoleBadge';
import { relativeTime } from './relativeTime';
import { pullRoomHref } from '../../pages/pullRoomModel';

import { repoHref } from './RepoCard';
import { familyHref } from './RepoFamilyCard';

import './repo.css';

export interface RepoTableProps {
  repos: RepositorySummary[];
  /** The order the sort control names; the header follows it. */
  sort?: RepoSort;
  /** A header click that matches a sort the control offers reports it here. */
  onSortChange?: (sort: RepoSort) => void;
}

/** What a column's `cell` callback receives from Table v8. */
type RepoCell = CellContext<RepositorySummary, unknown>;

/** The column and direction each sort of the sort control means. */
const SORT_COLUMNS: Record<RepoSort, { id: string; desc: boolean }> = {
  recent_activity: { id: 'updated_at', desc: true },
  name: { id: 'name', desc: false },
  open_prs: { id: 'open_prs', desc: true },
  failing_checks: { id: 'status', desc: true }
};

/** The control's sort for a header state, when it offers one. */
export function sortForColumns(sorting: SortingState): RepoSort | undefined {
  const [first] = sorting;
  if (!first || sorting.length !== 1) return undefined;
  return (Object.keys(SORT_COLUMNS) as RepoSort[]).find(
    (key) =>
      SORT_COLUMNS[key].id === first.id && SORT_COLUMNS[key].desc === first.desc
  );
}

/**
 * Which repositories show their failing checks. It travels by context so the
 * column definitions stay stable: a cell that changed identity on every toggle
 * would remount, and the chip would lose focus the moment it was pressed.
 */
const OpenRows = createContext<{
  open: ReadonlySet<string>;
  toggle: (id: string) => void;
}>({ open: new Set(), toggle: () => {} });

function StatusCell({ repo }: { repo: RepositorySummary }): JSX.Element {
  const { open, toggle } = useContext(OpenRows);
  const expanded = open.has(repo.id.id);
  return (
    <span className="repo-table__status">
      {repo.failing_checks > 0 ? (
        <button
          type="button"
          className="repo-status-chip repo-status-chip--danger"
          aria-expanded={expanded}
          aria-controls={detailId(repo)}
          onClick={(e) => {
            e.stopPropagation();
            toggle(repo.id.id);
          }}
          data-testid={`repo-status-${repo.id.name}`}
        >
          {expanded ? (
            <ChevronDown size={12} aria-hidden="true" />
          ) : (
            <ChevronRight size={12} aria-hidden="true" />
          )}
          {failingLabel(repo.failing_checks)}
        </button>
      ) : (
        <span
          className="text-muted"
          data-testid={`repo-status-${repo.id.name}`}
        >
          healthy
        </span>
      )}
      {mirrorFailing(repo.mirror) ? (
        <span
          className="repo-status-chip repo-status-chip--warning"
          title={MIRROR_OPERATOR_SENTENCE}
          data-testid={`repo-mirror-failing-${repo.id.name}`}
        >
          mirror failing
        </span>
      ) : null}
      {repo.running_jobs > 0 ? (
        <span
          className="repo-table__running"
          title="Running jobs"
          aria-label={`${repo.running_jobs} running jobs`}
        >
          <Play size={12} aria-hidden="true" />
          {repo.running_jobs}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The timestamp the Updated column shows: the last push when the repository
 * has one, otherwise `updated_at`, which also moves for metadata edits. The
 * flag lets the cell say which of the two it is showing. Mirrors the server's
 * default "recent_activity" ordering.
 */
function activityTime(repo: RepositorySummary): {
  iso: string;
  pushed: boolean;
} {
  const pushedAt = repo.pushed_at;
  return pushedAt
    ? { iso: pushedAt, pushed: true }
    : { iso: repo.updated_at, pushed: false };
}

/** DOM id of the detail row a repository's status chip opens. */
function detailId(repo: RepositorySummary): string {
  return `repo-status-${repo.id.id}`;
}

/** "newer copy: owner/name" on the older of two repositories that share a name. */
function NewerCopyChip({
  repo,
  copies,
}: {
  repo: RepositorySummary;
  copies: ReadonlyMap<string, NewerCopy>;
}): JSX.Element | null {
  const newer = copies.get(`${repo.id.owner}/${repo.id.name}`);
  if (!newer) return null;
  return (
    <Link
      to={repoHref({ ...repo, id: { ...repo.id, owner: newer.owner } })}
      className="repo-table__newer-copy"
      onClick={(e) => e.stopPropagation()}
      title={`${newer.owner}/${newer.name} was updated more recently; this copy may be a stale snapshot`}
      data-testid={`newer-copy-${repo.id.owner}/${repo.id.name}`}
    >
      newer copy: {newer.owner}/{newer.name}
    </Link>
  );
}

export function RepoTable({
  repos,
  sort = 'name',
  onSortChange
}: RepoTableProps): JSX.Element {
  const copies = useMemo(() => newerCopies(repos), [repos]);
  const descriptions = useMemo(
    () => distinctDescriptions(repos.map((repo) => repo.description)),
    [repos]
  );
  const navigate = useNavigate();
  // Repositories whose failing checks are shown under their row.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((id: string): void => {
    setOpen((held) => {
      const next = new Set(held);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const rows = useMemo(() => ({ open, toggle }), [open, toggle]);
  const [sorting, setSorting] = useState<SortingState>([SORT_COLUMNS[sort]]);
  // The control changed: the header shows the order it names.
  const [shownSort, setShownSort] = useState(sort);
  if (shownSort !== sort) {
    setShownSort(sort);
    setSorting([SORT_COLUMNS[sort]]);
  }
  const onSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)): void => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      const named = sortForColumns(next);
      if (named && named !== sort) onSortChange?.(named);
    },
    [sorting, sort, onSortChange]
  );

  const columns = useMemo<ColumnDef<RepositorySummary>[]>(
    () => [
      {
        id: 'family',
        header: 'Family',
        accessorFn: (row) => row.family ?? '',
        cell: ({ row }: RepoCell) => {
          const family = row.original.family;
          if (!family) return null;
          return (
            <Link
              to={familyHref(family)}
              className="repo-table__family-link"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open family ${family}`}
            >
              {family}
            </Link>
          );
        }
      },
      {
        id: 'name',
        header: 'Repository',
        accessorFn: (row) => row.id.name,
        cell: ({ row }: RepoCell) => (
          <span className="repo-table__repo-cell">
            {/* owner/name: three repositories can share a name. The name is
                the link; the row stays clickable as well. */}
            <Link
              to={repoHref(row.original)}
              className="repo-table__repo-link"
              onClick={(e) => e.stopPropagation()}
              data-testid={`repo-link-${row.original.id.owner}/${row.original.id.name}`}
            >
              <span className="repo-table__repo-owner">
                {row.original.id.owner}/
              </span>
              <strong>{row.original.id.name}</strong>
            </Link>
            <RepoRoleBadge role={row.original.repo_role} />
            <RepoArchivedBadge archived={row.original.archived} />
            <NewerCopyChip repo={row.original} copies={copies} />
          </span>
        )
      },
      {
        id: 'description',
        header: 'Description',
        accessorFn: (row) => row.description ?? '',
        // Only the part that differs from the other rows; the full text on hover.
        cell: ({ row }: RepoCell) => {
          const full = row.original.description;
          if (!full) return <span className="text-muted">No description</span>;
          const distinct = descriptions.get(full) ?? full;
          return (
            <span
              className={distinct ? 'repo-table__description' : 'text-muted'}
              title={full}
              data-testid={`repo-description-${row.original.id.owner}/${row.original.id.name}`}
            >
              {distinct || '—'}
            </span>
          );
        }
      },
      {
        id: 'status',
        header: 'Status',
        // What needs a person sorts first.
        accessorFn: (row) => attentionRank(row),
        sortDescFirst: true,
        cell: ({ row }: RepoCell) => <StatusCell repo={row.original} />
      },
      {
        id: 'score',
        header: () => (
          <span
            title={`jankurai/proof audit of the default branch; ${JANKURAI_GOOD_THRESHOLD} is the floor, below it needs work`}
          >
            Score <span className="text-muted">(floor {JANKURAI_GOOD_THRESHOLD})</span>
          </span>
        ),
        // Unscored repos sort below every real score (worst-first when
        // ascending) instead of throwing the comparator off with nulls.
        accessorFn: (row) => row.jankurai_score ?? -1,
        // The score links to the quality gate: the rules and findings behind it.
        cell: ({ row }: RepoCell) => (
          <Link
            to={QUALITY_GATE_PATH}
            className="repo-table__score-link"
            onClick={(e) => e.stopPropagation()}
            title="See what produced this score"
            data-testid={`repo-score-${row.original.id.owner}/${row.original.id.name}`}
          >
            <JankuraiScoreBadge
              score={row.original.jankurai_score}
              decision={row.original.jankurai_decision}
              scoredAt={row.original.jankurai_scored_at}
            />
          </Link>
        )
      },
      {
        id: 'open_prs',
        header: 'Open PRs',
        accessorFn: (row) => row.open_pull_requests,
        cell: ({ row }: RepoCell) => (
          <Link
            to={pullRoomHref(
              `${row.original.id.owner}/${row.original.id.name}`
            )}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${row.original.open_pull_requests} open pull requests, see them`}
          >
            {row.original.open_pull_requests}
          </Link>
        )
      },
      {
        id: 'updated_at',
        header: 'Updated',
        accessorFn: (row) => activityTime(row).iso,
        // Sort on the raw timestamp; show it abbreviated, full on hover.
        cell: ({ row }: RepoCell) => {
          const { iso, pushed } = activityTime(row.original);
          return (
            <time
              dateTime={iso}
              title={`${pushed ? 'Last push' : 'Last updated'}: ${iso}`}
            >
              {relativeTime(iso)}
            </time>
          );
        }
      }
    ],
    [copies, descriptions]
  );

  const table = useReactTable({
    data: repos,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  return (
    <OpenRows.Provider value={rows}>
      <div className="table-scroll">
        <table className="repo-table" role="grid" aria-label="Repositories">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  const ariaSort: 'none' | 'ascending' | 'descending' =
                    direction === 'asc'
                      ? 'ascending'
                      : direction === 'desc'
                        ? 'descending'
                        : 'none';
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      className={canSort ? 'repo-table__th--sortable' : undefined}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const repo = row.original;
              const cells = row.getVisibleCells();
              return (
                <Fragment key={repo.id.id}>
                  <tr
                    tabIndex={0}
                    role="row"
                    aria-label={`Open ${repo.id.owner}/${repo.id.name}`}
                    onClick={() => navigate(repoHref(repo))}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(repoHref(repo));
                      }
                    }}
                  >
                    {cells.map((cell) => (
                      <td key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                  {open.has(repo.id.id) ? (
                    <tr
                      className="repo-table__detail-row"
                      role="row"
                      id={detailId(repo)}
                    >
                      <td colSpan={cells.length} role="gridcell">
                        <RepoFailingChecks repo={repo} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </OpenRows.Provider>
  );
}
