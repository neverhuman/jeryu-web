// ToolFleetPage.tsx — Shared tools → Adoption (`/shared-tools/adoption`).
//
// Renders the per-tool adoption matrix from `GET /fleet/tool-adoption` as a
// filterable, sortable table: for each jankurai tool, how many repos have
// adopted it and how many are applicable-but-missing. Each tool links to its
// detail page (`/shared-tools/adoption/:tool`). Data is projected from each repo's latest
// recorded score — no extra computation.

import { ArrowDown, ArrowUp, Boxes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { useToolFleet } from '../hooks/useToolFleet';
import {
  projectToolFleet,
  toolCategories,
  type AdoptionStatus,
  type ToolFleetFilters,
  type ToolFleetRow,
  type ToolFleetSort,
  type ToolFleetSortKey,
} from './toolFleetModel';
import './page.css';
import './ToolFleetPage.css';
import { ADOPTION_PATH, SharedToolsTabs } from './sharedTools/SharedToolsTabs';

const COLUMNS: { key: ToolFleetSortKey; label: string; numeric?: boolean }[] = [
  { key: 'tool', label: 'Tool' },
  { key: 'category', label: 'Category' },
  { key: 'adoption', label: 'Adoption', numeric: true },
  { key: 'adopted', label: 'Adopting', numeric: true },
  { key: 'missing', label: 'Should adopt', numeric: true },
];

const STATUS_PILL: Record<AdoptionStatus, string> = {
  complete: 'page__pill page__pill--success',
  partial: 'page__pill page__pill--warning',
  none: 'page__pill page__pill--danger',
};

export function adoptionPillClass(row: ToolFleetRow): string {
  return row.total === 0 ? 'page__pill' : STATUS_PILL[row.status];
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  sort: ToolFleetSort;
  onSort: (key: ToolFleetSortKey) => void;
}): JSX.Element {
  const active = sort.key === column.key;
  const Arrow = sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={column.numeric ? 'tool-fleet__num' : undefined}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="tool-fleet__sort"
        data-testid={`tool-fleet-sort-${column.key}`}
        onClick={() => onSort(column.key)}
      >
        {column.label}
        {active ? <Arrow size={12} aria-hidden="true" /> : null}
      </button>
    </th>
  );
}

function ToolRow({ row }: { row: ToolFleetRow }): JSX.Element {
  const { entry } = row;
  return (
    <tr data-testid={`tool-row-${entry.tool}`}>
      <td>
        <Link className="tool-fleet__tool" to={`${ADOPTION_PATH}/${encodeURIComponent(entry.tool)}`}>
          {entry.tool}
        </Link>
      </td>
      <td>
        <span className="page__pill">{entry.category}</span>
      </td>
      <td className="tool-fleet__num">
        <span className={adoptionPillClass(row)}>
          {row.adopted}/{row.total}
        </span>
        <span className="tool-fleet__bar" aria-hidden="true">
          <span style={{ width: `${Math.round(row.ratio * 100)}%` }} />
        </span>
      </td>
      <td className="tool-fleet__num">{row.adopted}</td>
      <td className="tool-fleet__num">{row.missing}</td>
    </tr>
  );
}

export function ToolFleetPage(): JSX.Element {
  const { data, isPending, isError, error } = useToolFleet();
  const [filters, setFilters] = useState<ToolFleetFilters>({
    search: '',
    category: 'all',
    status: 'all',
  });
  const [sort, setSort] = useState<ToolFleetSort>({ key: 'tool', direction: 'asc' });

  const tools = data?.tools;
  const categories = useMemo(() => toolCategories(tools ?? []), [tools]);
  const rows = useMemo(
    () => projectToolFleet(tools ?? [], filters, sort),
    [tools, filters, sort]
  );

  const onSort = (key: ToolFleetSortKey): void =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'tool' || key === 'category' ? 'asc' : 'desc' }
    );

  return (
    <div className="page page--wide" data-testid="tool-fleet-page">
      <header className="page__header">
        <h1 className="page__title">Shared tools</h1>
        <p className="page__subtitle">
          Where each shared tool is in use: which repos have adopted it, and
          which should but haven&apos;t yet. Read from each repo&apos;s latest
          jankurai score, recorded on every push.
        </p>
      </header>
      <SharedToolsTabs />

      {isPending ? (
        <LoadingState title="Loading tool adoption…" variant="message" />
      ) : isError ? (
        <ErrorState title="Could not load tool adoption." error={error} />
      ) : data.tools.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No tool-adoption data yet."
          description="Once repos are scored, their tool adoption appears here."
        />
      ) : (
        <section className="page__section">
          <div className="tool-fleet__toolbar" role="search">
            <input
              type="search"
              className="tool-fleet__input"
              placeholder="Filter by tool, category or repo"
              aria-label="Filter tools"
              data-testid="tool-fleet-search"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
            <select
              className="tool-fleet__input"
              aria-label="Category"
              data-testid="tool-fleet-category"
              value={filters.category}
              onChange={(event) => setFilters({ ...filters, category: event.target.value })}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className="tool-fleet__input"
              aria-label="Adoption"
              data-testid="tool-fleet-status"
              value={filters.status}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  status: event.target.value as ToolFleetFilters['status'],
                })
              }
            >
              <option value="all">Any adoption</option>
              <option value="complete">Fully adopted</option>
              <option value="partial">Partially adopted</option>
              <option value="none">Not adopted</option>
            </select>
            <span className="tool-fleet__count">
              {rows.length} of {data.tools.length} tools · {data.repos_scored} repos scored
            </span>
          </div>

          <div className="table-scroll">
            <table className="tool-fleet__table" data-testid="tool-fleet-table">
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <SortHeader key={column.key} column={column} sort={sort} onSort={onSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ToolRow key={row.entry.tool} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <p className="tool-fleet__none">No tools match these filters.</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
