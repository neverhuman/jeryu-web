import { describe, expect, it } from 'vitest';

import type { Command } from '../../stores/commandStore';
import { pageHits, searchUrl } from '../search/searchModel';

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
