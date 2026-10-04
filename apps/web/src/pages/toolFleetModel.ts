// toolFleetModel.ts — pure filter/sort projection for the Adoption table.
//
// Kept free of React so the table's ordering and filtering rules are unit
// testable without rendering.

import type { ToolFleetEntry } from '../api/types';
import { repoRefOf, repoUrl } from './repoBrowserModel';

export type AdoptionStatus = 'complete' | 'partial' | 'none';
export type ToolFleetSortKey = 'tool' | 'category' | 'adoption' | 'adopted' | 'missing';
export type SortDirection = 'asc' | 'desc';

export interface ToolFleetFilters {
  search: string;
  category: string;
  status: AdoptionStatus | 'all';
}

export interface ToolFleetSort {
  key: ToolFleetSortKey;
  direction: SortDirection;
}

export const DEFAULT_TOOL_FLEET_FILTERS: ToolFleetFilters = {
  search: '',
  category: 'all',
  status: 'all',
};

export const DEFAULT_TOOL_FLEET_SORT: ToolFleetSort = { key: 'tool', direction: 'asc' };

const SORT_KEYS: ToolFleetSortKey[] = ['tool', 'category', 'adoption', 'adopted', 'missing'];
const ADOPTION_STATUSES: (AdoptionStatus | 'all')[] = ['all', 'complete', 'partial', 'none'];

/** The filters a URL asks for, with anything it does not name left on default. */
export function toolFleetFiltersFrom(read: (param: string) => string): ToolFleetFilters {
  const status = read('status') as AdoptionStatus | 'all';
  return {
    search: read('q'),
    category: read('category') || DEFAULT_TOOL_FLEET_FILTERS.category,
    status: ADOPTION_STATUSES.includes(status) ? status : DEFAULT_TOOL_FLEET_FILTERS.status,
  };
}

/** The sort a URL asks for; an unknown column or direction falls back to the default. */
export function toolFleetSortFrom(read: (param: string) => string): ToolFleetSort {
  const asked = read('sort') as ToolFleetSortKey;
  const key = SORT_KEYS.includes(asked) ? asked : DEFAULT_TOOL_FLEET_SORT.key;
  const direction = read('dir') as SortDirection;
  return {
    key,
    direction: direction === 'asc' || direction === 'desc' ? direction : defaultDirection(key),
  };
}

/** Names sort ascending; counts and ratios start at the biggest number. */
export function defaultDirection(key: ToolFleetSortKey): SortDirection {
  return key === 'tool' || key === 'category' ? 'asc' : 'desc';
}

export interface ToolFleetRow {
  entry: ToolFleetEntry;
  adopted: number;
  missing: number;
  total: number;
  ratio: number;
  status: AdoptionStatus;
}

// Owner/name of the repo that defines every jankurai tool lane.
export const TOOL_DEFINITION_REPO = { host: 'jeryu', owner: 'jeryu', name: 'jankurai' };

export function toolRow(entry: ToolFleetEntry): ToolFleetRow {
  const adopted = entry.adopting_repos.length;
  const missing = entry.applicable_missing_repos.length;
  const total = adopted + missing;
  const ratio = total === 0 ? 0 : adopted / total;
  const status: AdoptionStatus =
    total > 0 && adopted === total ? 'complete' : adopted === 0 ? 'none' : 'partial';
  return { entry, adopted, missing, total, ratio, status };
}

export function toolCategories(entries: readonly ToolFleetEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.category))].sort();
}

function matchesSearch(row: ToolFleetRow, needle: string): boolean {
  if (needle === '') return true;
  const { entry } = row;
  return [entry.tool, entry.category, ...entry.adopting_repos, ...entry.applicable_missing_repos]
    .some((value) => value.toLowerCase().includes(needle));
}

function compareRows(a: ToolFleetRow, b: ToolFleetRow, key: ToolFleetSortKey): number {
  switch (key) {
    case 'tool':
      return a.entry.tool.localeCompare(b.entry.tool);
    case 'category':
      return a.entry.category.localeCompare(b.entry.category);
    case 'adoption':
      return a.ratio - b.ratio;
    case 'adopted':
      return a.adopted - b.adopted;
    case 'missing':
      return a.missing - b.missing;
  }
}

export function projectToolFleet(
  entries: readonly ToolFleetEntry[],
  filters: ToolFleetFilters,
  sort: ToolFleetSort
): ToolFleetRow[] {
  const needle = filters.search.trim().toLowerCase();
  const sign = sort.direction === 'asc' ? 1 : -1;
  return entries
    .map(toolRow)
    .filter((row) => filters.category === 'all' || row.entry.category === filters.category)
    .filter((row) => filters.status === 'all' || row.status === filters.status)
    .filter((row) => matchesSearch(row, needle))
    .sort(
      (a, b) =>
        sign * compareRows(a, b, sort.key) || a.entry.tool.localeCompare(b.entry.tool)
    );
}

export function repoHref(fullName: string): string {
  return repoUrl(repoRefOf(TOOL_DEFINITION_REPO.host, fullName));
}
