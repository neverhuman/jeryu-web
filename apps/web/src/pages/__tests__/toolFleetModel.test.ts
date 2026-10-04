import { describe, expect, it } from 'vitest';

import type { ToolFleetEntry } from '../../api/types';
import {
  DEFAULT_TOOL_FLEET_FILTERS,
  DEFAULT_TOOL_FLEET_SORT,
  projectToolFleet,
  toolCategories,
  toolFleetFiltersFrom,
  toolFleetSortFrom,
  toolRow,
} from '../toolFleetModel';

const TOOLS: ToolFleetEntry[] = [
  { tool: 'security', category: 'security', adopting_repos: ['a/one'], applicable_missing_repos: ['a/two', 'a/three'] },
  { tool: 'audit-ci', category: 'audit', adopting_repos: ['a/one', 'a/two'], applicable_missing_repos: [] },
  { tool: 'ux-qa', category: 'ux', adopting_repos: [], applicable_missing_repos: ['b/web'] },
];

const ALL = { search: '', category: 'all', status: 'all' } as const;

describe('toolFleetModel', () => {
  it('classifies adoption status', () => {
    expect(TOOLS.map((entry) => toolRow(entry).status)).toEqual(['partial', 'complete', 'none']);
  });

  it('lists categories sorted and unique', () => {
    expect(toolCategories(TOOLS)).toEqual(['audit', 'security', 'ux']);
  });

  it('sorts by tool name by default and by adoption ratio descending', () => {
    const byName = projectToolFleet(TOOLS, ALL, { key: 'tool', direction: 'asc' });
    expect(byName.map((row) => row.entry.tool)).toEqual(['audit-ci', 'security', 'ux-qa']);
    const byRatio = projectToolFleet(TOOLS, ALL, { key: 'adoption', direction: 'desc' });
    expect(byRatio.map((row) => row.entry.tool)).toEqual(['audit-ci', 'security', 'ux-qa']);
    const byMissing = projectToolFleet(TOOLS, ALL, { key: 'missing', direction: 'desc' });
    expect(byMissing.map((row) => row.entry.tool)).toEqual(['security', 'ux-qa', 'audit-ci']);
  });

  it('filters by category, status and a repo-aware search', () => {
    const sort = { key: 'tool', direction: 'asc' } as const;
    expect(projectToolFleet(TOOLS, { ...ALL, category: 'ux' }, sort)).toHaveLength(1);
    expect(projectToolFleet(TOOLS, { ...ALL, status: 'complete' }, sort)[0]?.entry.tool).toBe('audit-ci');
    expect(projectToolFleet(TOOLS, { ...ALL, search: 'B/WEB' }, sort).map((row) => row.entry.tool)).toEqual(['ux-qa']);
  });

  it('reads the filters and the sort a URL asks for', () => {
    const params = new URLSearchParams('q=acme&category=audit&status=complete&sort=missing&dir=asc');
    const read = (param: string): string => params.get(param) ?? '';
    expect(toolFleetFiltersFrom(read)).toEqual({
      search: 'acme',
      category: 'audit',
      status: 'complete',
    });
    expect(toolFleetSortFrom(read)).toEqual({ key: 'missing', direction: 'asc' });
  });

  it('falls back to the default view for an empty or nonsense URL', () => {
    const nothing = (): string => '';
    expect(toolFleetFiltersFrom(nothing)).toEqual(DEFAULT_TOOL_FLEET_FILTERS);
    expect(toolFleetSortFrom(nothing)).toEqual(DEFAULT_TOOL_FLEET_SORT);
    const junk = new URLSearchParams('status=maybe&sort=colour&dir=sideways');
    const read = (param: string): string => junk.get(param) ?? '';
    expect(toolFleetFiltersFrom(read).status).toBe('all');
    expect(toolFleetSortFrom(read)).toEqual(DEFAULT_TOOL_FLEET_SORT);
  });

  it('starts a count column at its biggest number and a name column at A', () => {
    const read = (param: string): string => (param === 'sort' ? 'adoption' : '');
    expect(toolFleetSortFrom(read).direction).toBe('desc');
    const byName = (param: string): string => (param === 'sort' ? 'category' : '');
    expect(toolFleetSortFrom(byName).direction).toBe('asc');
  });
});
