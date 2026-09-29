import { describe, expect, it } from 'vitest';

import type { Command } from '../../stores/commandStore';
import type { SearchHit } from '../../api/types';
import { hiddenCount, hitGroups, pageHits, searchUrl } from '../search/searchModel';

const route = (id: string, title: string, keywords: string[], path: string): Command =>
  ({ id, title, keywords, icon: 'home', target: { kind: 'route', path } }) as Command;

const COMMANDS: Command[] = [
  route('nav.qg', 'Go to Quality gate', ['gate', 'jankurai'], '/quality-gate'),
  route('nav.repos', 'Go to Repositories', ['repos'], '/repos'),
  { id: 'theme.dark', title: 'Dark theme gate', keywords: [], icon: 'moon', target: { kind: 'action', run: () => {} } } as unknown as Command,
];

describe('searchUrl', () => {
  it('puts the trimmed query in ?q=', () => {
    expect(searchUrl('  quality gate ')).toBe('/search?q=quality+gate');
    expect(searchUrl('name#12')).toBe('/search?q=name%2312');
  });
  it('is the bare page for an empty query', () => {
    expect(searchUrl('  ')).toBe('/search');
  });
});

describe('pageHits', () => {
  it('matches routes by title or keyword, every word', () => {
    expect(pageHits('gate', COMMANDS).map((h) => h.path)).toEqual(['/quality-gate']);
    expect(pageHits('go gate', COMMANDS).map((h) => h.id)).toEqual(['nav.qg']);
    expect(pageHits('GO', COMMANDS)).toHaveLength(2);
  });
  it('finds nothing for an empty or unknown query', () => {
    expect(pageHits('', COMMANDS)).toEqual([]);
    expect(pageHits('zzz', COMMANDS)).toEqual([]);
  });
});

const hit = (kind: SearchHit['kind'], id: string): SearchHit => ({
  kind,
  id,
  title: id,
  context: '',
  path: '/',
});

describe('hitGroups', () => {
  it('makes one group per searched kind, in display order, empty ones kept', () => {
    const groups = hitGroups(
      ['issue', 'repository'],
      [hit('issue', 'issue:a#1')],
      { issue: 4 }
    );
    expect(groups.map((g) => g.kind)).toEqual(['repository', 'issue']);
    expect(groups[0]).toMatchObject({ label: 'Repositories', hits: [], total: 0 });
    expect(groups[1]).toMatchObject({ label: 'Issues', total: 4 });
    expect(groups[1].hits.map((h) => h.id)).toEqual(['issue:a#1']);
  });

  it('never groups a kind the server did not search', () => {
    const groups = hitGroups(['repository'], [hit('todo', 'todo:x/1')], {});
    expect(groups.map((g) => g.kind)).toEqual(['repository']);
  });

  it('falls back to the hits it has when the server sent no count', () => {
    const [group] = hitGroups(['todo'], [hit('todo', 'todo:x/1')], {});
    expect(group.total).toBe(1);
    expect(hiddenCount(group)).toBe(0);
  });
});

describe('hiddenCount', () => {
  it('is what the limit cut, never negative', () => {
    const hits = [hit('issue', 'issue:a#1')];
    expect(hiddenCount({ kind: 'issue', label: 'Issues', hits, total: 9 })).toBe(8);
    expect(hiddenCount({ kind: 'issue', label: 'Issues', hits, total: 0 })).toBe(0);
  });
});
