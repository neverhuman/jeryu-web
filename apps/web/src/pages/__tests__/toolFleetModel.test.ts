import { describe, expect, it } from 'vitest';

import type { ToolFleetEntry } from '../../api/types';
import { projectToolFleet, toolCategories, toolRow } from '../toolFleetModel';

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
});
