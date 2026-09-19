// RepoTable.tsx — TanStack Table view of repositories (W-FE-08).
//
// Renders one row per `RepositorySummary` with a click target that navigates
// to the overview page. The header carries `aria-sort` so screen readers can
// announce the current sort direction; the sort itself runs against the
// table's data so it stays in sync with column clicks.

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { RepositorySummary } from '../../api/types';
import type { DeployedRepository } from '../../api/types/deployments';

import { JankuraiScoreBadge } from './JankuraiScoreBadge';
import { unshippedCell, unshippedSortValue, unshippedTitle } from './unshipped';
import { MirrorStatusBadge } from './MirrorStatusBadge';
import { RepoHealthPill } from './RepoHealthPill';
import { RepoRoleBadge } from './RepoRoleBadge';
import { relativeTime } from './relativeTime';
import { pullRoomHref } from '../../pages/pullRoomModel';

import { repoHref } from './RepoCard';
import { familyHref } from './RepoFamilyCard';

import './repo.css';

export interface RepoTableProps {
  repos: RepositorySummary[];
  /** Live production deployments keyed by `owner/name`; absent = nothing deployed. */
  deployed?: ReadonlyMap<string, DeployedRepository>;
}

const NOTHING_DEPLOYED: ReadonlyMap<string, DeployedRepository> = new Map();

export function RepoTable({
  repos,
  deployed = NOTHING_DEPLOYED,
}: RepoTableProps): JSX.Element {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);

  const columns = useMemo<ColumnDef<RepositorySummary>[]>(
    () => [
      {
        id: 'family',
        header: 'Family',
        accessorFn: (row) => row.family ?? '',
        cell: ({ row }) => {
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
        },
      },
      {
        id: 'name',
        header: 'Repository',
        accessorFn: (row) => row.id.name,
        cell: ({ row }) => (
          <span className="repo-table__repo-cell">
            {/* owner/name: three repositories can share a name. The name is
                the link; the row stays clickable as well. */}
            <Link
              to={repoHref(row.original)}
              className="repo-table__repo-link"
              onClick={(e) => e.stopPropagation()}
              data-testid={`repo-link-${row.original.id.owner}/${row.original.id.name}`}
            >
              <span className="repo-table__repo-owner">{row.original.id.owner}/</span>
              <strong>{row.original.id.name}</strong>
            </Link>
            <RepoRoleBadge role={row.original.repo_role} />
          </span>
        ),
      },
      {
        id: 'description',
        header: 'Description',
        accessorFn: (row) => row.description ?? '',
        cell: ({ row }) =>
          row.original.description ?? (
            <span className="text-muted">No description</span>
          ),
      },
      {
        id: 'posture',
        header: 'Posture',
        accessorFn: (row) => row.health,
        cell: ({ row }) => <RepoHealthPill health={row.original.health} />,
      },
      {
        id: 'score',
        header: 'Score',
        // Unscored repos sort below every real score (worst-first when
        // ascending) instead of throwing the comparator off with nulls.
        accessorFn: (row) => row.jankurai_score ?? -1,
        cell: ({ row }) => (
          <JankuraiScoreBadge
            score={row.original.jankurai_score}
            decision={row.original.jankurai_decision}
            scoredAt={row.original.jankurai_scored_at}
          />
        ),
      },
      {
        id: 'mirror',
        header: 'Mirror',
        enableSorting: false,
        cell: ({ row }) => <MirrorStatusBadge mirror={row.original.mirror} />,
      },
      {
        id: 'open_prs',
        header: 'Open PRs',
        accessorFn: (row) => row.open_pull_requests,
        cell: ({ row }) => (
          <Link
            to={pullRoomHref(`${row.original.id.owner}/${row.original.id.name}`)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${row.original.open_pull_requests} open pull requests in Pull Room`}
          >
            {row.original.open_pull_requests}
          </Link>
        ),
      },
      {
        id: 'unshipped',
        header: 'Unshipped',
        // Commits on the default branch that production does not run yet.
        accessorFn: (row) =>
          unshippedSortValue(
            unshippedCell(deployed.get(`${row.id.owner}/${row.id.name}`))
          ),
        cell: ({ row }) => {
          const repo = `${row.original.id.owner}/${row.original.id.name}`;
          const cell = unshippedCell(deployed.get(repo));
          const title = unshippedTitle(cell);
          if (cell.kind === 'behind') {
            return (
              <Link
                to={`/releases?repo=${encodeURIComponent(repo)}`}
                className="repo-table__unshipped"
                onClick={(e) => e.stopPropagation()}
                title={title}
                aria-label={title}
                data-testid={`repo-unshipped-${row.original.id.name}`}
              >
                {cell.commits}
              </Link>
            );
          }
          return (
            <span
              className="text-muted"
              title={title}
              aria-label={title}
              data-testid={`repo-unshipped-${row.original.id.name}`}
            >
              {cell.kind === 'up_to_date' ? '0' : cell.kind === 'unknown' ? '?' : '—'}
            </span>
          );
        },
      },
      {
        id: 'failing_checks',
        header: 'Failing CI',
        // Failing check runs on the default-branch head plus open PR heads.
        // There is no per-commit checks view, so a non-zero count links to the
        // repo overview, which lists them.
        accessorFn: (row) => row.failing_checks,
        cell: ({ row }) => (
          <span className="repo-table__checks">
            {row.original.failing_checks > 0 ? (
              <Link
                to={repoHref(row.original)}
                onClick={(e) => e.stopPropagation()}
                title="Failing CI checks on the default branch and open pull requests"
                aria-label={`${row.original.failing_checks} failing CI checks`}
                data-testid={`repo-failing-ci-${row.original.id.name}`}
              >
                {row.original.failing_checks}
              </Link>
            ) : (
              <span
                className="text-muted"
                title="No failing CI checks"
                aria-label="No failing CI checks"
                data-testid={`repo-failing-ci-${row.original.id.name}`}
              >
                —
              </span>
            )}
            {row.original.running_jobs > 0 ? (
              <span
                className="repo-table__running"
                title="Running jobs"
                aria-label={`${row.original.running_jobs} running jobs`}
              >
                <Play size={12} aria-hidden="true" />
                {row.original.running_jobs}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'updated_at',
        header: 'Updated',
        accessorFn: (row) => row.updated_at,
        // Sort on the raw timestamp; show it abbreviated, full on hover.
        cell: ({ row }) => (
          <time dateTime={row.original.updated_at} title={row.original.updated_at}>
            {relativeTime(row.original.updated_at)}
          </time>
        ),
      },
    ],
    [deployed]
  );

  const table = useReactTable({
    data: repos,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table
      className="repo-table"
      role="grid"
      aria-label="Repositories"
    >
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
          return (
            <tr
              key={repo.id.id}
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
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
